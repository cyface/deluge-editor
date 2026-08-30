import { describe, expect, it } from 'vitest'
import { child, childrenOf, parseXML } from '../xml'
import { drumRows, isKit, isSound, OSC_TYPES, type OscType, type PatchSource } from '.'
import defaultSynth from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML?raw'
import kit from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import oldFm from '../../../tests/fixtures/official-2.x-old-format/Nested FM No Version.XML?raw'

describe('typed access', () => {
  const sound = parseXML(defaultSynth)
  it('narrows the preset kind', () => {
    expect(isSound(sound)).toBe(true)
    expect(isKit(sound)).toBe(false)
  })
  it('types attributes and children without casts', () => {
    if (!isSound(sound)) throw new Error('not a sound')
    const type: OscType | undefined = child(sound, 'osc1')?.attrs.type
    expect(type).toBe('saw')
    expect(OSC_TYPES).toContain(type)
    expect(child(sound, 'lfo2')?.attrs.type).toBe('triangle')
    const cables = childrenOf(child(child(sound, 'defaultParams')!, 'patchCables')!, 'patchCable')
    const source: PatchSource | undefined = cables[0].attrs.source
    expect(source).toBe('note')
    expect(cables).toHaveLength(6)
    expect(child(sound, 'defaultParams')?.attrs.volume).toBe('0x50000000')
    expect(child(sound, 'sidechain')?.attrs.attack).toBe('327244')
  })
  it('lists kit rows in pad order', () => {
    const k = parseXML(kit)
    if (!isKit(k)) throw new Error('not a kit')
    expect(k.attrs.currentFilterType).toBe('lpf')
    expect(drumRows(k).map((r) => r.attrs.name)).toEqual(['KICK', 'SNARE', 'HATC', 'HATO', 'CRAS'])
    const row = drumRows(k)[0]
    if (row.tag !== 'sound') throw new Error('not a sound row')
    expect(child(row, 'osc1')?.attrs.type).toBe('sample')
    expect(child(child(row, 'osc1')!, 'zone')?.attrs.startSamplePos).toBe('0')
  })
  it('reads an old-format FM preset through the same types', () => {
    const s = parseXML(oldFm)
    if (!isSound(s)) throw new Error('not a sound')
    expect(s.attrs.firmwareVersion).toBeUndefined()
    expect(s.attrs.mode).toBe('fm')
    expect(child(s, 'modulator2')?.attrs.toModulator1).toBe('0')
    expect(child(s, 'osc1')?.attrs.type).toBe('sine')
  })
})
