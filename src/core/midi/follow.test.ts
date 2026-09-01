import { describe, expect, it } from 'vitest'
import { INT32_MAX, INT32_MIN } from '../params/hex'
import { halfToMenu, panToMenu, standardToMenu } from '../params/scale'
import { parseVersion } from '../firmware/version'
import {
  FOLLOW_GLOBAL_CC_C11,
  FOLLOW_GLOBAL_CC_C13,
  FOLLOW_SOUND_CC_C11,
  FOLLOW_SOUND_CC_C13,
  ccToKnobPos,
  ccToParamValue,
  controlChange,
  followMap,
  knobPosToParamValue,
  paramValueToCc,
  parseControlChange,
} from './follow'
import { KIT_FOLLOW_SLOTS, SOUND_FOLLOW_SLOTS } from '../preset/follow'

describe('knob positions on the wire', () => {
  it('centres on CC 64 and bottoms out at 0', () => {
    expect(ccToKnobPos(64)).toBe(0)
    expect(ccToKnobPos(0)).toBe(-64)
    expect(knobPosToParamValue(-64)).toBe(INT32_MIN)
    expect(knobPosToParamValue(0)).toBe(0)
  })

  // sendCC clamps to 127, and calculateKnobPos resolves that back to 64 —
  // `midiKnobPos = 64` unless `ccValue < kMaxMIDIValue`.
  it('reads a clamped CC 127 as the maximum, as the instrument does', () => {
    expect(ccToKnobPos(127)).toBe(64)
    expect(ccToParamValue(127)).toBe(INT32_MAX)
    expect(ccToParamValue(127, true)).toBe(INT32_MAX)
  })

  it('lands on the numbers the Deluge would show', () => {
    expect(standardToMenu(ccToParamValue(0))).toBe(0)
    expect(standardToMenu(ccToParamValue(64))).toBe(25)
    expect(standardToMenu(ccToParamValue(127))).toBe(50)
    expect(panToMenu(ccToParamValue(0))).toBe(-25)
    expect(panToMenu(ccToParamValue(64))).toBe(0)
    expect(panToMenu(ccToParamValue(127))).toBe(25)
  })

  // PatchedParamSet / UnpatchedParamSet override knobPosToParamValue for the
  // three parameters whose menu covers the positive half only.
  it('uses the half-precision form where the firmware does', () => {
    expect(ccToParamValue(0, true)).toBe(0)
    expect(halfToMenu(ccToParamValue(0, true))).toBe(0)
    expect(halfToMenu(ccToParamValue(64, true))).toBe(25)
    expect(halfToMenu(ccToParamValue(127, true))).toBe(50)
    // Never negative: the half form is (knobPos + 64) << 24.
    for (let cc = 0; cc <= 127; cc++) expect(ccToParamValue(cc, true)).toBeGreaterThanOrEqual(0)
  })

  it('every CC produces an int32', () => {
    for (let cc = 0; cc <= 127; cc++) {
      for (const half of [false, true]) {
        const v = ccToParamValue(cc, half)
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(INT32_MIN)
        expect(v).toBeLessThanOrEqual(INT32_MAX)
      }
    }
  })

  it('is monotonic in the CC value', () => {
    for (const half of [false, true]) {
      for (let cc = 1; cc <= 127; cc++) {
        expect(ccToParamValue(cc, half)).toBeGreaterThan(ccToParamValue(cc - 1, half))
      }
    }
  })
})

describe('sending a value back', () => {
  it('round-trips every CC through the parameter and out again', () => {
    for (const half of [false, true]) {
      for (let cc = 0; cc <= 127; cc++) {
        expect(paramValueToCc(ccToParamValue(cc, half), half), `CC ${cc} half=${half}`).toBe(cc)
      }
    }
  })

  it('stays inside MIDI range for any stored value', () => {
    for (const v of [INT32_MIN, -1, 0, 1, 0x7effffff, 0x7f000000, INT32_MAX]) {
      const out = paramValueToCc(v)
      expect(out).toBeGreaterThanOrEqual(0)
      expect(out).toBeLessThanOrEqual(127)
    }
    expect(paramValueToCc(INT32_MIN)).toBe(0)
    expect(paramValueToCc(0)).toBe(64)
    expect(paramValueToCc(INT32_MAX)).toBe(127)
  })

  it('writes the message the instrument expects', () => {
    expect([...controlChange(1, 74, 127)]).toEqual([0xb0, 74, 127])
    expect([...controlChange(16, 7, 0)]).toEqual([0xbf, 7, 0])
    // Round-trips through the reader, which is what the mirror uses.
    expect(parseControlChange(controlChange(9, 91, 40))).toEqual({ channel: 9, cc: 91, value: 40 })
  })
})

