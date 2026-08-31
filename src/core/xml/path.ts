/**
 * Map a flattened path (`flatten.ts` grammar) back onto the element tree, so
 * one entry of a diff can be edited — the Changes dock's per-change revert.
 * Only container elements appear as path segments (a leaf element was
 * flattened to an attribute, and `parse.ts` folded it into `attrs` the same
 * way), so walking `children` mirrors the flattener's walk exactly.
 */

import { element, type XmlElement } from './element'

export interface FlatRef {
  el: XmlElement
  attr: string
  /** The walk, root first and `el` last, so a caller can prune emptied containers. */
  lineage: XmlElement[]
}

const SEG = /^([^[\]]+)(?:\[(\d+)\])?$/

function walkTo(root: XmlElement, path: string, create: boolean): FlatRef | null {
  const at = path.lastIndexOf('@')
  if (at < 0) return null // '#text' paths: no Deluge file has mixed content
  const attr = path.slice(at + 1)
  const segs = path.slice(0, at).split('/')
  if (SEG.exec(segs[0])?.[1] !== root.tag) return null
  let el = root
  const lineage = [root]
  for (const s of segs.slice(1)) {
    const m = SEG.exec(s)
    if (!m) return null
    const matches = el.children.filter((c) => c.tag === m[1])
    const i = m[2] === undefined ? 0 : Number(m[2])
    let next = matches[i]
    if (!next) {
      if (!create || i > matches.length) return null
      next = element(m[1])
      el.children.push(next) // appended: value-correct; layout may differ until saved by a Deluge
    }
    el = next
    lineage.push(el)
  }
  return { el, attr, lineage }
}

/** The element and attribute a flattened path names, or null when the tree lacks it. */
export const findAtPath = (root: XmlElement, path: string): FlatRef | null => walkTo(root, path, false)

/** Like `findAtPath`, but missing containers are created (appended) on the way down. */
export const ensureAtPath = (root: XmlElement, path: string): FlatRef | null => walkTo(root, path, true)
