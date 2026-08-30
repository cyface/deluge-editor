import { leafValue, parseDocument } from './dom'
import { element, type XmlElement } from './element'

/**
 * Parse a Deluge XML file into an element tree (see `element.ts`).
 *
 * Both formats the firmware reads come out the same way. In the pre-3.0
 * format every value is a child element with text and the version elements
 * sit beside `<sound>`; here a leaf element becomes an attribute of its
 * parent, and top-level leaves become the first attributes of the first real
 * element — which is where the firmware has written them since 3.0. The
 * generator only writes the attribute format.
 *
 * Returns the file's top-level elements; a preset has exactly one.
 */
export function parseTree(xml: string): XmlElement[] {
  const top = fromDom(parseDocument(xml))
  if (top.children.length === 0) throw new SyntaxError('no element found')
  const first = top.children[0]
  first.attrs = { ...top.attrs, ...first.attrs }
  return top.children
}

function fromDom(dom: Element): XmlElement {
  const el = element(dom.tagName)
  for (const a of Array.from(dom.attributes)) el.attrs[a.name] = a.value
  for (const c of Array.from(dom.children)) {
    const leaf = leafValue(c)
    if (leaf !== undefined) el.attrs[c.tagName] = leaf
    else el.children.push(fromDom(c))
  }
  return el
}
