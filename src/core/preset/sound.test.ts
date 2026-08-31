import { describe, expect, it } from 'vitest'
import { diffFlat, flattenXML, generateXML, parseXML } from '../xml'
import { isSound } from './index'
import {
  addCable,
  cableMenu,
  cables,
  cablesTo,
  ensureModKnobs,
  envelopeMenu,
  goldParams,
  modKnobs,
  paramMenu,
  removeCable,
  setCableMenu,
  setEnvelopeMenu,
  setModKnob,
  setParamMenu,
} from './sound'
import { removeChild } from '../xml/edit'
import type { SoundElement } from './types'

const fixtures = import.meta.glob<string>('../../../tests/fixtures/**/*.XML', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const load = (part: string): { src: string; sound: SoundElement } => {
  const key = Object.keys(fixtures).find((k) => k.includes(part))!
  const p = parseXML(fixtures[key])
  if (!isSound(p)) throw new Error('not a sound')
  return { src: fixtures[key], sound: p }
}

describe('reading', () => {
  it('reads params, envelopes and cables as the Deluge shows them', () => {
    const { sound } = load('Default Synth')
    expect(paramMenu(sound, 'lpfFrequency')).toBe(28)
    expect(paramMenu(sound, 'pan')).toBe(0)
    expect(paramMenu(sound, 'oscAPulseWidth')).toBe(0)
    expect(envelopeMenu(sound, 1, 'decay')).toBe(20)
    expect(envelopeMenu(sound, 2, 'sustain')).toBe(25)
    expect(cables(sound)).toHaveLength(6)
    expect(cablesTo(sound, 'volume')).toHaveLength(2)
    expect(cableMenu(cablesTo(sound, 'volume')[1])).toBe(5000)
    expect(goldParams(sound)).toContain('lpfFrequency')
    expect(goldParams(sound)).not.toContain('volumePostReverbSend') // patched from the sidechain
  })
  it('an omitted param reads as undefined, not a guess', () => {
    const { sound } = load('Attribute Format Baseline')
    expect(paramMenu(sound, 'waveFold')).toBeUndefined()
  })
})

describe('writing', () => {
  it('one knob change is exactly one changed value in the flattened diff', () => {
    const { src, sound } = load('Default Synth')
    setParamMenu(sound, 'lpfFrequency', 40)
    const d = diffFlat(flattenXML(src), flattenXML(generateXML(sound)))
    expect(d.missing).toEqual([])
    expect(d.added).toEqual([])
    expect(d.changed).toEqual([
      { path: 'sound/defaultParams@lpfFrequency', expected: '0x10000000', actual: '0x4CCCCCA8' },
    ])
  })
  it('an envelope stage writes as one changed value and reads back', () => {
    const { src, sound } = load('Default Synth')
    setEnvelopeMenu(sound, 1, 'decay', 33)
    expect(envelopeMenu(sound, 1, 'decay')).toBe(33)
    const d = diffFlat(flattenXML(src), flattenXML(generateXML(sound)))
    expect(d.missing).toEqual([])
    expect(d.added).toEqual([])
    expect(d.changed).toHaveLength(1)
    expect(d.changed[0].path).toBe('sound/defaultParams/envelope1@decay')
  })
  it('a param the file lacks is added where the firmware writes it', () => {
    const { sound } = load('Attribute Format Baseline')
    setParamMenu(sound, 'waveFold', 10)
    const keys = Object.keys(sound.children.find((c) => c.tag === 'defaultParams')!.attrs)
    // official 4.0.1 writes no community params, so waveFold lands last, after arpeggiatorGate
    expect(keys.at(-1)).toBe('waveFold')
    setParamMenu(sound, 'lpfMorph', 10)
    expect(keys.indexOf('waveFold')).toBeGreaterThan(-1)
    const keys2 = Object.keys(sound.children.find((c) => c.tag === 'defaultParams')!.attrs)
    expect(keys2.slice(-2)).toEqual(['lpfMorph', 'waveFold'])
  })
  it('reassigning a knob is exactly one changed value in the flattened diff', () => {
    const { src, sound } = load('Default Synth')
    setModKnob(sound, 3, { controlsParam: 'hpfFrequency' }) // stock: lpfFrequency
    const d = diffFlat(flattenXML(src), flattenXML(generateXML(sound)))
    expect(d.missing).toEqual([])
    expect(d.added).toEqual([])
    expect(d.changed).toEqual([
      { path: 'sound/modKnobs/modKnob[3]@controlsParam', expected: 'lpfFrequency', actual: 'hpfFrequency' },
    ])
    expect(goldParams(sound)).toContain('hpfFrequency')
  })
  it('a knob given a source writes attributes in serializer order; clearing it removes them', () => {
    const { src, sound } = load('Default Synth')
    setModKnob(sound, 11, { controlsParam: 'lfo1Rate', patchAmountFromSource: 'lfo2', patchAmountFromSecondSource: 'envelope1' })
    expect(Object.keys(modKnobs(sound)[11].attrs)).toEqual([
      'controlsParam', 'patchAmountFromSource', 'patchAmountFromSecondSource',
    ])
    setModKnob(sound, 11, { controlsParam: 'lfo1Rate' })
    expect(generateXML(sound)).toBe(src)
  })
  it('the volume family canonicalises by source, as ensureKnobReferencesCorrectVolume re-saves it', () => {
    const { sound } = load('Default Synth')
    setModKnob(sound, 1, { controlsParam: 'volume' })
    expect(modKnobs(sound)[1].attrs.controlsParam).toBe('volumePostFX')
    setModKnob(sound, 1, { controlsParam: 'volumePostFX', patchAmountFromSource: 'compressor' })
    expect(modKnobs(sound)[1].attrs.controlsParam).toBe('volumePostReverbSend')
    setModKnob(sound, 1, { controlsParam: 'volumePostReverbSend', patchAmountFromSource: 'lfo1' })
    expect(modKnobs(sound)[1].attrs.controlsParam).toBe('volume')
  })
  it('knob reassignments write exactly what the firmware re-saves (Gold Knob Reassigned fixture)', () => {
    // The fixture is the firmware's own re-save of these four reassignments
    // applied to the Default Synth (captured with the deluge-fixtures skill);
    // an unknown string would have been silently discarded and come back as
    // the stock assignment instead (sound.cpp:775, upstream/community bef6d9df).
    const { sound } = load('Default Synth')
    const { src: resaved } = load('Gold Knob Reassigned')
    setModKnob(sound, 3, { controlsParam: 'hpfFrequency' })
    setModKnob(sound, 1, { controlsParam: 'volumePostFX', patchAmountFromSource: 'lfo2' })
    setModKnob(sound, 11, { controlsParam: 'pitch', patchAmountFromSource: 'lfo1', patchAmountFromSecondSource: 'envelope1' })
    setModKnob(sound, 12, { controlsParam: 'noteProbability' })
    const d = diffFlat(flattenXML(resaved), flattenXML(generateXML(sound)))
    expect(d.missing).toEqual([])
    expect(d.added).toEqual([])
    // notePattern is random per firmware session (tests/fixtures/SOURCES.md).
    expect(d.changed.map((c) => c.path)).toEqual(['sound/arpeggiator@notePattern'])
  })
  it('a sound with no <modKnobs> gains the full stock 16 in serializer position on first edit', () => {
    const { src, sound } = load('Default Synth')
    removeChild(sound, sound.children.find((c) => c.tag === 'modKnobs')!)
    expect(modKnobs(sound)).toHaveLength(0)
    ensureModKnobs(sound)
    // The Default Synth's knobs are the firmware's constructor defaults, so
    // recreating the array from stock restores the file byte for byte.
    expect(generateXML(sound)).toBe(src)
  })
  it('adds and removes cables, dropping an empty <patchCables>', () => {
    const { src, sound } = load('Default Synth')
    const before = cables(sound).length
    const c = addCable(sound, 'lfo1', 'pitch', 500, 'bipolar')
    expect(cables(sound)).toHaveLength(before + 1)
    expect(Object.keys(c.attrs)).toEqual(['source', 'destination', 'polarity', 'amount'])
    expect(cableMenu(c)).toBe(500)
    setCableMenu(c, -1250)
    expect(cableMenu(c)).toBe(-1250)
    removeCable(sound, c)
    expect(generateXML(sound)).toBe(src)
    for (const x of [...cables(sound)]) removeCable(sound, x)
    expect(generateXML(sound)).not.toContain('patchCables')
  })
})
