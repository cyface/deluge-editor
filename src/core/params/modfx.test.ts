/**
 * The mod FX relevance table, pinned type by type against the firmware's own
 * menu items (`gui/menu_item/mod_fx/*.h`, upstream/community bef6d9df).
 */

import { describe, expect, it } from 'vitest'
import { MOD_FX_TYPES, type ModFxType } from '../preset/enums'
import { modFxEnabled, modFxKnobLabel, modFxOffered, type ModFxKnob } from './modfx'

/** The four `isRelevant` sets written out again, as a table rather than as lists. */
const EXPECTED: Record<ModFxType, Record<ModFxKnob, boolean>> = {
  none: { rate: false, depth: false, offset: false, feedback: false },
  flanger: { rate: true, depth: false, offset: false, feedback: true },
  chorus: { rate: true, depth: true, offset: true, feedback: false },
  StereoChorus: { rate: true, depth: true, offset: true, feedback: false },
  phaser: { rate: true, depth: true, offset: false, feedback: true },
  grainFX: { rate: true, depth: true, offset: true, feedback: true },
  TapeWarble: { rate: true, depth: true, offset: true, feedback: true },
  dimension: { rate: true, depth: true, offset: true, feedback: false },
}

const KNOBS: ModFxKnob[] = ['rate', 'depth', 'offset', 'feedback']

describe('which mod FX knobs the firmware offers', () => {
  for (const type of MOD_FX_TYPES) {
    for (const knob of KNOBS) {
      it(`${type}: ${knob} is ${EXPECTED[type][knob] ? 'offered' : 'hidden'}`, () => {
        expect(modFxOffered(type, knob)).toBe(EXPECTED[type][knob])
      })
    }
  }

  it('treats a missing attribute as none, which the firmware does too', () => {
    expect(modFxEnabled(undefined)).toBe(false)
    for (const knob of KNOBS) expect(modFxOffered(undefined, knob)).toBe(false)
  })

  it('says the slot is off only for none', () => {
    for (const type of MOD_FX_TYPES) expect(modFxEnabled(type)).toBe(type !== 'none')
  })

  /*
   * Flanger is the one that looks like an oversight and is not: its depth is
   * the constant `kFlangerAmplitude`, set in `setupModFXWFeedback` and never
   * read from the parameter.
   */
  it('hides depth for the flanger, whose depth is a constant', () => {
    expect(modFxOffered('flanger', 'depth')).toBe(false)
    expect(modFxOffered('flanger', 'feedback')).toBe(true)
  })

  it('hides feedback for every chorus, none of which has any', () => {
    for (const t of ['chorus', 'StereoChorus', 'dimension'] as const) {
      expect(modFxOffered(t, 'feedback')).toBe(false)
      expect(modFxOffered(t, 'offset')).toBe(true)
    }
  })
})

describe('what the instrument calls each knob', () => {
  it('renames three of grain’s four', () => {
    expect(modFxKnobLabel('grainFX', 'depth')).toBe('Mix')
    expect(modFxKnobLabel('grainFX', 'feedback')).toBe('Spread')
    expect(modFxKnobLabel('grainFX', 'offset')).toBe('Density')
    expect(modFxKnobLabel('grainFX', 'rate')).toBe('Rate')
  })

  it('gives grain’s long names for a tooltip', () => {
    expect(modFxKnobLabel('grainFX', 'depth', false)).toBe('Grain Mix')
    expect(modFxKnobLabel('grainFX', 'feedback', false)).toBe('Pitch Spread')
    expect(modFxKnobLabel('grainFX', 'offset', false)).toBe('Grain Density')
  })

  it('leaves every other type the plain names', () => {
    for (const t of MOD_FX_TYPES) {
      if (t === 'grainFX') continue
      expect(modFxKnobLabel(t, 'depth')).toBe('Depth')
      expect(modFxKnobLabel(t, 'feedback')).toBe('Feedback')
      expect(modFxKnobLabel(t, 'offset')).toBe('Offset')
    }
  })
})
