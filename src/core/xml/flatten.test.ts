import { describe, expect, it } from 'vitest'
import { diffFlat, flattenXML, isClean } from './flatten'

const src = `<?xml version="1.0" encoding="UTF-8"?>
<sound firmwareVersion="c1.3.0" polyphonic="poly">
  <osc1 type="saw" transpose="0" />
  <defaultParams lpfFrequency="0x7FFFFFFF" lpfResonance="0x80000000">
    <patchCables>
      <patchCable source="lfo1" destination="pitch" amount="0x19999999" />
      <patchCable source="envelope2" destination="lpfFrequency" amount="0x33333333" />
    </patchCables>
  </defaultParams>
  <name>Init</name>
</sound>`

describe('flattenXML', () => {
  const f = flattenXML(src)
  it('maps attributes, text, and nested elements to paths', () => {
    expect(f.get('sound@firmwareVersion')).toBe('c1.3.0')
    expect(f.get('sound/osc1@type')).toBe('saw')
    expect(f.get('sound/defaultParams@lpfResonance')).toBe('0x80000000')
    expect(f.get('sound/name#text')).toBe('Init')
  })
  it('indexes repeated siblings by position and leaves singletons unindexed', () => {
    expect(f.get('sound/defaultParams/patchCables/patchCable[0]@source')).toBe('lfo1')
    expect(f.get('sound/defaultParams/patchCables/patchCable[1]@destination')).toBe('lpfFrequency')
    expect(f.has('sound/osc1[0]@type')).toBe(false)
  })
  it('throws on malformed XML', () => {
    expect(() => flattenXML('<sound><osc1></sound>')).toThrow(SyntaxError)
  })
})

describe('diffFlat', () => {
  it('is clean for identical documents', () => {
    expect(isClean(diffFlat(flattenXML(src), flattenXML(src)))).toBe(true)
  })
  it('catches a changed value, not just a changed name', () => {
    const mutated = src.replace('0x19999999', '0x1999999A')
    const d = diffFlat(flattenXML(src), flattenXML(mutated))
    expect(d.changed).toEqual([
      {
        path: 'sound/defaultParams/patchCables/patchCable[0]@amount',
        expected: '0x19999999',
        actual: '0x1999999A',
      },
    ])
    expect(d.missing).toEqual([])
    expect(d.added).toEqual([])
  })
  it('catches a dropped attribute and an invented one', () => {
    const mutated = src.replace(' transpose="0"', ' detune="0"')
    const d = diffFlat(flattenXML(src), flattenXML(mutated))
    expect(d.missing).toEqual(['sound/osc1@transpose'])
    expect(d.added).toEqual(['sound/osc1@detune'])
  })
  it('catches a reordered pair of siblings as two changes, not silence', () => {
    const swapped = src
      .replace('source="lfo1"', 'source="TMP"')
      .replace('source="envelope2"', 'source="lfo1"')
      .replace('source="TMP"', 'source="envelope2"')
    const d = diffFlat(flattenXML(src), flattenXML(swapped))
    expect(d.changed.map((c) => c.path).sort()).toEqual([
      'sound/defaultParams/patchCables/patchCable[0]@source',
      'sound/defaultParams/patchCables/patchCable[1]@source',
    ])
  })
})
