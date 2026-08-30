import { describe, expect, it } from 'vitest'
import { parseTree } from './parse'

describe('parseTree', () => {
  it('keeps attribute and element order as written', () => {
    const [sound] = parseTree('<sound b="1" a="2"><osc2 type="saw" /><osc1 type="sine" /></sound>')
    expect(sound.tag).toBe('sound')
    expect(Object.keys(sound.attrs)).toEqual(['b', 'a'])
    expect(sound.children.map((c) => c.tag)).toEqual(['osc2', 'osc1'])
  })
  it('strips the declaration and a byte-order mark', () => {
    expect(parseTree('\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<kit firmwareVersion="c1.3.0" />')[0].tag).toBe('kit')
  })
  it('reads the pre-3.0 format: leaf elements become attributes in place', () => {
    const [sound] = parseTree(`<?xml version="1.0" encoding="UTF-8"?>
<firmwareVersion>2.0.0-beta</firmwareVersion>
<earliestCompatibleFirmware>2.0.0-beta</earliestCompatibleFirmware>
<sound>
	<osc1>
		<type>saw</type>
		<transpose>-12</transpose>
	</osc1>
	<polyphonic>poly</polyphonic>
	<midiKnobs>
	</midiKnobs>
	<name></name>
</sound>`)
    expect(Object.entries(sound.attrs)).toEqual([
      ['firmwareVersion', '2.0.0-beta'],
      ['earliestCompatibleFirmware', '2.0.0-beta'],
      ['polyphonic', 'poly'],
      ['name', ''],
    ])
    expect(sound.children).toEqual([
      { tag: 'osc1', attrs: { type: 'saw', transpose: '-12' }, children: [] },
      { tag: 'midiKnobs', attrs: {}, children: [] },
    ])
  })
  it('takes every ampersand literally, as the firmware writes and reads them', () => {
    const [s] = parseTree('<sound><osc1 fileName="SAMPLES/Drums & Perc/k.wav" /></sound>')
    expect(s.children[0].attrs.fileName).toBe('SAMPLES/Drums & Perc/k.wav')
    const [t] = parseTree('<sound><osc1 fileName="A &amp; B.wav" /></sound>')
    expect(t.children[0].attrs.fileName).toBe('A &amp; B.wav')
  })
  it('treats an element with nothing in it as an empty value, like <name></name>', () => {
    const [sound] = parseTree('<sound><name /><osc1 type="saw" /></sound>')
    expect(sound.attrs).toEqual({ name: '' })
    expect(sound.children.map((c) => c.tag)).toEqual(['osc1'])
  })
  it('throws on malformed XML and on an empty file', () => {
    expect(() => parseTree('<sound><osc1></sound>')).toThrow(SyntaxError)
    expect(() => parseTree('<?xml version="1.0"?>\n')).toThrow(SyntaxError)
  })
})
