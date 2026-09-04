/**
 * Map a flattened path (`flatten.ts` grammar) back onto the element tree, so
 * one entry of a diff can be edited — the Changes dock's per-change revert.
 * Only container elements appear as path segments (a leaf element was
 * flattened to an attribute, and `parse.ts` folded it into `attrs` the same
 * way), so walking `children` mirrors the flattener's walk exactly.
 */

import { element, type XmlElement } from './element'
import type { FlatXML } from './flatten'

export interface FlatRef {
  el: XmlElement
  attr: string
  /** The walk, root first and `el` last, so a caller can prune emptied containers. */
  lineage: XmlElement[]
}

export interface ElementRef {
  el: XmlElement
  lineage: XmlElement[]
}

const SEG = /^([^[\]]+)(?:\[(\d+)\])?$/

/** One path segment parsed: `sampleRange[2]` → tag `sampleRange`, index 2; a bare tag has no index. */
export interface PathSegment {
  tag: string
  index?: number
}

/** Parse one segment of a flattened path, or null when it isn't one. */
export function parseSegment(seg: string): PathSegment | null {
  const m = SEG.exec(seg)
  if (!m) return null
  return m[2] === undefined ? { tag: m[1] } : { tag: m[1], index: Number(m[2]) }
}

function walkElements(root: XmlElement, segs: string[], create: boolean): ElementRef | null {
  if (parseSegment(segs[0])?.tag !== root.tag) return null
  let el = root
  const lineage = [root]
  for (const s of segs.slice(1)) {
    const m = parseSegment(s)
    if (!m) return null
    const matches = el.children.filter((c) => c.tag === m.tag)
    const i = m.index ?? 0
    let next = matches[i]
    if (!next) {
      if (!create || i > matches.length) return null
      next = element(m.tag)
      el.children.push(next) // appended: value-correct; layout may differ until saved by a Deluge
    }
    el = next
    lineage.push(el)
  }
  return { el, lineage }
}

function walkTo(root: XmlElement, path: string, create: boolean): FlatRef | null {
  const at = path.lastIndexOf('@')
  if (at < 0) return null // '#text' paths: no Deluge file has mixed content
  const hit = walkElements(root, path.slice(0, at).split('/'), create)
  return hit ? { el: hit.el, attr: path.slice(at + 1), lineage: hit.lineage } : null
}

/** The element and attribute a flattened path names, or null when the tree lacks it. */
export const findAtPath = (root: XmlElement, path: string): FlatRef | null => walkTo(root, path, false)

/** Like `findAtPath`, but missing containers are created (appended) on the way down. */
export const ensureAtPath = (root: XmlElement, path: string): FlatRef | null => walkTo(root, path, true)

/** The element a flattened *element* path (no `@attr` part) names, or null. */
export const findElementAtPath = (root: XmlElement, path: string): ElementRef | null =>
  walkElements(root, path.split('/'), false)

/**
 * Rebuild `el` from a flattened map's entries under `prefix` — the restore
 * half of reverting a whole removed element. The map iterates in flatten
 * order (attributes first, then each child subtree, all in document order),
 * so plain assignment and appending reproduce the flattened document's
 * layout exactly.
 */
export function fillFromFlat(el: XmlElement, prefix: string, flat: FlatXML): void {
  for (const [p, v] of flat) {
    if (!p.startsWith(prefix)) continue
    const sep = p[prefix.length]
    if (sep === '@') {
      el.attrs[p.slice(prefix.length + 1)] = v
      continue
    }
    if (sep !== '/') continue // a longer sibling name, e.g. `sound[12]` under `sound[1]`
    const at = p.lastIndexOf('@')
    if (at < 0) continue
    const hit = walkElements(el, `${el.tag}/${p.slice(prefix.length + 1, at)}`.split('/'), true)
    if (hit) hit.el.attrs[p.slice(at + 1)] = v
  }
}
