/**
 * Flatten an XML document into a `path → value` map, so two documents can be
 * compared value-by-value. Comparing tag/attribute *names* alone has passed
 * while values were being silently corrupted; this is the comparison the
 * round-trip test must use.
 *
 * Paths: `sound/osc1@type`, `sound/name#text`. Repeated siblings are indexed
 * by position among same-named siblings: `sound/patchCables/patchCable[1]@source`.
 * Index is omitted when a name occurs once, so common paths stay readable.
 */

export type FlatXML = Map<string, string>

export function flattenXML(xml: string): FlatXML {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new SyntaxError(`XML parse error: ${err.textContent?.trim()}`)
  const out: FlatXML = new Map()
  walk(doc.documentElement, doc.documentElement.tagName, out)
  return out
}

function walk(el: Element, path: string, out: FlatXML): void {
  for (const a of Array.from(el.attributes)) out.set(`${path}@${a.name}`, a.value)

  const text = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 /* TEXT */)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
  if (text) out.set(`${path}#text`, text)

  const counts = new Map<string, number>()
  for (const c of Array.from(el.children)) counts.set(c.tagName, (counts.get(c.tagName) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const c of Array.from(el.children)) {
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
