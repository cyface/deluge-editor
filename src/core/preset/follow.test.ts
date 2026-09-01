/**
 * Applying MIDI Follow CCs to Deluge-authored presets: the value lands on the
 * attribute the firmware writes it to, scaled the way the firmware scales it,
 * and nothing else in the file moves.
 */
import { describe, expect, it } from 'vitest'
import kitXml from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import oldXml from '../../../tests/fixtures/official-4.0.1/Attribute Format Baseline.XML?raw'
import synthXml from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML?raw'
import { INT32_MAX } from '../params/hex'
import { FOLLOW_GLOBAL_CC_C13, FOLLOW_SOUND_CC_C13 } from '../midi/follow'
import { diffFlat, flattenXML, generateXML, parseXML } from '../xml'
import type { KitElement, SoundElement } from './types'
import { KIT_FOLLOW_SLOTS, SOUND_FOLLOW_SLOTS, applyFollowCC, slotHex } from './follow'

const synth = () => parseXML(synthXml) as SoundElement
const kit = () => parseXML(kitXml) as KitElement

/** Apply by CC number, the way the store does. */
function sendSound(sound: SoundElement, cc: number, value: number): string {
  const name = FOLLOW_SOUND_CC_C13[cc]
  applyFollowCC(sound, SOUND_FOLLOW_SLOTS[name], value, false)
  return name
}
function sendKit(k: KitElement, cc: number, value: number): string {
  const name = FOLLOW_GLOBAL_CC_C13[cc]
  applyFollowCC(k, KIT_FOLLOW_SLOTS[name], value, true)
  return name
}

/** Paths whose value differs from the file as loaded. */
function changed(before: string, root: SoundElement | KitElement): string[] {
  const d = diffFlat(flattenXML(before), flattenXML(generateXML(root)))
  return [...d.changed.map((c) => c.path), ...d.added, ...d.missing].sort()
}

describe('a follow CC on a synth', () => {
  it('writes the parameter the firmware maps that CC to', () => {
    const s = synth()
    sendSound(s, 74, 127) // LPF frequency, full
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.lpfFrequency)).toBe('0x7FFFFFFF')
    expect(changed(synthXml, s)).toEqual(['sound/defaultParams@lpfFrequency'])
  })

  it('reaches an envelope stage inside <envelope1>', () => {
    const s = synth()
    sendSound(s, 73, 64) // env 1 attack, centre
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.env1Attack)).toBe('0x00000000')
    expect(changed(synthXml, s)).toEqual(['sound/defaultParams/envelope1@attack'])
  })

  // oscAPhaseWidth is written oscAPulseWidth, and is one of the three
  // parameters whose knob position maps through the half-precision form.
  it('renames a parameter to the attribute the file uses, and scales it', () => {
    const s = synth()
    const name = sendSound(s, 23, 0)
    expect(name).toBe('oscAPhaseWidth')
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.oscAPhaseWidth)).toBe('0x00000000')
    expect(changed(synthXml, s)).toEqual([])
    sendSound(s, 23, 127)
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.oscAPhaseWidth)).toBe('0x7FFFFFFF')
    expect(changed(synthXml, s)).toEqual(['sound/defaultParams@oscAPulseWidth'])
  })

  it('reaches the EQ inside <equalizer>', () => {
    const s = synth()
    sendSound(s, 86, 127) // bass
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.bass)).toBe('0x7FFFFFFF')
    expect(changed(synthXml, s)).toEqual(['sound/defaultParams/equalizer@bass'])
  })

  // Official 4.0.1 wrote two envelopes; retargeted at community firmware, a
  // follow CC for envelope 3 has to create the element the newer writer puts
  // between envelope2 and patchCables.
  it('creates a child element the file lacks, at the writer\'s position', () => {
    const s = parseXML(oldXml) as SoundElement
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.env3Sustain)).toBeUndefined()
    applyFollowCC(s, SOUND_FOLLOW_SLOTS.env3Sustain, 127, false)
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.env3Sustain)).toBe('0x7FFFFFFF')
    const out = generateXML(s)
    expect(out.indexOf('<envelope3')).toBeGreaterThan(out.indexOf('<envelope2'))
    expect(out.indexOf('<envelope3')).toBeLessThan(out.indexOf('<patchCables'))
    expect(changed(oldXml, s)).toEqual(['sound/defaultParams/envelope3@sustain'])
  })

  it('creates a missing flat attribute where the writer puts it', () => {
    const s = synth()
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.pitch)).toBeUndefined()
    sendSound(s, 3, 100) // pitch adjust
    const out = generateXML(s)
    // Sound::writeParamsToFile writes pitchAdjust after carrier2Feedback and
    // before oscAPitchAdjust; the file has neither, so modFXRate follows it.
    expect(out.indexOf('pitchAdjust=')).toBeGreaterThan(out.indexOf('carrier2Feedback='))
    expect(out.indexOf('pitchAdjust=')).toBeLessThan(out.indexOf('modFXRate='))
  })

  it('every mapped CC lands somewhere and touches exactly one value', () => {
    for (const cc of Object.keys(FOLLOW_SOUND_CC_C13).map(Number)) {
      const s = synth()
      sendSound(s, cc, 100)
      expect(changed(synthXml, s).length, `CC ${cc}`).toBeLessThanOrEqual(1)
      expect(slotHex(s, SOUND_FOLLOW_SLOTS[FOLLOW_SOUND_CC_C13[cc]]), `CC ${cc}`).toBeDefined()
    }
  })
})

