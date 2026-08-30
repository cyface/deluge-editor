/**
 * The one place a Deluge file meets `DOMParser`. Both the parser and the
 * round-trip comparator go through here so they agree on what a file *is*,
 * while walking the result independently of each other.
 */

const WRAPPER = 'deluge-file'

/**
 * Parse a Deluge file and return a wrapper element whose children are the
 * file's top-level elements. Old files have several — `<firmwareVersion>` and
 * `<earliestCompatibleFirmware>` sit beside `<sound>`, which no XML parser
 * accepts as a document — so everything is parsed inside a synthetic root.
 *
 * The firmware neither escapes on write nor unescapes on read
 * (`XMLSerializer::writeAttribute` in `src/deluge/storage/Serializer.cpp`
 * writes the value verbatim; `XMLDeserializer` in `Deserializer.cpp` has no
 * entity handling), so every `&` in a Deluge file is a literal ampersand —
 * in a sample path, say. It is made one for the DOM parser here, which would
 * otherwise reject the file; the generator writes it back raw.
 */
export function parseDocument(xml: string): Element {
  const body = xml.replace(/^\uFEFF/, '').replace(/^\s*<\?xml[^>]*\?>/, '')
  const escaped = body.replace(/&/g, '&amp;')
  const doc = new DOMParser().parseFromString(`<${WRAPPER}>${escaped}</${WRAPPER}>`, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new SyntaxError(`XML parse error: ${err.textContent?.trim()}`)
  return doc.documentElement
}

/**
 * A value the file wrote as an element rather than an attribute: no
 * attributes, no child elements, and either text or nothing at all. The
 * firmware reads the two forms identically (`readTagOrAttributeValue`).
 * `<midiKnobs>\n\t</midiKnobs>` — whitespace only — is an empty container,
 * not a value, and returns `undefined`.
 */
export function leafValue(el: Element): string | undefined {
  if (el.attributes.length > 0 || el.children.length > 0) return undefined
  if (el.childNodes.length === 0) return ''
  const text = ownText(el)
  return text.trim() === '' ? undefined : text
}

export function ownText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 /* TEXT */)
    .map((n) => n.textContent ?? '')
    .join('')
}
