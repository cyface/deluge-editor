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
 */

import { buildMultisample, importZone, type ImportSample } from '../../core/preset/multisample'
import { OSC_ATTR_ORDER, SOUND_CHILD_ORDER } from '../../core/preset/order'
import {
  insertRange,
  rangeIndexAt,
  rootToTransposeCents,
  sampleRanges,
  setRangeRoot,
  shiftRanges,
} from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import type { OscElement, Preset } from '../../core/preset/types'
import { resolveRoots, type RootFrom } from '../../core/samples/roots'
import { bufferReader, readWavInfo, type WavInfo } from '../../core/samples/wav'
import { isDirectory } from '../../core/sysex'
import { ensureChild, removeAttr, setAttr } from '../../core/xml/edit'
import { card } from './card.svelte'
import { editor } from './editor.svelte'
import { ranges } from './ranges.svelte'
import { samples } from './samples.svelte'

/** A file on its way in, with whatever its header declared. */
export interface ImportFile {
  /** The path the preset will store, e.g. `SAMPLES/Piano/C3.wav` — no leading slash. */
  fileName: string
  frames?: number
  loopStart?: number
  loopEnd?: number
  ms?: number
  /** The root the WAV itself declares, in cents. */
  fileRoot?: number
}

/** A sample the import read but could not put on the keyboard. */
export interface LeftOut {
  file: ImportFile
  base: string
  /** Why it was left out, for the line that offers it back. */
  reason: 'no root' | 'no room'
  /** The note its name suggested, if any — the field's starting value. */
  named?: number
}

/** What the last import left beside the ranges it wrote. */
export interface ImportSession {
  which: 1 | 2
  folder: string | null
  /** fileName → where that range's root came from. */
  from: Record<string, RootFrom>
  /** Semitones the import added to every root it read from a file name. */
  offset: number
  offsetFrom: 'anchors' | 'assumed'
  /** True when the folder declared one note throughout and the tags were discarded. */
  discardedFileRoots: boolean
  leftOut: LeftOut[]
  placed: number
}

const isWav = (name: string): boolean => /\.wav$/i.test(name)

/** A folder name FAT and the firmware are happy with; keeps the user's name otherwise. */
const cleanFolder = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Samples'

/** Everything the import needs out of a WAV header, in the units the build wants. */
const fileFrom = (fileName: string, info: WavInfo): ImportFile => ({
  fileName,
  frames: info.frames,
  loopStart: info.loopStart,
  loopEnd: info.loopEnd,
  ms: info.sampleRate ? (info.frames / info.sampleRate) * 1000 : undefined,
  fileRoot: info.rootNote === undefined ? undefined : Math.round(info.rootNote * 100),
})

class MultisampleImport {
  /** The oscillator the source prompt is open for, or null when it is closed. */
  asking = $state<1 | 2 | null>(null)
  /** What the last import left beside the ranges; the range editor shows it. */
  private held = $state<ImportSession | null>(null)
  /** The preset those ranges are in: another one loaded, and the row is not about it. */
  private heldFor: Preset | null = null

  /**
   * The import's row, while the preset it wrote to is still the loaded one.
   * Provenance and left-out files are about particular ranges in a particular
   * preset; loading another one puts the row away rather than captioning
   * someone else's ranges with it.
   */
  get session(): ImportSession | null {
    return this.heldFor === editor.preset ? this.held : null
  }

  busy = $state<string | null>(null)
  progress = $state(0)
  error = $state<string | null>(null)
  notice = $state<string | null>(null)

  /** On-device browse: current path, null when the card browser is closed. */
  cardPath = $state<string | null>(null)
  cardEntries = $state<{ name: string; dir: boolean }[]>([])