describe('the default CC map', () => {
  it('exists only for community 1.1.0 and up', () => {
    expect(followMap(parseVersion('4.1.4'))).toBeNull()
    expect(followMap(parseVersion('c1.0.1'))).toBeNull()
    expect(followMap(parseVersion('c1.1.0'))).not.toBeNull()
    expect(followMap(parseVersion('c1.2.1'))?.sound).toBe(FOLLOW_SOUND_CC_C11)
    expect(followMap(parseVersion('c1.3.0'))?.sound).toBe(FOLLOW_SOUND_CC_C13)
  })

  it('keeps the CC numbers in MIDI range', () => {
    for (const table of [FOLLOW_SOUND_CC_C11, FOLLOW_SOUND_CC_C13, FOLLOW_GLOBAL_CC_C11, FOLLOW_GLOBAL_CC_C13]) {
      for (const cc of Object.keys(table).map(Number)) {
        expect(cc).toBeGreaterThanOrEqual(0)
        expect(cc).toBeLessThanOrEqual(127)
      }
    }
  })

  it('names only parameters the editor can place in a file', () => {
    for (const name of Object.values(FOLLOW_SOUND_CC_C13)) expect(SOUND_FOLLOW_SLOTS[name]).toBeDefined()
    for (const name of Object.values(FOLLOW_SOUND_CC_C11)) expect(SOUND_FOLLOW_SLOTS[name]).toBeDefined()
    for (const name of Object.values(FOLLOW_GLOBAL_CC_C13)) expect(KIT_FOLLOW_SLOTS[name]).toBeDefined()
    for (const name of Object.values(FOLLOW_GLOBAL_CC_C11)) expect(KIT_FOLLOW_SLOTS[name]).toBeDefined()
  })

  it('grew from c1.2 to c1.3 without moving an existing CC — except osc B’s wave index', () => {
    const moved = Object.entries(FOLLOW_SOUND_CC_C11).filter(
      ([cc, name]) => FOLLOW_SOUND_CC_C13[Number(cc)] !== name,
    )
    expect(moved).toEqual([['30', 'oscBWavetablePosition']])
    expect(FOLLOW_SOUND_CC_C13[30]).toBe('oscAWavetablePosition')
    // The 1.3 refactor left osc B's wave index with no CC of its own.
    expect(Object.values(FOLLOW_SOUND_CC_C13)).not.toContain('oscBWavetablePosition')
  })

  it('adds the parameters c1.3 introduced and nothing else', () => {
    const added = Object.entries(FOLLOW_SOUND_CC_C13)
      .filter(([cc]) => FOLLOW_SOUND_CC_C11[Number(cc)] === undefined)
      .map(([, name]) => name)
      .sort()
    expect(added).toEqual([
      'bassProbability', 'chordPolyphony', 'chordProbability', 'compressorThreshold',
      'env3Attack', 'env3Decay', 'env3Release', 'env3Sustain',
      'env4Attack', 'env4Decay', 'env4Release', 'env4Sustain',
      'glideProbability', 'lfo3Rate', 'lfo4Rate', 'noteProbability',
      'ratchetAmount', 'ratchetProbability', 'reverseProbability', 'rhythm',
      'sequenceLength', 'spreadGate', 'spreadOctave', 'spreadVelocity',
      'stutterRate', 'swapProbability',
    ])
  })

  // GLOBAL_VOLUME_POST_REVERB_SEND is commented out in initDefaultMappings:
  // CC 61 reaches the kit bus's ducking amount and nothing on a sound.
  it('leaves CC 61 to the kit bus alone', () => {
    expect(FOLLOW_SOUND_CC_C13[61]).toBeUndefined()
    expect(FOLLOW_GLOBAL_CC_C13[61]).toBe('sidechainCompressorVolume')
  })
})

describe('reading a MIDI message', () => {
  it('takes control change on any channel and nothing else', () => {
    expect(parseControlChange(new Uint8Array([0xb0, 74, 100]))).toEqual({ channel: 1, cc: 74, value: 100 })
    expect(parseControlChange(new Uint8Array([0xbf, 7, 0]))).toEqual({ channel: 16, cc: 7, value: 0 })
    expect(parseControlChange(new Uint8Array([0x90, 60, 100]))).toBeNull()
    expect(parseControlChange(new Uint8Array([0xb0, 74]))).toBeNull()
  })
})
