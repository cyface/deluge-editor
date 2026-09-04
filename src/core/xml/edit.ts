/**
 * Editing the tree without disturbing what the file already had.
 *
 * Assigning `el.attrs.x = v` is fine for an attribute the file has (it keeps
 * its place). For one the file lacks, plain assignment lands at the end,
 * which the firmware reads fine but which makes a re-saved file differ from
 * one the instrument would write. `setAttr` and `ensureChild` take the
 * writer's order (`src/core/preset/order.ts`) and insert at that position:
 * before the first existing key the firmware writes later. Keys not in the
 * order are left where they are and never used as anchors.
 */

import { element, type Attrs, type ChildMap, type XmlElement } from './element'

const position = (order: readonly string[] | undefined, key: string): number => {
  const i = order ? order.indexOf(key) : -1
  return i < 0 ? Infinity : i
}

/** Set an attribute; a new one is placed where the firmware would write it. */
export function setAttr(el: XmlElement, name: string, value: string, order?: readonly string[]): void {
  if (Object.hasOwn(el.attrs, name)) {
    el.attrs[name] = value
    return
  }
  const mine = position(order, name)
  const next: Attrs = {}
  let placed = false
  for (const [k, v] of Object.entries(el.attrs)) {
    const theirs = position(order, k)
    if (!placed && theirs !== Infinity && theirs > mine) {
      next[name] = value
      placed = true
    }
    next[k] = v
  }
  if (!placed) next[name] = value
  el.attrs = next
}

export function removeAttr(el: XmlElement, name: string): void {
  delete el.attrs[name]
}

/**
 * The first child with `tag`, created at the firmware's position if absent.
 * A created element starts with `attrs` (in the order given) and no children.
 */
export function ensureChild<C extends ChildMap, K extends keyof C & string>(
  parent: XmlElement<Attrs, C>,
  tag: K,
  order?: readonly string[],
  attrs: Attrs = {},
): C[K] {
  const existing = parent.children.find((c) => c.tag === tag)
  if (existing) return existing as C[K]
  const created = element(tag, { ...attrs }, [])
  insertChild(parent, created, order)
  return created as C[K]
}

/** Insert `child` before the first sibling the firmware writes after it, else at the end. */
export function insertChild(parent: XmlElement, child: XmlElement, order?: readonly string[]): void {
  const mine = position(order, child.tag)
  const at = parent.children.findIndex((c) => {
    const theirs = position(order, c.tag)
    return theirs !== Infinity && theirs > mine
  })
  if (at < 0) parent.children.push(child)
  else parent.children.splice(at, 0, child)
}

/**
 * Put `ordered` — some of `parent`'s children, in the order wanted — into the
 * slots those same children occupy now, so a sibling not in the list keeps
 * its place. `ordered` must hold each listed child exactly once.
 */
export function reorderChildren(parent: XmlElement, ordered: readonly XmlElement[]): void {
  const moving = new Set(ordered)
  let next = 0
  parent.children = parent.children.map((c) => (moving.has(c) ? ordered[next++] : c))
}

export function removeChild(parent: XmlElement, child: XmlElement): void {
  const i = parent.children.indexOf(child)
  if (i >= 0) parent.children.splice(i, 1)
}

/** Move the child at `from` to sit at `to`, shifting the ones between. */
export function moveChild(parent: XmlElement, from: number, to: number): void {
  const last = parent.children.length - 1
  if (from < 0 || from > last) return
  const dest = Math.max(0, Math.min(last, to))
  if (dest === from) return
  const [moved] = parent.children.splice(from, 1)
  parent.children.splice(dest, 0, moved)
}
