import { describe, expect, it } from 'vitest'
import { diffFlat, flattenXML, generateXML, parseXML } from '../xml'
import { isSound } from './index'
import {
  addCable,
  cableMenu,
  cables,
  cablesTo,
  envelopeMenu,
  goldParams,
  paramMenu,
  removeCable,
  setCableMenu,
  setParamMenu,
} from './sound'
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