describe('a follow CC on the kit bus', () => {
  it('reaches the bus filter inside <lpf>', () => {
    const k = kit()
    sendKit(k, 74, 0)
    expect(slotHex(k, KIT_FOLLOW_SLOTS.lpfFrequency)).toBe('0x80000000')
    expect(changed(kitXml, k)).toEqual(['kit/defaultParams/lpf@frequency'])
  })

  it('reaches the bus delay inside <delay>', () => {
    const k = kit()
    sendKit(k, 52, 127)
    expect(slotHex(k, KIT_FOLLOW_SLOTS.delayFeedback)).toBe('0x7FFFFFFF')
    expect(changed(kitXml, k)).toEqual(['kit/defaultParams/delay@feedback'])
  })

  // CC 61 has no sound parameter — on a kit it is the ducking amount.
  it('writes the ducking amount the file omits', () => {
    const k = kit()
    expect(slotHex(k, KIT_FOLLOW_SLOTS.sidechainCompressorVolume)).toBeUndefined()
    sendKit(k, 61, 127)
    expect(slotHex(k, KIT_FOLLOW_SLOTS.sidechainCompressorVolume)).toBe('0x7FFFFFFF')
    const out = generateXML(k)
    // GlobalEffectable::writeParamAttributesToFile: after pan, before the shape.
    expect(out.indexOf('sidechainCompressorVolume=')).toBeGreaterThan(out.indexOf('pan='))
    expect(out.indexOf('sidechainCompressorVolume=')).toBeLessThan(out.indexOf('sidechainCompressorShape='))
  })

  it('every mapped CC lands somewhere and touches exactly one value', () => {
    for (const cc of Object.keys(FOLLOW_GLOBAL_CC_C13).map(Number)) {
      const k = kit()
      sendKit(k, cc, 100)
      expect(changed(kitXml, k).length, `CC ${cc}`).toBeLessThanOrEqual(1)
      expect(slotHex(k, KIT_FOLLOW_SLOTS[FOLLOW_GLOBAL_CC_C13[cc]]), `CC ${cc}`).toBeDefined()
    }
  })
})

describe('the value stored is the instrument’s own', () => {
  // A gold encoder has 128 positions and the menu 51, so most mirrored values
  // sit between two menu steps. Storing the knob position's own int32 is what
  // lets a file saved here hold what the instrument holds.
  it('keeps knob positions the menu cannot express', () => {
    const s = synth()
    sendSound(s, 74, 100)
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.lpfFrequency)).toBe('0x48000000')
    sendSound(s, 74, 127)
    expect(slotHex(s, SOUND_FOLLOW_SLOTS.lpfFrequency)).toBe(`0x${(INT32_MAX >>> 0).toString(16).toUpperCase()}`)
  })
})