  /** The preset the prompt was opened over; loading another closes it. */
  private opened: Preset | null = null
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
    this.closeCardBrowser()
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
    this.closeCardBrowser()
  }

  /** Put the import's own row away; the ranges it wrote stay, as any edit does. */
  dismissSession(): void {
    this.held = null
    this.heldFor = null
  }

  // ---- sources ------------------------------------------------------------

  /** Read a dropped or picked folder of WAVs, keeping the bytes for the card push. */
  async addLocalFolder(folderName: string, picked: { relPath: string; file: File }[]): Promise<void> {
    const wavs = picked.filter((f) => isWav(f.relPath) && !f.relPath.split('/').pop()!.startsWith('.'))
    if (this.asking === null) this.start(1)
    if (wavs.length === 0) {
      this.error = 'no .wav files in that folder — a multi-sampled synth is built from WAV samples'
      return
    }
    await this.run(`Reading ${wavs.length} WAV header${wavs.length === 1 ? '' : 's'}`, async () => {
      const folder = cleanFolder(folderName)
      const files: ImportFile[] = []
      const bytes = new Map<string, Uint8Array>()
      let done = 0
      for (const { relPath, file } of wavs) {
        const data = new Uint8Array(await file.arrayBuffer())
        const fileName = `SAMPLES/${folder}/${relPath}`
        try {
          files.push(fileFrom(fileName, await readWavInfo(bufferReader(data), { tags: true })))
          bytes.set(fileName, data)
        } catch (e) {
          // a broken WAV is skipped, said out loud, and the rest still import
          this.notice = `${relPath}: ${e instanceof Error ? e.message : String(e)} — skipped`
        }
        this.progress = ++done / wavs.length
      }
      if (files.length === 0) throw new Error('none of the WAV files could be read')
      this.place(files, folder, bytes)
    })
  }

  /**
   * Open (or navigate) the on-device folder browser, connecting first if the
   * editor isn't talking to a Deluge yet — the button is the gesture, and
   * making the user find the preset panel to enable it is a puzzle, not a
   * safeguard.
   */
  async browseCard(path = '/SAMPLES'): Promise<void> {
    if (!card.connected) {
      this.busy = 'Connecting to the Deluge'
      this.error = null
      const ok = await card.ensureConnected()
      this.busy = null
      if (!ok) {
        this.error = card.error ?? 'could not reach the Deluge'
        return
      }
    }
    await this.run(`Reading ${path}`, async () => {
      const entries = await card.listPath(path)
      this.cardPath = path
      this.cardEntries = entries.map((e) => ({ name: e.name, dir: isDirectory(e) }))
    })
  }

  cardUp(): void {
    if (!this.cardPath || this.cardPath === '/SAMPLES') return
    void this.browseCard(this.cardPath.slice(0, this.cardPath.lastIndexOf('/')) || '/SAMPLES')
  }

  closeCardBrowser(): void {
    this.cardPath = null
    this.cardEntries = []
  }

  /**
   * Take the WAVs in the browsed on-device folder. Their headers are read over
   * ranged reads — the audio itself never leaves the card, and neither does a
   * copy of it, so nothing needs pushing back afterwards.
   */
  async addCardFolder(): Promise<void> {
    const path = this.cardPath
    if (!path) return
    const wavs = this.cardEntries.filter((e) => !e.dir && isWav(e.name))
    if (wavs.length === 0) {
      this.error = `no .wav files in ${path}`
      return
    }
    await this.run(`Reading ${wavs.length} WAV header${wavs.length === 1 ? '' : 's'} from the card`, async () => {
      const files: ImportFile[] = []
      let done = 0
      for (const { name } of wavs) {
        const full = `${path}/${name}`
        try {
          files.push(fileFrom(full.replace(/^\//, ''), await card.wavInfo(full, { tags: true })))
        } catch (e) {
          this.notice = `${name}: ${e instanceof Error ? e.message : String(e)} — skipped`
        }
        this.progress = ++done / wavs.length
      }
      if (files.length === 0) throw new Error('none of the WAV files could be read')
      this.place(files, path.split('/').pop() ?? null, new Map())
    })
  }

  // ---- the import itself --------------------------------------------------

  /**
   * Resolve the folder's root notes and write the ranges. The boundaries and
   * the zones are the firmware's own arithmetic (`core/preset/multisample.ts`);
   * what this adds is that a file it cannot place is kept and offered back
   * rather than dropped where nobody sees it.
   */
  private place(files: ImportFile[], folder: string | null, bytes: Map<string, Uint8Array>): void {
    const which = this.asking
    const osc = this.oscFor(which)
    if (!osc || which === null) {
      this.error = 'the preset this import was aimed at is no longer loaded'
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
      this.error = `nothing in ${folder ?? 'that folder'} says what note it was recorded at — no embedded root note, no note in the file name`
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

    this.waveformWas = null // the waveform is earned now, not on loan
    this.heldFor = editor.preset
    this.held = {
      which,
      folder,
      from,
      offset: plan.offset,
      offsetFrom: plan.offsetFrom === 'user' ? 'assumed' : plan.offsetFrom,
      discardedFileRoots: plan.discardedFileRoots,
      leftOut,
      placed: result.written,
    }
    this.asking = null
    this.closeCardBrowser()
    this.notice = `${result.written} range${result.written === 1 ? '' : 's'} from ${folder ?? 'the folder'}`
    ranges.open(which)
    void samples.checkMissing()
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
      this.notice = 'the ranges are already at the end of the keyboard'
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
      this.error = 'that key band is one note wide — move a split first to make room'
      return
    }
    const at = above ? index + 1 : index
    setRangeRoot(osc, at, note * 100)
    this.session.leftOut = this.session.leftOut.filter((l) => l.file.fileName !== fileName)
    this.session.from[fileName] = 'user'
    this.session.placed = sampleRanges(osc).length
    // A range the preset didn't reference a moment ago: whether the card has
    // that file is a fresh question, held bytes or not.
    void samples.checkMissing()
    ranges.select(at)
    this.error = null
  }

  /** Drop a left-out sample from the list: it was never meant to be a key range. */
  discard(fileName: string): void {
    if (this.session) this.session.leftOut = this.session.leftOut.filter((l) => l.file.fileName !== fileName)
  }

  /** Copy the locally sourced samples to the card now, rather than at save time. */
  async pushToCard(): Promise<void> {
    if (samples.pushable.length === 0) return
    await this.run('Connecting to the Deluge', async () => {
      // Same as the browse: the click is the gesture, so connect for it.
      if (!(await card.ensureConnected())) throw new Error(card.error ?? 'could not reach the Deluge')
      this.busy = 'Checking the card'
      const n = await samples.syncMissingToCard((label, p) => {
        this.busy = label
        this.progress = p
      })
      const risky = card.otherEditor ? ' — another editor is also on this Deluge and could overwrite them' : ''
      this.notice = n === 0 ? 'every sample is already on the card' : `${n} sample${n === 1 ? '' : 's'} written${risky}`
    })
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.progress = 0
    this.error = null
    this.notice = null
    try {
      await fn()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.busy = null
    }
  }
}

const base = (path: string): string => path.split('/').pop() ?? path

export const multisample = new MultisampleImport()
