import { describe, expect, it } from 'vitest'
import { MIDI_CHANNEL_MPE_LOWER_ZONE, MIDI_CHANNEL_MPE_UPPER_ZONE, MIDI_CHANNEL_NONE, midiOutputChannelLabel } from './midiout'

describe('midiOutputChannelLabel', () => {
  it('names the sentinels as definitions_cxx.hpp defines them', () => {
    expect(MIDI_CHANNEL_NONE).toBe(255)
    expect(MIDI_CHANNEL_MPE_LOWER_ZONE).toBe(16)
    expect(MIDI_CHANNEL_MPE_UPPER_ZONE).toBe(17)
    expect(midiOutputChannelLabel(255)).toBe('none')
    expect(midiOutputChannelLabel(16)).toBe('MPE lower')
    expect(midiOutputChannelLabel(17)).toBe('MPE upper')
  })
  it('shows a plain channel one-based, as the OutputMidiChannel menu does', () => {
    expect(midiOutputChannelLabel(0)).toBe('ch 1')
    expect(midiOutputChannelLabel(9)).toBe('ch 10')
    expect(midiOutputChannelLabel(15)).toBe('ch 16')
  })
})
