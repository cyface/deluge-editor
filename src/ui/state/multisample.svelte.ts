/**
 * Building a multi-sampled synth from a folder of samples (issue #33).
 *
 * The flow is one question, one folder, and then the range editor: pick where
 * the samples are (this computer or the Deluge), pick the folder, and the
 * ranges are on the oscillator — no second panel, no commit step, because
 * nothing else in this editor has one and the version that did produced a
 * preset saved silent.
 *
 * What the import knows that the range editor can't work out for itself
 * survives as a `session` beside it: where each root came from
 * (`src/core/samples/roots.ts`), the folder offset it fitted, and the files it
 * could not place. The firmware drops those silently; here they are listed and
 * can be given a root by hand. Everything else afterwards is ordinary range
 * editing — including the offset, which becomes `shiftRanges` and so works on
 * any multi-sampled oscillator, imported or loaded from a card.
 *
 * The same reading runs the other way round as a **re-detect**: an oscillator
 * that already has ranges can have their roots worked out again from the files
 * they point at, shown as a proposal, and accepted or turned down. The
 * instrument cannot do this at all — its only route to the question is a
 * whole-folder re-import that deletes every range first — and it touches roots
 * only, never the boundaries between them.
 */

import { baseName as base, cardPath, joinPath, xmlPath } from '../../core/library'
import { buildMultisample, importZone, type ImportSample } from '../../core/preset/multisample'
import { OSC_ATTR_ORDER, SOUND_CHILD_ORDER } from '../../core/preset/order'
import {
  insertRange,
  rangeIndexAt,
  rootToTransposeCents,
  sampleRanges,
  setRangeRoot,
  shiftRanges,
  soundingOrder,
} from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import type { OscElement, Preset } from '../../core/preset/types'
import {
  resolveRoots,
  resolveRootsByFolder,
  type RootFrom,
  type RootRow,
  type SampleFile,
} from '../../core/samples/roots'
import { bufferReader, readWavInfo } from '../../core/samples/wav'
import { ensureChild, removeAttr, setAttr } from '../../core/xml/edit'
import { CONNECTING, NO_LONGER_LOADED, noWavs, UNREACHABLE } from '../copy'
import { Activity } from './activity.svelte'
import { card } from './card.svelte'
import { CardBrowser } from './cardbrowser.svelte'
import { editor } from './editor.svelte'
import { ranges } from './ranges.svelte'
import { samples } from './samples.svelte'
import {
  cleanFolder,
  count,
  importFileFrom,
  isWav,
  readEach,
  wavsOf,
  withSkipped,
  type ImportFile,
  type LocalSample,
} from './wavfiles'

export type { ImportFile }

/** A sample the import read but could not put on the keyboard. */
export interface LeftOut {
  file: ImportFile
  base: string
  /** Why it was left out, for the line that offers it back. */
  reason: 'no root' | 'no room'
  /** The note its name suggested, if any — the field's starting value. */
  named?: number
}

/**
 * Where a range's root came from, as the editor captions it. The cascade's own
 * answers, plus the one only a re-detect can give: a range the cascade could
 * not place keeps the root it already had, which is neither the cascade's
 * answer nor nothing at all.
 */
export type RangeRootFrom = RootFrom | 'kept'

/** What the last import or re-detect left beside the ranges it wrote. */
export interface ImportSession {
  which: 1 | 2
  /** Which gesture wrote these roots — the row says so, because the two mean different things. */
  kind: 'import' | 'redetect'
  folder: string | null
  /** fileName → where that range's root came from. */
  from: Record<string, RangeRootFrom>
  /** Semitones added to every root read from a file name. */
  offset: number
  offsetFrom: 'anchors' | 'assumed'
  /** True when the folder declared one note throughout and the tags were discarded. */
  discardedFileRoots: boolean
  leftOut: LeftOut[]
  placed: number
}

/** One range's before and after, in a re-detect the user hasn't accepted yet. */
export interface RedetectRow {
  /** Position in the oscillator's ranges, in sounding order. */
  index: number
  fileName: string
  base: string
  /** The root the range carries now, in cents. */
  was: number
  /** The root the cascade found, in cents; absent when nothing placed this file. */
  root?: number
  from: RangeRootFrom
}

/** What each folder's cascade decided, for the line that explains the proposal. */
export interface RedetectFolder {
  folder: string
  offset: number
  offsetFrom: 'anchors' | 'assumed'
  discardedFileRoots: boolean
}

