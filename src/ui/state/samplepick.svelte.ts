/**
 * Choosing one sample — the single-sample half of the sample workflow, against
 * `multisample.svelte.ts`'s whole folder. Everything that points an oscillator
 * or one of its ranges at a file comes through here: a kit row's sample, a
 * synth's one sample, and the range editor's add / change / split.
 *
 * The question is the same one the folder import asks — on this computer, or
 * on the Deluge. A local file's bytes are kept so the sample can be previewed
 * now and copied to the card when the preset is saved; one already on the
 * Deluge is picked out in the card browser and confirmed with Select, then read
 * header-only and left where it lies. A kit row's dialog also offers the whole
 * folder, as new rows, through the caller's `onFolder`.
 *
 * Choosing is also where the instrument decides two things about the sample,
 * and both are the firmware's, not ours:
 *
 * - the repeat mode, set from the file just loaded unless the mode was already
 *   Loop or Stretch (`SampleBrowser::claimAudioFileForInstrument`,
 *   `sample_browser.cpp:975-999`, upstream/community bef6d9df) — the same rule
 *   the folder import uses, so it is `inferLoopMode` here too;
 * - the tuning, for a synth only: transpose and cents follow the note the
 *   sample was recorded at, folded into the nearest octave when it is the
 *   source's only range (`sample_browser.cpp:1034`, and
 *   `tuningForSamplePitch`). A kit row is the other half of that branch and
 *   gets no pitch at all — every hit on a drum sounds `kNoteForDrum`
 *   (`processing/sound/sound_drum.cpp:65`), so there is nothing to tune to.
 *
 * Where the note comes from is ours: the instrument runs an FFT because it
 * cannot read a file name, and we read the name (`src/core/samples/roots.ts`).
 * Nothing is written when neither the header nor the name says anything —
 * inventing C3 would silently retune a sample someone had already tuned.
 */

import { importZone, inferLoopMode, LOOP_MODE } from '../../core/preset/multisample'
import { OSC_ATTR_ORDER } from '../../core/preset/order'
import { isKit } from '../../core/preset'
import {
  addRange,
  insertRange,
  sampleRanges,
  setRangeFileName,
  setRangeTuning,
  setRangeZone,
  soundingOrder,
  tuningForSamplePitch,
} from '../../core/preset/ranges'
import type { OscElement, Preset } from '../../core/preset/types'
import { parseNoteName } from '../../core/samples/roots'
import { bufferReader, readWavInfo, type WavInfo } from '../../core/samples/wav'
import { isDirectory } from '../../core/sysex'
import { setAttr } from '../../core/xml/edit'
import { card } from './card.svelte'
import { editor } from './editor.svelte'
import { samples } from './samples.svelte'

/** Where the chosen sample goes. */
export type PickTarget =
  /** The oscillator's one sample: its first range, or its first range if it has none. */
  | { mode: 'only' }
  /** Replace an existing range's file. */
  | { mode: 'set'; index: number }
  /** A new range above every existing one. */
  | { mode: 'add' }
  /** Split a range, the new one on the given side of it. */
  | { mode: 'above' | 'below'; index: number }

export interface PickOptions {
  /** What the dialog says it is choosing for — a row name, or "Osc A". */
  label: string
  /** Default: the oscillator's one sample. */
  target?: PickTarget
  /** Told the index the sample landed on, so a caller's selection can follow it. */
  onDone?: (index: number) => void
  /**
   * Offered when the whole browsed folder is an answer too — a kit row's
   * dialog, where every WAV in it becomes a new row. Given the card path and
   * the entries listed there; the dialog closes once it has been handed over.
   */
  onFolder?: (path: string, entries: { name: string; dir: boolean }[]) => Promise<void> | void
}

const isWav = (name: string): boolean => /\.wav$/i.test(name)

