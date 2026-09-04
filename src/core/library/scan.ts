/**
 * Building the reference index from the card: walk `SONGS/`, `KITS/` and
 * `SYNTHS/`, read every `.XML` whose size or timestamp the previous index
 * doesn't already vouch for, and pull its sample paths out.
 *
 * Reading is the expensive part — a song can run to hundreds of kilobytes
 * and the link moves ~170 KB/s — so the previous index is the cache: a file
 * the listing reports at the same size, date and time is taken as unchanged.
 * Files the Deluge writes all carry the same 1969 timestamp (no clock), so
 * in practice the size is the detector; a rewrite to the same length that
 * only changes a path would slip past it, which is what "Rescan all" is for.
 */

import { decodeXml, joinPath, type CardFS } from './fs'
import { referencedPaths } from './refs'
import { PRESET_ROOTS, type IndexedFile, type ReferenceIndex } from './usages'

export interface ScanProgress {
  /** Listing folders, then reading the files that changed. */
  phase: 'listing' | 'reading'
  done: number
  total: number
  /** What is being listed or read right now. */
  path: string
}

const isXml = (name: string): boolean => /\.xml$/i.test(name)

/** Every XML file under `root`, with its listing entry; a missing root is empty. */
async function walk(fs: CardFS, root: string, onFolder: (path: string) => void): Promise<Omit<IndexedFile, 'refs'>[]> {
  const out: Omit<IndexedFile, 'refs'>[] = []
  const pending = [root]
  while (pending.length) {
    const dir = pending.shift()!
    onFolder(dir)
    let entries
    try {
      entries = await fs.list(dir)
    } catch {
      if (dir === root) return [] // a card without this root has nothing under it
      throw new Error(`could not list ${dir}`)
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const path = joinPath(dir, e.name)
      if (e.dir) pending.push(path)
      else if (isXml(e.name)) out.push({ path, size: e.size, date: e.date, time: e.time })
    }
  }
  return out
}

/**
 * The index for the card as it is now. `previous` is consulted per file and
 * never trusted for a file the listing no longer shows.
 */
export async function scanReferences(
  fs: CardFS,
  previous: ReferenceIndex = new Map(),
  onProgress?: (p: ScanProgress) => void,
): Promise<ReferenceIndex> {
  const found: Omit<IndexedFile, 'refs'>[] = []
  let listed = 0
  for (const root of PRESET_ROOTS) {
    found.push(...(await walk(fs, root, (path) => onProgress?.({ phase: 'listing', done: listed++, total: 0, path }))))
  }
  const index: ReferenceIndex = new Map()
  const stale = found.filter((f) => {
    const p = previous.get(f.path)
    if (p && p.size === f.size && p.date === f.date && p.time === f.time) {
      index.set(f.path, p)
      return false
    }
    return true
  })
  let done = 0
  for (const f of stale) {
    onProgress?.({ phase: 'reading', done, total: stale.length, path: f.path })
    const bytes = await fs.read(f.path)
    index.set(f.path, { ...f, refs: referencedPaths(decodeXml(bytes).text) })
    done++
  }
  onProgress?.({ phase: 'reading', done, total: stale.length, path: '' })
  // Path order, so a listing of usages reads the same whatever the walk order was.
  return new Map([...index.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
