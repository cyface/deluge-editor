/**
 * Which files on the card name which samples. The index is one record per
 * XML file under `SONGS/`, `KITS/` and `SYNTHS/` — the three folders the
 * firmware loads instruments and songs from — carrying the file's size and
 * FAT timestamp (so a rescan re-reads only what changed) and the distinct
 * sample paths it references.
 *
 * Everything asked of it is asked the card's way: case-insensitively, a
 * folder covering everything beneath it (`refs.ts`).
 */

import { xmlPath } from './fs'
import { refersTo, type TargetKind } from './refs'

export interface IndexedFile {
  /** Protocol form: `/SONGS/Live Set.XML`. */
  path: string
  size: number
  date: number
  time: number
  /** Distinct sample paths as the file spells them, file order. */
  refs: string[]
}

/** Keyed by path. */
export type ReferenceIndex = Map<string, IndexedFile>

export const PRESET_ROOTS = ['/SONGS', '/KITS', '/SYNTHS'] as const
export type PresetRoot = (typeof PRESET_ROOTS)[number]

/** The root folder a card path sits under, for the badge colour: `SONGS`, `KITS`, `SYNTHS`. */
export const rootOf = (path: string): string => xmlPath(path).split('/')[0]?.toUpperCase() ?? ''

/** The files that reference `target` — a sample, or anything under a folder — in path order. */
export function usagesOf(index: ReferenceIndex, target: string, kind: TargetKind): string[] {
  const out: string[] = []
  for (const f of index.values()) {
    if (f.refs.some((r) => refersTo(r, target, kind))) out.push(f.path)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** Usage counts for many targets at once — one pass over the index for a folder listing. */
export function usageCounts(
  index: ReferenceIndex,
  targets: readonly { path: string; kind: TargetKind }[],
): Map<string, number> {
  const counts = new Map<string, number>(targets.map((t) => [t.path, 0]))
  for (const f of index.values()) {
    for (const t of targets) {
      if (f.refs.some((r) => refersTo(r, t.path, t.kind))) counts.set(t.path, (counts.get(t.path) ?? 0) + 1)
    }
  }
  return counts
}

/** The index as plain data, for a cache; `fromJSON` takes it back. */
export const indexToJSON = (index: ReferenceIndex): IndexedFile[] => [...index.values()]

/** One cached record with every field the shape it was written in; anything else is dropped. */
const isIndexedFile = (f: unknown): f is IndexedFile =>
  typeof f === 'object' &&
  f !== null &&
  'path' in f &&
  typeof f.path === 'string' &&
  'size' in f &&
  typeof f.size === 'number' &&
  'date' in f &&
  typeof f.date === 'number' &&
  'time' in f &&
  typeof f.time === 'number' &&
  'refs' in f &&
  Array.isArray(f.refs) &&
  f.refs.every((r: unknown) => typeof r === 'string')

export function indexFromJSON(data: unknown): ReferenceIndex {
  const index: ReferenceIndex = new Map()
  if (!Array.isArray(data)) return index
  const records: readonly unknown[] = data
  for (const f of records) {
    if (isIndexedFile(f)) index.set(f.path, { path: f.path, size: f.size, date: f.date, time: f.time, refs: [...f.refs] })
  }
  return index
}
