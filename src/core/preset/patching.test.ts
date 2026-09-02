import { describe, expect, it } from 'vitest'
import initSynth from '../../assets/templates/Default Synth.XML?raw'
import { parseXML } from '../xml'
import { child } from '../xml/element'
import { setAttr } from '../xml/edit'
import { LFO_ATTR_ORDER, SOUND_ATTR_ORDER } from './order'
import { GLOBAL_SOURCES, MAX_PATCH_CABLES, cableAllowed } from './patching'
import { PATCHED_GLOBAL_PARAMS, PATCHED_LOCAL_PARAMS } from './params'
import type { SoundElement } from './types'

const sound = (): SoundElement => parseXML(initSynth) as SoundElement

describe('cableAllowed', () => {
  it('refuses a per-voice source into a per-sound param', () => {
    const s = sound()
    // "Can't patch local source to global param" (sound.cpp:1341).
    for (const dest of PATCHED_GLOBAL_PARAMS) {
      expect(cableAllowed(s, 'envelope2', dest), dest).toBe(false)
      expect(cableAllowed(s, 'velocity', dest), dest).toBe(false)
    }
    // The three global sources may, where nothing else refuses them.
    expect(GLOBAL_SOURCES).toEqual(['lfo1', 'lfo3', 'compressor'])
    expect(cableAllowed(s, 'lfo1', 'reverbAmount')).toBe(true)
    expect(cableAllowed(s, 'lfo3', 'modFXDepth')).toBe(true)
  })

  it('refuses everything into post-FX volume', () => {
    const s = sound()
    for (const source of ['lfo1', 'lfo3', 'compressor', 'velocity'] as const) {
      expect(cableAllowed(s, source, 'volumePostFX')).toBe(false)
    }
  })

  it('lets only the sidechain reach the post-reverb volume', () => {
    const s = sound()
    expect(cableAllowed(s, 'compressor', 'volumePostReverbSend')).toBe(true)
    expect(cableAllowed(s, 'lfo1', 'volumePostReverbSend')).toBe(false)
  })

  it('keeps the envelopes and the sidechain off the voice volume', () => {
    const s = sound()
    for (const source of ['envelope1', 'envelope2', 'envelope3', 'envelope4', 'compressor'] as const) {
      expect(cableAllowed(s, source, 'volume'), source).toBe(false)
    }
    expect(cableAllowed(s, 'velocity', 'volume')).toBe(true)
    expect(cableAllowed(s, 'lfo2', 'volume')).toBe(true)
  })

  it('refuses MPE X into pitch, which the firmware wires itself', () => {
    const s = sound()
    expect(cableAllowed(s, 'x', 'pitch')).toBe(false)
    expect(cableAllowed(s, 'y', 'pitch')).toBe(true)
  })

  it('refuses `note` on a kit row', () => {
    const s = sound()
    expect(cableAllowed(s, 'note', 'lpfFrequency')).toBe(true)
    expect(cableAllowed(s, 'note', 'lpfFrequency', { drum: true })).toBe(false)
  })

  it('follows the synth mode', () => {
    const s = sound()
    // Subtractive: no modulators, no carrier feedback.
    for (const dest of ['modulator1Volume', 'modulator2Pitch', 'carrier1Feedback'] as const) {
      expect(cableAllowed(s, 'lfo2', dest), dest).toBe(false)
    }
    expect(cableAllowed(s, 'lfo2', 'oscAPhaseWidth')).toBe(true)

    setAttr(s, 'mode', 'fm', SOUND_ATTR_ORDER)
    expect(cableAllowed(s, 'lfo2', 'modulator1Volume')).toBe(true)
    expect(cableAllowed(s, 'lfo2', 'carrier1Feedback')).toBe(true)
    // FM has no pulse width and no noise source.
    expect(cableAllowed(s, 'lfo2', 'oscAPhaseWidth')).toBe(false)
    expect(cableAllowed(s, 'lfo2', 'noiseVolume')).toBe(false)

    setAttr(s, 'mode', 'ringmod', SOUND_ATTR_ORDER)
    expect(cableAllowed(s, 'lfo2', 'oscAVolume')).toBe(false)
    expect(cableAllowed(s, 'lfo2', 'oscBVolume')).toBe(false)
    expect(cableAllowed(s, 'lfo2', 'lpfFrequency')).toBe(true)
  })

  it('follows a filter that is switched off', () => {
    const s = sound()
    expect(cableAllowed(s, 'lfo2', 'lpfFrequency')).toBe(true)
    setAttr(s, 'lpfMode', 'Off', SOUND_ATTR_ORDER)
    for (const dest of ['lpfFrequency', 'lpfResonance', 'lpfMorph'] as const) {
      expect(cableAllowed(s, 'lfo2', dest), dest).toBe(false)
    }
    // The HPF is unaffected, until it too is off.
    expect(cableAllowed(s, 'lfo2', 'hpfFrequency')).toBe(true)
    setAttr(s, 'hpfMode', 'Off', SOUND_ATTR_ORDER)
    expect(cableAllowed(s, 'lfo2', 'hpfFrequency')).toBe(false)
  })

  it('refuses a synced global LFO’s own rate', () => {
    const s = sound()
    expect(cableAllowed(s, 'lfo3', 'lfo1Rate')).toBe(true)
    setAttr(child(s, 'lfo1')!, 'syncLevel', '7', LFO_ATTR_ORDER)
    expect(cableAllowed(s, 'lfo3', 'lfo1Rate')).toBe(false)
    // Sync on LFO 1 says nothing about LFO 3's rate.
    expect(cableAllowed(s, 'lfo1', 'lfo3Rate')).toBe(true)
  })

  it('allows the cables the firmware’s own init synth ships with', () => {
    const s = sound()
    expect(cableAllowed(s, 'velocity', 'volume')).toBe(true)
    expect(cableAllowed(s, 'aftertouch', 'volume')).toBe(true)
    expect(cableAllowed(s, 'y', 'lpfFrequency')).toBe(true)
  })

  it('is not a blanket no: most per-voice routes are open', () => {
    const s = sound()
    const open = PATCHED_LOCAL_PARAMS.filter((d) => cableAllowed(s, 'lfo2', d))
    expect(open.length).toBeGreaterThan(PATCHED_LOCAL_PARAMS.length / 2)
  })

  it('states the firmware’s cable ceiling', () => {
    expect(MAX_PATCH_CABLES).toBe(32)
  })
})
