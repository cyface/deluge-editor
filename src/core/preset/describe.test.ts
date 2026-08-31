import { describe, expect, it } from 'vitest'
import type { FlatXML } from '../xml/flatten'
import { describeChangePath, describeChangeValue } from './describe'

describe('describeChangePath', () => {
  it('names defaultParams attributes like the knobs', () => {
    expect(describeChangePath('sound/defaultParams@lpfFrequency')).toBe('LPF Freq')
    expect(describeChangePath('sound/defaultParams@compressorThreshold')).toBe('Comp Threshold')
    expect(describeChangePath('sound/defaultParams/envelope1@attack')).toBe('Env 1 Attack')
    expect(describeChangePath('sound/defaultParams/equalizer@bassFrequency')).toBe('EQ Bass Freq')
  })

  it('names element attributes with their section', () => {
    expect(describeChangePath('sound/osc1@transpose')).toBe('Osc A Transpose')
    expect(describeChangePath('sound/lfo1@type')).toBe('LFO 1 Type')
    expect(describeChangePath('sound@lpfMode')).toBe('LPF Mode')
    expect(describeChangePath('sound/arpeggiator@numOctaves')).toBe('Arp Octaves')
    expect(describeChangePath('sound/unison@num')).toBe('Unison Voices')
    expect(describeChangePath('sound/audioCompressor@compHPF')).toBe('Compressor Side HPF')
  })

  it('names a patch cable by what it connects', () => {
    const ctx: FlatXML = new Map([
      ['sound/patchCables/patchCable[1]@source', 'lfo1'],
      ['sound/patchCables/patchCable[1]@destination', 'pitch'],
    ])
    expect(describeChangePath('sound/patchCables/patchCable[1]@amount', ctx)).toBe('LFO 1 → Pitch · Amount')
    expect(describeChangePath('sound/patchCables/patchCable[1]@polarity', ctx)).toBe('LFO 1 → Pitch · Polarity')
    // Without context the connection is unknown, not wrong.
    expect(describeChangePath('sound/patchCables/patchCable[1]@amount')).toBe('? → ? · Amount')
  })

  it('names a kit row by pad position', () => {
    expect(describeChangePath('kit/soundSources/sound[2]/defaultParams@lpfFrequency')).toBe('Row 3 LPF Freq')
  })
})

describe('describeChangeValue', () => {
  it('shows hex params as the menu numbers the knobs show', () => {
    // 0x00000000 is menu 25 on the standard 0–50 scale (scale.test.ts).
    expect(describeChangeValue('sound/defaultParams@lpfFrequency', '0x00000000')).toBe('25')
    expect(describeChangeValue('sound/defaultParams@pan', '0x00000000')).toBe('CTR')
    expect(describeChangeValue('sound/defaultParams/envelope1@attack', '0x80000000')).toBe('0')
  })

  it('shows a cable amount in hundredths, as the OLED prints it', () => {
    expect(describeChangeValue('sound/patchCables/patchCable[1]@amount', '0x00000000')).toBe('0.00')
  })

  it('shows enum strings as their control labels', () => {
    expect(describeChangeValue('sound/osc1@type', 'analogSaw')).toBe('Analog Saw')
    expect(describeChangeValue('sound/lfo1@type', 'sah')).toBe('Sample & Hold')
    expect(describeChangeValue('sound@lpfMode', '24dB')).toBe('24 dB Ladder')
    expect(describeChangeValue('sound@polyphonic', 'poly')).toBe('Poly')
    expect(describeChangeValue('sound/patchCables/patchCable[1]@destination', 'lpfFrequency')).toBe('LPF Freq')
  })

  it('leaves anything unrecognised verbatim', () => {
    expect(describeChangeValue('sound@name', 'DREAM')).toBe('DREAM')
    expect(describeChangeValue('sound/osc1@retrigPhase', '-1')).toBe('-1')
  })
})

describe('describeChangeValue for the sidechain and compressor stores', () => {
  it('shows sidechain rates as the 0–50 menu index', () => {
    // Default Synth.XML: attack="327244" is index 7, release="936" is 28.
    expect(describeChangeValue('sound/sidechain@attack', '327244')).toBe('7')
    expect(describeChangeValue('sound/sidechain@release', '936')).toBe('28')
  })
  it('shows compressor q31 values as the 0–127 knob position', () => {
    expect(describeChangeValue('sound/audioCompressor@attack', '83886080')).toBe('5')
    expect(describeChangeValue('sound/audioCompressor@compBlend', '2147483647')).toBe('128')
  })
})