/**
 * A re-detect waiting to be accepted. Nothing is written until `apply()`: the
 * whole point of doing this here rather than on the instrument is that the
 * device's only route is a whole-folder re-import that deletes every range
 * first, and this one can be looked at and turned down.
 */
export interface RedetectPlan {
  which: 1 | 2
  rows: RedetectRow[]
  folders: RedetectFolder[]
  /** How many rows would move. */
  changed: number
  /** Files whose header could not be read, so their range was left alone. */
  unreadable: string[]
  /** True when applying would leave the roots out of key order — the sign of a bad answer. */
  disordered: boolean
}

class MultisampleImport extends Activity {
  /** The oscillator the source prompt is open for, or null when it is closed. */
  asking = $state<1 | 2 | null>(null)
  /** What the last import left beside the ranges; the range editor shows it. Edited in place (`shift`, `assign`), so a deep `$state`. */
  private held = $state<ImportSession | null>(null)
  /** The preset those ranges are in: another one loaded, and the row is not about it. */
  private heldFor = $state.raw<Preset | null>(null)
  /** A re-detect read but not yet accepted, and the preset it was read for. */
  private heldPlan = $state.raw<RedetectPlan | null>(null)
  private planFor = $state.raw<Preset | null>(null)

  /**
   * The import's row, while the preset it wrote to is still the loaded one.
   * Provenance and left-out files are about particular ranges in a particular
   * preset; loading another one puts the row away rather than captioning
   * someone else's ranges with it.
   */
  readonly session = $derived<ImportSession | null>(this.held !== null && this.heldFor === editor.preset ? this.held : null)

  /** The re-detect on screen, while the preset it was read for is still loaded. */
  readonly plan = $derived<RedetectPlan | null>(this.heldPlan !== null && this.planFor === editor.preset ? this.heldPlan : null)

  /** The on-device folder browser, on this panel's busy line. */
  readonly browser = new CardBrowser(this)

  /** The preset the prompt was opened over; loading another closes it. */
  private opened = $state.raw<Preset | null>(null)
  /** The waveform the target had before we made it a sample oscillator, to put back. */
  private waveformWas: { which: 1 | 2; type: string | undefined } | null = null

  readonly open = $derived(this.asking !== null && editor.preset === this.opened)

  /** The oscillator being imported into, while its preset is still loaded. */
  private oscFor(which: 1 | 2 | null): OscElement | null {
    if (which === null || !editor.sound || editor.preset !== this.opened) return null
    return oscOf(editor.sound, which) ?? null
  }

  /**
   * Ask where the samples are. The oscillator becomes a sample oscillator now
   * — a multi-sample import has no other kind of target, and the panel and the
   * waveform should not disagree while the question is on screen — and goes
   * back to what it was if the question is dismissed without a folder.
   */
  start(which: 1 | 2): void {
    this.asking = which
    this.opened = editor.preset
    this.error = null
    this.notice = null
    this.cancelRedetect() // a folder replaces the ranges a pending proposal is about
    this.browser.close()
    const sound = editor.sound
    if (!sound) return
    const osc = ensureChild(sound, `osc${which}`, SOUND_CHILD_ORDER) as OscElement
    if (osc.attrs.type === 'sample') return
    this.waveformWas = { which, type: osc.attrs.type }
    setAttr(osc, 'type', 'sample', OSC_ATTR_ORDER)
  }

  /** Dismiss the source prompt, leaving the oscillator as it was found. */
  cancel(): void {
    const was = this.waveformWas
    this.waveformWas = null
    const osc = this.oscFor(was?.which ?? null)
    // A sample oscillator with no sample is silent on the instrument, which is
    // not what a dismissed question should leave behind.
    if (was && osc && osc.attrs.type === 'sample' && !osc.attrs.fileName && !sampleRanges(osc).length) {
      if (was.type === undefined) removeAttr(osc, 'type')
      else setAttr(osc, 'type', was.type, OSC_ATTR_ORDER)
    }
    this.asking = null
    this.browser.close()
  }

  /** Put the import's own row away; the ranges it wrote stay, as any edit does. */
  dismissSession(): void {
    this.held = null
    this.heldFor = null
  }

  // ---- sources ------------------------------------------------------------