/** A folder name FAT and the firmware are happy with, or `fallback` if nothing is left. */
const cleanFolder = (name: string, fallback: string): string => name.replace(/[\\/:*?"<>|]/g, '').trim() || fallback

class SamplePick {
  /** What the dialog is choosing for, e.g. a row name; null when it is closed. */
  for = $state<string | null>(null)

  busy = $state<string | null>(null)
  error = $state<string | null>(null)

  /** On-device browse: current path, null when the card browser is closed. */
  cardPath = $state<string | null>(null)
  cardEntries = $state<{ name: string; dir: boolean }[]>([])
  /** The WAV picked out in the browsed folder, waiting on Select; null when none is. */
  selected = $state<string | null>(null)

  private source: OscElement | null = null
  private target: PickTarget = { mode: 'only' }
  private onDone: ((index: number) => void) | null = null
  private onFolder: PickOptions['onFolder'] | null = null
  /** The preset the dialog was opened over; loading another closes it. */
  private opened: Preset | null = null
  /** Where the card browser was left, so the next pick starts there. */
  private lastPath = '/SAMPLES'

  readonly open = $derived(this.for !== null && editor.preset === this.opened)
  /** Whether the whole folder is on offer — only a kit row's dialog asks for it. */
  offersFolder = $state(false)
  /** Whether the browsed folder holds any WAV to take. */
  readonly folderHasWavs = $derived(this.cardEntries.some((e) => !e.dir && isWav(e.name)))

  /**
   * Ask where the sample is. The oscillator already exists: only a sample
   * oscillator is offered a file, so there is nothing to make here and a
   * question dismissed leaves nothing behind.
   */
  start(osc: OscElement, options: PickOptions): void {
    this.source = osc
    this.target = options.target ?? { mode: 'only' }
    this.onDone = options.onDone ?? null
    this.onFolder = options.onFolder ?? null
    this.offersFolder = this.onFolder !== null
    this.opened = editor.preset
    this.for = options.label
    this.error = null
    this.cardPath = null
    this.cardEntries = []
    this.selected = null
    // Already talking to a Deluge: show the card straight away rather than
    // making the choice twice.
    if (card.connected) void this.browseCard(this.lastPath)
  }

  cancel(): void {
    this.for = null
    this.source = null
    this.onDone = null
    this.onFolder = null
    this.offersFolder = false
    this.cardPath = null
    this.cardEntries = []
    this.selected = null
  }

  /**
   * A file from this computer: its header is read here and its bytes are kept,
   * so the sample can be previewed now and copied to the card with the preset.
   * The path it will carry follows the samples already in hand, and is moved
   * again to match wherever the preset is saved (`samples.retargetToSavePath`).
   */
  async useLocalFile(file: File): Promise<void> {
    if (!isWav(file.name)) {
      this.error = `${file.name} is not a .wav — the Deluge plays WAV samples`
      return
    }
    await this.run(`Reading ${file.name}`, async () => {
      const data = new Uint8Array(await file.arrayBuffer())
      const info = await readWavInfo(bufferReader(data), { tags: true })
      // Under the folder the samples in hand already use, else the preset's
      // own name, else straight into SAMPLES/ — saving moves it to match the
      // path the preset is saved to either way.
      const folder = samples.folder ?? cleanFolder(editor.fileName.replace(/\.xml$/i, ''), '')
      const fileName = folder ? `SAMPLES/${folder}/${file.name}` : `SAMPLES/${file.name}`
      if (!this.assign(fileName, info)) return
      samples.hold([[fileName, data]])
      if (folder) samples.folder ??= folder
    })
  }

  /**
   * Open (or navigate) the on-device browser, connecting first if the editor
   * isn't talking to a Deluge yet — the button is the gesture.
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
      this.lastPath = path
      this.cardEntries = entries.map((e) => ({ name: e.name, dir: isDirectory(e) }))
      this.selected = null
    })
  }

  cardUp(): void {
    if (!this.cardPath || this.cardPath === '/SAMPLES') return
    void this.browseCard(this.cardPath.slice(0, this.cardPath.lastIndexOf('/')) || '/SAMPLES')
  }

  /** A click in the card browser: enter a folder, or pick a file out for Select. */
  async chooseCard(entry: { name: string; dir: boolean }): Promise<void> {
    const path = this.cardPath
    if (!path) return
    if (entry.dir) {
      await this.browseCard(`${path === '/' ? '' : path}/${entry.name}`)
      return
    }
    if (isWav(entry.name)) this.selected = entry.name
  }

  /** Select: take the picked-out file. Header only — the audio stays on the card. */
  async useSelected(): Promise<void> {
    const path = this.cardPath
    const name = this.selected
    if (!path || !name) return
    const full = `${path === '/' ? '' : path}/${name}`
    await this.run(`Reading ${name}`, async () => {
      this.assign(full, await card.wavInfo(full, { tags: true }))
    })
  }

  /**
   * All samples in this folder: hand the browsed folder to the caller, which
   * turns its WAVs into new kit rows, and close — the rows are the answer,
   * not one file for the source this was opened for.
   */
  async useFolder(): Promise<void> {
    const path = this.cardPath
    const onFolder = this.onFolder
    if (!path || !onFolder || !this.folderHasWavs) return
    const entries = this.cardEntries
    this.cancel()
    await onFolder(path, entries)
  }

  /**
   * Point the target at the file, as the instrument does when a sample is
   * chosen: the whole file becomes the zone with the WAV's own loop points
   * folded in, the repeat mode follows unless it was Loop or Stretch, and on a
   * synth the tuning follows the note the sample was recorded at.
   */
  private assign(fileName: string, info: WavInfo | undefined): boolean {
    if (!this.source || editor.preset !== this.opened) {
      this.error = 'the preset this was for is no longer loaded'
      return false
    }
    const osc = this.source
    const name = fileName.replace(/^\/+/, '')
    const sample = {
      fileName: name,
      root: 0,
      frames: info?.frames,
      loopStart: info?.loopStart,
      loopEnd: info?.loopEnd,
      ms: info?.sampleRate ? (info.frames / info.sampleRate) * 1000 : undefined,
    }
    const zone = info ? importZone(sample) : { startSamplePos: 0, endSamplePos: 0 }
    setAttr(osc, 'type', 'sample', OSC_ATTR_ORDER)

    const target = this.target
    let at = 0
    let written = false
    if (target.mode === 'only') {
      const held = sampleRanges(osc).length > 0
      written = held ? setRangeFileName(osc, 0, name) && setRangeZone(osc, 0, zone) : addRange(osc, { fileName: name, zone })
    } else if (target.mode === 'set') {
      at = target.index
      written = setRangeFileName(osc, at, name) && setRangeZone(osc, at, zone)
    } else if (target.mode === 'add') {
      written = addRange(osc, { fileName: name, zone })
      at = sampleRanges(osc).length - 1
    } else {
      written = insertRange(osc, target.index, target.mode, { fileName: name, zone })
      at = target.mode === 'above' ? target.index + 1 : target.index
    }
    if (!written) {
      // The refusals left are a one-note range that can't be split, an
      // oscillator that can't hold a sample, and velocity-keyed ranges this
      // editor never rewrites; say which rather than doing nothing.
      this.error =
        target.mode === 'above' || target.mode === 'below'
          ? 'that range is one note wide — move a split first to make room'
          : 'this oscillator cannot hold a sample'
      return false
    }

    if (info) {
      const was = osc.attrs.loopMode
      if (was !== LOOP_MODE.loop && was !== LOOP_MODE.stretch) {
        setAttr(osc, 'loopMode', inferLoopMode([sample]), OSC_ATTR_ORDER)
      }
    }
    this.tune(osc, at, name, info)

    this.onDone?.(at)
    this.cancel()
    void samples.checkMissing()
    return true
  }

  /**
   * The synth half of the browser's branch: transpose and cents from the note
   * the sample was recorded at, the octave folded away when this is the only
   * range. The note is the one the file declares, else the one in its name;
   * with neither, the tuning already there is left as it is — a drum has no
   * pitch to follow at all.
   */
  private tune(osc: OscElement, at: number, fileName: string, info: WavInfo | undefined): void {
    if (editor.preset && isKit(editor.preset)) return
    const root = info?.rootNote !== undefined ? Math.round(info.rootNote * 100) : parseNoteName(fileName)
    if (root === undefined) return
    const only = soundingOrder(sampleRanges(osc)).length === 1
    const { transpose, cents } = tuningForSamplePitch(root, only)
    setRangeTuning(osc, at, transpose, cents)
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.error = null
    try {
      await fn()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.busy = null
    }
  }
}

export const samplePick = new SamplePick()
