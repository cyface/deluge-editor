import type { XmlElement } from './element'

/**
 * Write an element tree the way the Deluge writes it, so that a file the
 * firmware saved comes back byte for byte and a file we save looks like one
 * the firmware saved.
 *
 * Layout, from `XMLSerializer` in `src/deluge/storage/Serializer.cpp`
 * (SynthstromAudible/DelugeFirmware `upstream/main` 3f898e95):
 * - `<?xml version="1.0" encoding="UTF-8"?>` then one element per line, tab
 *   indented, `\n` line ends, trailing newline (`StorageManager::createXMLFile`,
 *   `writeClosingTag`).
 * - `writeAttribute(name, value, onNewLine = true)`: an attribute goes on its
 *   own line one indent deeper than its tag, except the few call sites that
 *   pass `false`, which put it on the tag's line after a space. Which ones is
 *   `INLINE_ATTRS` below.
 * - An element with attributes and no children closes with ` />`
 *   (`closeTag`). One with children closes with `</tag>` on its own line.
 *   One with neither is written open/close on two lines, which is what
 *   `writeArrayStart`/`writeArrayEnding` produce for an empty list.
 * - Values are written raw — no XML escaping — and read raw. See `dom.ts`.
 */
export function serialize(roots: XmlElement[]): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>\n']
  for (const r of roots) writeElement(r, '', 0, out)
  return out.join('')
}

/**
 * Attributes the firmware writes on the tag's own line. Keyed by tag, or by
 * `parent/tag` where the same tag is laid out differently elsewhere.
 * Sources: `Sound::writeToFile` in `src/deluge/processing/sound/sound.cpp`
 * (LFOs, unison, mod knobs — a knob's `patchAmountFromSecondSource` is *not*
 * inline); `MIDIDrum::writeToFile` in `src/deluge/model/drum/midi_drum.cpp`
 * and `GateDrum::writeToFile` in `gate_drum.cpp` (kit rows: `name` on its
 * own line, then channel/note inline).
 */
const LFO = ['type', 'syncLevel', 'syncType'] as const
const INLINE_ATTRS: Record<string, readonly string[]> = {
  lfo1: LFO,
  lfo2: LFO,
  lfo3: LFO,
  lfo4: LFO,
  unison: ['num', 'detune', 'spread'],
  modKnob: ['controlsParam', 'patchAmountFromSource'],
  'soundSources/midiOutput': ['channel', 'note'],
  'soundSources/gateOutput': ['channel'],
}

function writeElement(el: XmlElement, parentTag: string, depth: number, out: string[]): void {
  const indent = '\t'.repeat(depth)
  const inline = INLINE_ATTRS[`${parentTag}/${el.tag}`] ?? INLINE_ATTRS[el.tag] ?? []
  let open = `${indent}<${el.tag}`
  let attrCount = 0
  for (const [name, value] of Object.entries(el.attrs)) {
    if (value === undefined) continue
    attrCount++
    open += inline.includes(name) ? ` ${name}="${value}"` : `\n${indent}\t${name}="${value}"`
  }
  if (el.children.length === 0) {
    out.push(attrCount > 0 ? `${open} />\n` : `${open}>\n${indent}</${el.tag}>\n`)
    return
  }
  out.push(`${open}>\n`)
  for (const c of el.children) writeElement(c, el.tag, depth + 1, out)
  out.push(`${indent}</${el.tag}>\n`)
}