  /** Read a dropped or picked folder of WAVs, keeping the bytes for the card push. */
  async addLocalFolder(folderName: string, picked: LocalSample[]): Promise<void> {
    const wavs = wavsOf(picked)
    if (this.asking === null) this.start(1)
    if (wavs.length === 0) {
      this.error = `${noWavs('that folder')} — a multi-sampled synth is built from WAV samples`
      return
    }
    await this.run(`Reading ${count(wavs.length, 'WAV header')}`, async () => {
      const folder = cleanFolder(folderName, 'Samples')
      const bytes = new Map<string, Uint8Array>()
      const { results: files, skipped } = await readEach(
        wavs,
        async ({ relPath, file }) => {
          const data = new Uint8Array(await file.arrayBuffer())
          const fileName = `SAMPLES/${folder}/${relPath}`
          const info = await readWavInfo(bufferReader(data), { tags: true })
          bytes.set(fileName, data)
          return importFileFrom(fileName, info)
        },
        (f) => f.relPath,
        (p) => (this.progress = p),
      )
      this.place(files, folder, bytes, skipped)
    })
  }

  /**
   * Take the WAVs in the browsed on-device folder. Their headers are read over
   * ranged reads — the audio itself never leaves the card, and neither does a
   * copy of it, so nothing needs pushing back afterwards.
   */
  async addCardFolder(): Promise<void> {
    const path = this.browser.path
    if (!path) return
    const wavs = this.browser.entries.filter((e) => !e.dir && isWav(e.name))
    if (wavs.length === 0) {
      this.error = noWavs(path)
      return
    }
    await this.run(`Reading ${count(wavs.length, 'WAV header')} from the card`, async () => {
      const { results: files, skipped } = await readEach(
        wavs,
        async ({ name }) => {
          const full = joinPath(path, name)
          return importFileFrom(xmlPath(full), await card.wavInfo(full, { tags: true }))
        },
        (e) => e.name,
        (p) => (this.progress = p),
      )
      this.place(files, base(path) || null, new Map(), skipped)
    })
  }

  // ---- the import itself --------------------------------------------------

  /**
   * Resolve the folder's root notes and write the ranges. The boundaries and
   * the zones are the firmware's own arithmetic (`core/preset/multisample.ts`);
   * what this adds is that a file it cannot place is kept and offered back
   * rather than dropped where nobody sees it.
   */
  private place(files: ImportFile[], folder: string | null, bytes: Map<string, Uint8Array>, skipped: readonly string[] = []): void {
    const which = this.asking
    const osc = this.oscFor(which)
    if (!osc || which === null) {
      this.error = NO_LONGER_LOADED
      return
    }
    const plan = resolveRoots(files.map((f) => ({ name: f.fileName, fileRoot: f.fileRoot })))
    const byName = new Map(files.map((f) => [f.fileName, f]))
    const chosen: ImportSample[] = []
    const leftOut: LeftOut[] = []
    const from: Record<string, RootFrom> = {}
    for (const row of plan.rows) {
      const file = byName.get(row.name) as ImportFile
      if (row.root === undefined) {
        leftOut.push({ file, base: base(row.name), reason: 'no root', named: row.named })
        continue
      }
      from[row.name] = row.from
      chosen.push({ ...file, root: row.root })
    }
    if (chosen.length === 0) {
      this.error = `Nothing in ${folder ?? 'that folder'} says what note it was recorded at — no embedded root note, no note in the file name`
      return
    }

    setAttr(osc, 'type', 'sample', OSC_ATTR_ORDER)
    const result = buildMultisample(osc, chosen)
    for (const fileName of result.crowdedOut) {
      leftOut.push({ file: byName.get(fileName) as ImportFile, base: base(fileName), reason: 'no room' })
      delete from[fileName]
    }
    // Every file the folder gave up, not only the ones that landed on the
    // keyboard: a left-out row can still be given a root by hand, and without
    // its bytes that range would save as a path the card never receives. The
    // stash only ever pushes what the preset actually references, so holding
    // the rest costs nothing but the memory the read already spent.
    if (bytes.size) {
      samples.hold(bytes)
      samples.folder ??= folder
    }

    this.cancelRedetect() // it was about ranges that no longer exist
    this.waveformWas = null // the waveform is earned now, not on loan
    this.heldFor = editor.preset
    this.held = {
      which,
      kind: 'import',
      folder,
      from,
      offset: plan.offset,
      offsetFrom: plan.offsetFrom === 'user' ? 'assumed' : plan.offsetFrom,
      discardedFileRoots: plan.discardedFileRoots,
      leftOut,
      placed: result.written,
    }
    this.asking = null
    this.browser.close()
    this.notice = withSkipped(`${count(result.written, 'range')} from ${folder ?? 'the folder'}`, skipped)
    ranges.open(which)
    void samples.checkMissing(card)
  }

