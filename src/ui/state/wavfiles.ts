/**
 * What the sample-reading stores share: which files count as WAVs, how a
 * folder name is made safe for the card, the shape of a file picked or
 * dropped from this computer, and the header-reading loop that skips a
 * broken file out loud and carries on. Plain TypeScript — no runes — so it
 * is importable from `dropdir.ts` and the components as well as the stores.
 */

import type { WavInfo } from '../../core/samples/wav'
import { NO_WAVS_READABLE } from '../copy'

/** A file on its way into a multi-sample import, with whatever its header declared. */
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

/** The Deluge plays WAV samples and lists nothing else in its sample browser. */
export const isWav = (name: string): boolean => /\.wav$/i.test(name)

/** A folder name FAT and the firmware are happy with; `fallback` when nothing usable is left. */
export const cleanFolder = (name: string, fallback: string): string => name.replace(/[\\/:*?"<>|]/g, '').trim() || fallback

/** A file from this computer — picked, dropped, or chosen in a dialog. */
export interface LocalSample {
  /** Path under the picked/dropped folder: `Kick.wav`, `sub/Kick.wav`. */
  relPath: string
  file: File
}

/** The WAVs among a folder's files, minus the `._*` sidecars a Mac leaves on a card. */
export const wavsOf = (files: readonly LocalSample[]): LocalSample[] =>
  files.filter((f) => isWav(f.relPath) && !(f.relPath.split('/').pop() ?? '').startsWith('.'))

/** Everything an import needs out of a WAV header, in the units the range builder wants. */
export const importFileFrom = (fileName: string, info: WavInfo): ImportFile => ({
  fileName,
  frames: info.frames,
  loopStart: info.loopStart,
  loopEnd: info.loopEnd,
  ms: info.sampleRate ? (info.frames / info.sampleRate) * 1000 : undefined,
  fileRoot: info.rootNote === undefined ? undefined : Math.round(info.rootNote * 100),
})

export interface ReadEachResult<R> {
  results: R[]
  /** `name: reason` for each item that could not be read. */
  skipped: string[]
}

/**
 * Read each item's header, reporting progress as a fraction. A broken file
 * is skipped and named, and the rest still load — a sample folder usually
 * has strays. Nothing readable at all is an error that names every reason.
 */
export async function readEach<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
  nameOf: (item: T) => string,
  onProgress: (fraction: number) => void,
): Promise<ReadEachResult<R>> {
  const results: R[] = []
  const skipped: string[] = []
  let done = 0
  for (const item of items) {
    try {
      results.push(await read(item))
    } catch (e) {
      skipped.push(`${nameOf(item)}: ${e instanceof Error ? e.message : String(e)}`)
    }
    onProgress(++done / items.length)
  }
  if (results.length === 0) throw new Error(`${NO_WAVS_READABLE} — ${skipped.join('; ')}`)
  return { results, skipped }
}

/** The skipped files, appended to a success notice so they are not lost behind it. */
export const withSkipped = (notice: string, skipped: readonly string[]): string =>
  skipped.length ? `${notice} · ${skipped.length} skipped: ${skipped.join('; ')}` : notice

/** "3 rows", "1 sample" — the count and its noun, pluralised. */
export const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`
