import type { Preset } from '../preset/types'
import { serialize } from './generate'
import { parseTree } from './parse'

export { diffFlat, flattenXML, isClean } from './flatten'
export type { FlatDiff, FlatXML } from './flatten'
export { child, childrenOf, cloneElement, element } from './element'
export type { Attrs, ChildMap, XmlElement } from './element'
export { ensureChild, insertChild, moveChild, removeAttr, removeChild, reorderChildren, setAttr } from './edit'
export { ensureAtPath, fillFromFlat, findAtPath, findElementAtPath, parseSegment } from './path'
export type { ElementRef, FlatRef, PathSegment } from './path'
export { groupFlatDiff } from './group'
export type { DiffGroup, GroupedFlatDiff } from './group'
export { parseTree } from './parse'
export { serialize } from './generate'

/**
 * Parse a Deluge synth (`<sound>`) or kit (`<kit>`) preset, in either the
 * pre-3.0 nested format or the current attribute format. Everything in the
 * file is kept; see `element.ts`.
 */
export function parseXML(xml: string): Preset {
  const roots = parseTree(xml)
  if (roots.length !== 1) throw new SyntaxError(`expected one root element, found ${roots.length}`)
  const root = roots[0]
  if (root.tag !== 'sound' && root.tag !== 'kit') throw new SyntaxError(`not a Deluge preset: <${root.tag}>`)
  return root as Preset
}

/** Write a preset in the current attribute format, laid out as the firmware lays it out. */
export function generateXML(preset: Preset): string {
  return serialize([preset])
}