  // ---- what the session offers afterwards ---------------------------------

  /**
   * Move the whole instrument by semitones. A sample library named against a
   * different middle C lands a uniform octave out, and this is the one control
   * that fixes every range at once — roots and boundaries together, so a split
   * moved by hand keeps its place.
   */
  shift(by: number): void {
    const osc = this.oscFor(this.session?.which ?? null)
    if (!osc || !this.session) return
    const applied = shiftRanges(osc, by)
    if (applied === 0) {
      this.notice = 'The ranges are already at the end of the keyboard'
      return
    }
    this.session.offset += applied
    this.notice = null
  }

  /**
   * Put a left-out sample on the keyboard at `note`, splitting whichever range
   * covers it — the instrument's own insert, so the boundaries stay legal.
   */
  assign(fileName: string, note: number): void {
    const osc = this.oscFor(this.session?.which ?? null)
    const entry = this.session?.leftOut.find((l) => l.file.fileName === fileName)
    if (!osc || !entry || !this.session) return
    const list = sampleRanges(osc)
    const index = rangeIndexAt(list, note)
    const spec = {
      fileName,
      zone: importZone(entry.file),
      ...rootToTransposeCents(note * 100),
    }
    const above = note >= Math.round((list[index]?.rootCents ?? 0) / 100)
    if (!insertRange(osc, index, above ? 'above' : 'below', spec)) {
      this.error = 'That key band is one note wide — move a split first to make room'
      return
    }
    const at = above ? index + 1 : index
    setRangeRoot(osc, at, note * 100)
    this.session.leftOut = this.session.leftOut.filter((l) => l.file.fileName !== fileName)
    this.session.from[fileName] = 'user'
    this.session.placed = sampleRanges(osc).length
    // A range the preset didn't reference a moment ago: whether the card has
    // that file is a fresh question, held bytes or not.
    void samples.checkMissing(card)
    ranges.select(at)
    this.error = null
  }

  /** Drop a left-out sample from the list: it was never meant to be a key range. */
  discard(fileName: string): void {
    if (this.session) this.session.leftOut = this.session.leftOut.filter((l) => l.file.fileName !== fileName)
  }

  // ---- re-detecting the roots of ranges already there ----------------------

  /**
   * Read the WAV headers behind a set of paths, from wherever this session can
   * reach them: the bytes it is already holding first, then the card, which it
   * connects to for the gesture as the folder browser does.
   *
   * A file neither route can read still comes back — by name, with no root, so
   * the cascade can read its name and the folder's discard check sees an
   * untagged file exactly as the firmware's does (`commonMIDINote` is poisoned
   * by a file with no root, `sample_browser.cpp:1355-1361`). Which ones they
   * were is returned too, because a proposal resting on names alone is a
   * weaker answer and should say so.
   */
  private async readTags(paths: readonly string[]): Promise<{ files: SampleFile[]; unreadable: string[] }> {
    if (paths.some((p) => !samples.bytes.has(p)) && !card.connected && card.supported) {
      this.step(CONNECTING)
      if (!(await card.ensureConnected())) this.notice = card.error ?? UNREACHABLE
    }
    const files: SampleFile[] = []
    const unreadable: string[] = []
    let done = 0
    for (const path of paths) {
      this.step(`Reading ${base(path)}`)
      const held = samples.bytes.get(path)
      try {
        if (!held && !card.connected) throw new Error('out of reach')
        const info = held ? await readWavInfo(bufferReader(held), { tags: true }) : await card.wavInfo(cardPath(path), { tags: true })
        files.push({ name: path, fileRoot: info.rootNote === undefined ? undefined : Math.round(info.rootNote * 100) })
      } catch {
        files.push({ name: path })
        unreadable.push(path)
      }
      this.progress = ++done / paths.length
    }
    return { files, unreadable }
  }

