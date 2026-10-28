/**
 * Finding a missing sample somewhere else on the card: a kit whose folder
 * was moved or flattened names `SAMPLES/A/B/kick.wav` while the file sits at
 * `SAMPLES/A/B/B/kick.wav`. The search looks for the same file name (FAT
 * compares names case-insensitively), nearest first — the missing file's own
 * folder and everything under it, then its parent's, and so on up to
 * `SAMPLES/` — so the copy that turns up first is the likeliest, and a
 * search that finds everything stops before it lists the whole card.
 *
 * Listing is the cost (one SysEx round trip per folder), so every folder is
 * listed at most once per search and the search stops after `maxFolders`.
 */

import { isNotFound, joinPath, parentOf } from './fs'
import { SAMPLES_ROOT } from './move'

/** What the search needs of a listing: names, and which are folders. */
export type ListDir = (path: string) => Promise<readonly { name: string; dir: boolean }[]>

export interface LocateProgress {
  /** Folders listed so far. */
  listed: number
  /** The folder being listed now. */
  path: string
}

export interface LocateResult {
  /** Missing card path → the card paths holding a file of the same name, nearest first. */
  found: Map<string, string[]>
  /** The folder budget ran out before every scope was searched. */
  truncated: boolean
}

const fileOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).toLowerCase()

/** The scopes to search for one path, nearest first, never above `SAMPLES/` (or the path's top folder). */
function scopes(path: string): string[] {
  const out: string[] = []
  const top = path.toLowerCase().startsWith(`${SAMPLES_ROOT.toLowerCase()}/`) ? SAMPLES_ROOT : path.split('/').slice(0, 2).join('/') || '/'
  let dir = parentOf(path)
  for (;;) {
    out.push(dir)
    if (dir.toLowerCase() === top.toLowerCase() || dir === '/' || dir === '') break
    dir = parentOf(dir)
  }
  return out
}

/**
 * Look for each of `missing` (card paths, `/SAMPLES/…`) elsewhere on the
 * card. A folder that does not exist lists as empty; any other listing error
 * is thrown, because a search that skipped folders would report "not found"
 * for files it never looked at.
 */
export async function locateSamples(
  list: ListDir,
  missing: readonly string[],
  { maxFolders = 400, onProgress }: { maxFolders?: number; onProgress?: (p: LocateProgress) => void } = {},
): Promise<LocateResult> {
  const listings = new Map<string, readonly { name: string; dir: boolean }[]>()
  /** Lowercase file name → every path seen holding it, in the order seen. */
  const seen = new Map<string, string[]>()
  let truncated = false

  const listing = async (dir: string) => {
    const key = dir.toLowerCase()
    let entries = listings.get(key)
    if (entries) return entries
    if (listings.size >= maxFolders) {
      truncated = true
      return null
    }
    onProgress?.({ listed: listings.size, path: dir })
    try {
      entries = await list(dir)
    } catch (e) {
      if (!isNotFound(e)) throw e
      entries = []
    }
    listings.set(key, entries)
    for (const e of entries) {
      if (e.dir) continue
      const path = joinPath(dir, e.name)
      const name = e.name.toLowerCase()
      seen.set(name, [...(seen.get(name) ?? []), path])
    }
    return entries
  }

  /**
   * Breadth-first under `root`, stopping once `done()` says there is nothing
   * left to find. A wider scope walks a narrower one's folders again, but
   * from the listings already held: only folders not yet listed cost a trip.
   */
  const walk = async (root: string, done: () => boolean) => {
    const pending = [root]
    while (pending.length && !done()) {
      const dir = pending.shift()!
      const entries = await listing(dir)
      if (!entries) return
      for (const e of entries) if (e.dir && !e.name.startsWith('.')) pending.push(joinPath(dir, e.name))
    }
  }

  const elsewhere = (path: string) => (seen.get(fileOf(path)) ?? []).filter((p) => p.toLowerCase() !== path.toLowerCase())
  const found = new Map<string, string[]>()
  for (const path of missing) {
    if (found.has(path)) continue
    for (const scope of scopes(path)) {
      if (elsewhere(path).length || truncated) break
      await walk(scope, () => elsewhere(path).length > 0)
    }
    found.set(path, elsewhere(path))
  }
  // A later search can turn up copies an earlier path's search had stopped short of.
  for (const path of missing) found.set(path, elsewhere(path))
  for (const [path, hits] of found) if (hits.length === 0) found.delete(path)
  return { found, truncated }
}
