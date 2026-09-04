/**
 * Working out what note each sample in a folder was recorded at, so a folder
 * of WAVs can become a multi-sampled instrument.
 *
 * The Deluge answers this question with DSP: `Sample::determinePitch`
 * (`model/sample/sample.cpp:1269`) runs an FFT because the instrument cannot
 * read a filename as text and cannot ask anyone. We can do both, so there is
 * no pitch detector here. What we do take from the firmware is the part that
 * is knowledge rather than necessity:
 *
 * - the embedded root note, read the device's way (see `wav.ts`);
 * - its **discard rule** — if every file in the folder declares the *same*
 *   note, a lazy exporter tagged them all and the whole set is thrown away
 *   (`SampleBrowser::loadAllSamplesInFolder`, `sample_browser.cpp:1360`,
 *   upstream/community bef6d9df). On Tim's card this fires on about a third
 *   of the library, so it is load-bearing, not a nicety;
 *   filename order is the ordering truth (`:1471-1632`).
 *
 * Where we deliberately differ: the firmware silently drops a sample it can't
 * place. Here an unresolved row is flagged and the user assigns or excludes
 * it, and every row says where its answer came from.
 *
 * Roots are in cents throughout, the same unit `rootToTransposeCents` takes.
 */

import { compareNatural, stemOf } from '../library/fs'

/** Where a row's root came from, most trusted first. */
export type RootFrom = 'user' | 'file' | 'name' | 'between' | 'unknown'

export interface SampleFile {
  /** File name or path; only the basename is read for a note name. */
  name: string
  /** The root the WAV itself declares, in cents — `readWavInfo(…, { tags: true })`. */
  fileRoot?: number
}

export interface RootRow {
  name: string
  /** The resolved root in cents, absent when nothing could place the file. */
  root?: number
  from: RootFrom
  /** The note parsed out of the file name, in cents, before the folder's offset. */
  named?: number
}

export interface RootPlan {
  /** One row per file, in file-name order — the order the ranges will be built in. */
  rows: RootRow[]
  /** Semitones added to every note parsed from a file name. */
  offset: number
  /** Whether the offset was fitted against embedded roots, assumed, or set by the user. */
  offsetFrom: 'anchors' | 'assumed' | 'user'
  /** True when the whole folder declared one note and the set was discarded, as the device does. */
  discardedFileRoots: boolean
}

/**
 * A note name in a file name, as a MIDI note under the Deluge's own naming
 * (C3 = 60). Returns undefined when the name carries nothing that reads as a
 * note.
 *
 * The letter has to start a word, so `Bass` and `Grab2` don't offer up a B,
 * and the octave digits have to end one, so a velocity tag like `v127` can't
 * be read as a pitch. The *first* candidate wins: instruments are named
 * `<name> <note> <layer>` far more often than the reverse, and a trailing
 * `5b3` would otherwise read as B3.
 *
 * Even so, a name is never taken at face value — `resolveRoots` fits one
 * integer offset for the folder over whatever this returns. On Tim's card the
 * same parse is right at face value for about a third of the library:
 * Salamander names middle C as C4 and lands a uniform octave out, and there
 * are folders where a number that was never a note parses as one.
 */
export function parseNoteName(fileName: string): number | undefined {
  const m = /(?:^|[^A-Za-z#b])([A-Ga-g])([#sb]?)(-?\d{1,2})(?!\d)/.exec(stemOf(fileName))
  if (!m) return undefined
  const semitone = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] as number
  const accidental = m[2] === '' ? 0 : m[2] === 'b' ? -1 : 1
  const note = (Number(m[3]) + 2) * 12 + semitone + accidental
  return note >= 0 && note < 128 ? note * 100 : undefined
}

/**
 * File-name order, which is the order the ranges are built in. Numbers compare
 * as numbers so `A2` sorts before `A10`, which is what a person naming layers
 * means and what plain byte order gets wrong (`compareNatural`).
 */
const byFileName: (a: string, b: string) => number = compareNatural

/**
 * The device's suspicion, reproduced: more than one file, every one of them
 * declaring a root, and all the same. `commonMIDINote` starts unset, takes the
 * first file's value and is poisoned by any file that differs — including a
 * file with no root at all — so a folder where only some files are tagged
 * keeps the tags it has (`sample_browser.cpp:1355-1361`).
 */
export function discardsFileRoots(files: readonly SampleFile[]): boolean {
  if (files.length < 2) return false
  const first = files[0].fileRoot
  return first !== undefined && files.every((f) => f.fileRoot === first)
}

/**
 * One integer semitone offset for the whole folder, fitted where the files
 * themselves say what they are. The most common disagreement between a file's
 * own root and the note in its name wins; a tie goes to the smaller shift, so
 * a folder split evenly between 0 and +12 stays where it is rather than
 * jumping an octave on a coin toss.
 */
export function fitOffset(rows: readonly { named?: number; anchor?: number }[]): number {
  const votes = new Map<number, number>()
  for (const r of rows) {
    if (r.named === undefined || r.anchor === undefined) continue
    const semitones = Math.round((r.anchor - r.named) / 100)
    votes.set(semitones, (votes.get(semitones) ?? 0) + 1)
  }
  if (votes.size === 0) return 0
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0][0]
}