  /**
   * Work out again what note each of an oscillator's samples was recorded at,
   * and offer the answer rather than applying it.
   *
   * This is the flow's clearest advantage over doing it on the instrument: the
   * device's only route to the same question is a whole-folder re-import that
   * deletes every range first (`SampleBrowser::importFolderAsMultisamples`),
   * so a preset with hand-placed boundaries cannot be re-rooted there at all.
   *
   * The cascade is the import's, unchanged, and deliberately blind to the
   * roots already on the ranges: anchoring the folder's offset to them would
   * fit the answer to whatever is there and report "nothing to change" for
   * precisely the library that is uniformly an octave out — the case this
   * exists for. Where a folder has no anchor of its own the offset is assumed
   * and says so, and Shift all moves the lot afterwards.
   */
  async redetect(which: 1 | 2): Promise<void> {
    this.opened = editor.preset
    const osc = this.oscFor(which)
    const list = osc ? soundingOrder(sampleRanges(osc)) : []
    const paths = [...new Set(list.map((r) => r.fileName).filter((f): f is string => !!f))]
    if (!osc || paths.length === 0) {
      this.error = 'These ranges have no samples to read'
      return
    }
    await this.run(`Reading ${paths.length} WAV header${paths.length === 1 ? '' : 's'}`, async () => {
      const { files, unreadable } = await this.readTags(paths)
      const folders = resolveRootsByFolder(files)
      const found = new Map<string, RootRow>()
      for (const folder of folders) for (const row of folder.rows) found.set(row.name, row)

      // Position in sounding order, not `SampleRange.index`: that counts in
      // document order, and the writers index the normalised (sounded) list.
      const rows: RedetectRow[] = list.map((r, index) => {
        const row = r.fileName === undefined ? undefined : found.get(r.fileName)
        return {
          index,
          fileName: r.fileName ?? '',
          base: base(r.fileName ?? ''),
          was: r.rootCents,
          root: row?.root,
          from: row?.root === undefined ? 'kept' : row.from,
        }
      })
      const after = rows.map((r) => r.root ?? r.was)
      this.planFor = editor.preset
      this.heldPlan = {
        which,
        rows,
        folders: folders.map((f) => ({
          folder: f.folder,
          offset: f.offset,
          offsetFrom: f.offsetFrom === 'user' ? 'assumed' : f.offsetFrom,
          discardedFileRoots: f.discardedFileRoots,
        })),
        changed: rows.filter((r) => r.root !== undefined && r.root !== r.was).length,
        unreadable,
        // Roots that no longer climb with the keyboard are the shape of a bad
        // answer — a name misread, a folder whose offset was assumed — and are
        // worth saying before the instrument plays it.
        disordered: after.some((root, i) => i > 0 && root < after[i - 1]),
      }
    })
  }

  /** Turn the proposal down; the ranges were never touched. */
  cancelRedetect(): void {
    this.heldPlan = null
    this.planFor = null
  }

  /**
   * Accept it — roots only. Boundaries are never touched here: across the
   * presets on Tim's card the midpoint rule holds for 716 of 783 adjacent
   * pairs and every miss is a preset a human touched, so a boundary that
   * disagrees with the midpoint is a decision rather than a defect
   * (`src/core/preset/multisample.ts`). What is left behind is the same
   * provenance row an import leaves, so the table captions every root the same
   * way whichever gesture put it there.
   */
  applyRedetect(): void {
    const plan = this.plan
    const osc = this.oscFor(plan?.which ?? null)
    if (!plan || !osc) {
      this.error = NO_LONGER_LOADED
      this.cancelRedetect()
      return
    }
    const list = soundingOrder(sampleRanges(osc))
    // The ranges stay editable while the proposal is on screen, and a row that
    // no longer lines up would put a root on the wrong sample.
    if (list.length !== plan.rows.length || plan.rows.some((r, i) => (list[i].fileName ?? '') !== r.fileName)) {
      this.cancelRedetect()
      this.error = 'The ranges changed while that was on screen — read them again'
      return
    }
    const from: Record<string, RangeRootFrom> = {}
    let changed = 0
    for (const row of plan.rows) {
      if (row.fileName) from[row.fileName] = row.from
      if (row.root === undefined || row.root === row.was) continue
      if (setRangeRoot(osc, row.index, row.root)) changed++
    }
    const one = plan.folders.length === 1 ? plan.folders[0] : null
    this.heldFor = editor.preset
    this.held = {
      which: plan.which,
      kind: 'redetect',
      folder: one ? (one.folder.split('/').pop() ?? null) : null,
      from,
      offset: one?.offset ?? 0,
      offsetFrom: one?.offsetFrom ?? 'assumed',
      discardedFileRoots: plan.folders.some((f) => f.discardedFileRoots),
      leftOut: [],
      placed: changed,
    }
    this.cancelRedetect()
    this.notice =
      changed === 0
        ? 'every root already matched what the samples say'
        : `${changed} root${changed === 1 ? '' : 's'} changed`
  }

  /** Copy the locally sourced samples to the card now, rather than at save time — the shared push, on this panel's status line. */
  pushToCard(): Promise<void> {
    return card.pushSamples(this)
  }
}

export const multisample = new MultisampleImport()
