/**
 * Flatten an XML document into a `path → value` map, so two documents can be
 * compared value-by-value. Comparing tag/attribute *names* alone has passed
 * while values were being silently corrupted; this is the comparison the
 * round-trip test must use.
 *
 * Paths: `sound/osc1@type`. Repeated siblings are indexed by position among
 * same-named siblings: `sound/patchCables/patchCable[1]@source`. Index is
 * omitted when a name occurs once, so common paths stay readable.
 *
 * A value written as a leaf element (`<osc1><type>saw</type></osc1>`, the
 * pre-3.0 format) gets the same path as the attribute form, `sound/osc1@type`,
 * because the firmware reads the two identically and the generator writes
 * only the attribute form; a file in either format must compare equal to its
 * regenerated self. Top-level leaves (`<firmwareVersion>` beside `<sound>`)
 * become attributes of the one real root for the same reason. This walk is
 * deliberately independent of `parse.ts`: a parser bug must not be able to
 * hide by being applied to both sides.
 */

import { leafValue, ownText, parseDocument } from './dom'

export type FlatXML = Map<string, string>

export function flattenXML(xml: string): FlatXML {
  const tops = Array.from(parseDocument(xml).children)
  const roots = tops.filter((e) => leafValue(e) === undefined)
  if (roots.length !== 1) throw new SyntaxError(`expected one root element, found ${roots.length}`)
  const root = roots[0]
  const out: FlatXML = new Map()
  for (const t of tops) {
    const v = leafValue(t)
    if (v !== undefined) out.set(`${root.tagName}@${t.tagName}`, v)
  }
  walk(root, root.tagName, out)
  return out
}

function walk(el: Element, path: string, out: FlatXML): void {
  for (const a of Array.from(el.attributes)) out.set(`${path}@${a.name}`, a.value)

  // Only reachable for mixed content, which no Deluge file has.
  const text = ownText(el).trim()
  if (text) out.set(`${path}#text`, text)

  const leaves = new Map<Element, string>()
  const containers: Element[] = []
  for (const c of Array.from(el.children)) {
    const v = leafValue(c)
    if (v !== undefined) leaves.set(c, v)
    else containers.push(c)
  }
  for (const [c, v] of leaves) out.set(`${path}@${c.tagName}`, v)

  const counts = new Map<string, number>()
  for (const c of containers) counts.set(c.tagName, (counts.get(c.tagName) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const c of containers) {
    const i = seen.get(c.tagName) ?? 0
    seen.set(c.tagName, i + 1)
    const seg = (counts.get(c.tagName) ?? 0) > 1 ? `${c.tagName}[${i}]` : c.tagName
    walk(c, `${path}/${seg}`, out)
  }
}

export interface FlatDiff {
  missing: string[] // in expected, absent from actual
  added: string[] // in actual, absent from expected
  changed: Array<{ path: string; expected: string; actual: string }>
}

export function diffFlat(expected: FlatXML, actual: FlatXML): FlatDiff {
  const d: FlatDiff = { missing: [], added: [], changed: [] }
  for (const [p, v] of expected) {
    if (!actual.has(p)) d.missing.push(p)
    else if (actual.get(p) !== v) d.changed.push({ path: p, expected: v, actual: actual.get(p)! })
  }
  for (const p of actual.keys()) if (!expected.has(p)) d.added.push(p)
  return d
}

export const isClean = (d: FlatDiff): boolean =>
  d.missing.length === 0 && d.added.length === 0 && d.changed.length === 0