export interface ResolveOptions {
  /** Override the fitted offset, in semitones. */
  offset?: number
  /** Roots the user set by hand, in cents, keyed by the file's `name`. */
  overrides?: Readonly<Record<string, number>>
}

/**
 * The cascade: user override, then the file's own root, then its name read
 * through the folder's offset, then interpolation across a gap from the
 * neighbours that did resolve. What's left is flagged rather than dropped.
 */
export function resolveRoots(files: readonly SampleFile[], opts: ResolveOptions = {}): RootPlan {
  const sorted = [...files].sort((a, b) => byFileName(a.name, b.name))
  const discarded = discardsFileRoots(sorted)

  const parsed = sorted.map((f) => ({
    file: f,
    named: parseNoteName(f.name),
    anchor: discarded ? undefined : f.fileRoot,
  }))

  const fitted = fitOffset(parsed)
  const anchored = parsed.some((p) => p.named !== undefined && p.anchor !== undefined)
  const offset = opts.offset ?? fitted
  const offsetFrom = opts.offset !== undefined ? 'user' : anchored ? 'anchors' : 'assumed'

  const rows: RootRow[] = parsed.map(({ file, named, anchor }) => {
    const override = opts.overrides?.[file.name]
    if (override !== undefined) return { name: file.name, root: override, from: 'user', named }
    if (anchor !== undefined) return { name: file.name, root: anchor, from: 'file', named }
    if (named !== undefined) return { name: file.name, root: named + offset * 100, from: 'name', named }
    return { name: file.name, from: 'unknown', named }
  })

  fillGaps(rows)
  return { rows, offset, offsetFrom, discardedFileRoots: discarded }
}

/**
 * A file whose name says nothing sits between two that do. Spacing across the
 * gap is even, which is the firmware's own insight about folders — its sorted
 * list walks up in steps — minus the DSP it uses to confirm it. Rows outside
 * the outermost resolved pair stay unknown: there is nothing to interpolate
 * between, and guessing off the end is how the device ends up an octave out.
 */
function fillGaps(rows: RootRow[]): void {
  const known = rows.map((r, i) => (r.root === undefined ? -1 : i)).filter((i) => i >= 0)
  for (let k = 0; k + 1 < known.length; k++) {
    const [lo, hi] = [known[k], known[k + 1]]
    if (hi - lo < 2) continue
    const from = rows[lo].root as number
    const step = ((rows[hi].root as number) - from) / (hi - lo)
    for (let i = lo + 1; i < hi; i++) {
      rows[i].root = Math.round((from + step * (i - lo)) / 100) * 100
      rows[i].from = 'between'
    }
  }
}

/** The path above a sample's file name — `SAMPLES/Piano` for `SAMPLES/Piano/C3.wav`, `''` at the root. */
export const sampleFolder = (name: string): string => {
  const cut = name.lastIndexOf('/')
  return cut < 0 ? '' : name.slice(0, cut)
}

/** A folder's own answer, and which folder it is. */
export interface FolderPlan extends RootPlan {
  folder: string
}

/**
 * Resolve a set of files a folder at a time, for a caller holding samples that
 * did not all arrive together — re-detecting the roots of ranges a preset
 * already has (issue #33).
 *
 * Both of the things `resolveRoots` decides for a whole set are properties of
 * one folder: the discard rule asks whether *this library's* exporter tagged
 * every file the same, and the offset calibrates *this library's* naming
 * convention. Pooling two folders would let one library's tags poison the
 * other's answer. The multi-sampled oscillators surveyed on Tim's card each
 * draw from a single folder, so this changes nothing for them — it costs a Map
 * and removes the question for a preset whose ranges were pointed by hand.
 *
 * Folders come back in name order; the rows inside each stay in file-name
 * order, as `resolveRoots` returns them.
 */
export function resolveRootsByFolder(files: readonly SampleFile[], opts: ResolveOptions = {}): FolderPlan[] {
  const groups = new Map<string, SampleFile[]>()
  for (const file of files) {
    const folder = sampleFolder(file.name)
    const group = groups.get(folder)
    if (group) group.push(file)
    else groups.set(folder, [file])
  }
  return [...groups.keys()]
    .sort(byFileName)
    .map((folder) => ({ folder, ...resolveRoots(groups.get(folder) as SampleFile[], opts) }))
}
