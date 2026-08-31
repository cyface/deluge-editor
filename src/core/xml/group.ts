/**
 * Collapse a flattened diff's wholly-new and wholly-gone elements into one
 * entry each, so the Changes dock can say "Row 4 added" instead of listing a
 * built kit row's ~150 values line by line.
 *
 * A path groups under the shallowest ancestor element the other side knows
 * nothing about — no attribute or descendant of it at all. If every ancestor
 * exists over there, the path stays individual: it is a real per-value change
 * on a shared element. Nothing is hidden — a group carries every collapsed
 * path — and a group of one keeps its per-value row, where the value shows.
 *
 * Sibling indexes make this collapse pull double duty: `flatten.ts` indexes
 * repeated siblings by position, so adding one kit row shifts every later
 * row's paths and the raw diff drowns in false adds/removes. The shifted
 * rows' paths all land under element prefixes the source never had, so they
 * fold into per-row groups instead of thousands of lines.
 */

import type { FlatDiff, FlatXML } from './flatten'

export interface DiffGroup {
  /** The element every grouped path lives under, e.g. `kit/soundSources/sound[3]`. */
  prefix: string
  /** Every collapsed path, in document order. */
  paths: string[]
}

export interface GroupedFlatDiff {
  changed: FlatDiff['changed']
  /** Added values on elements both sides have. */
  added: string[]
  /** Removed values on elements both sides have. */
  missing: string[]
  /** Elements the source has nothing under: added whole. */
  addedGroups: DiffGroup[]
  /** Elements the output has nothing under: removed whole. */
  missingGroups: DiffGroup[]
}

/** The element path of a flat key, or null for a malformed one. */
const elementOf = (key: string): string | null => {
  const at = key.indexOf('@')
  const cut = at >= 0 ? at : key.indexOf('#')
  return cut < 0 ? null : key.slice(0, cut)
}

/** Every element path a map touches, ancestors included. */
function elementPaths(m: FlatXML): Set<string> {
  const out = new Set<string>()
  for (const key of m.keys()) {
    const el = elementOf(key)
    if (el === null) continue
    for (let i = el.indexOf('/'); i >= 0; i = el.indexOf('/', i + 1)) out.add(el.slice(0, i))
    out.add(el)
  }
  return out
}

function split(paths: readonly string[], other: Set<string>): { singles: string[]; groups: DiffGroup[] } {
  const singles: string[] = []
  const groups = new Map<string, DiffGroup>()
  for (const path of paths) {
    const el = elementOf(path)
    if (el === null) {
      singles.push(path)
      continue
    }
    let hit: string | null = other.has(el) ? null : el
    for (let i = el.indexOf('/'); i >= 0; i = el.indexOf('/', i + 1)) {
      const prefix = el.slice(0, i)
      if (!other.has(prefix)) {
        hit = prefix
        break
      }
    }
    if (hit === null) {
      singles.push(path)
      continue
    }
    const g = groups.get(hit)
    if (g) g.paths.push(path)
    else groups.set(hit, { prefix: hit, paths: [path] })
  }
  // A one-value element reads better as the value itself.
  const out: DiffGroup[] = []
  for (const g of groups.values()) {
    if (g.paths.length === 1) singles.push(g.paths[0])
    else out.push(g)
  }
  return { singles, groups: out }
}

export function groupFlatDiff(d: FlatDiff, expected: FlatXML, actual: FlatXML): GroupedFlatDiff {
  const a = split(d.added, elementPaths(expected))
  const m = split(d.missing, elementPaths(actual))
  return { changed: d.changed, added: a.singles, addedGroups: a.groups, missing: m.singles, missingGroups: m.groups }
}
