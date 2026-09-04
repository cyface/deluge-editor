import { describe, expect, it } from 'vitest'
import { fixtureSound } from '../../../tests/helpers/fixtures'
import { STOCK_MOD_KNOBS, canonicalKnobParam, modKnobSummary } from './modknobs'
import { modKnobs } from './sound'

/** The Gold panel's source labels: the raw string, which is what a hidden or unknown source shows. */
const raw = (s: string) => s

describe('canonicalKnobParam', () => {
  it('folds the volume family onto volumePostFX and leaves everything else alone', () => {
    expect(canonicalKnobParam('volume')).toBe('volumePostFX')
    expect(canonicalKnobParam('volumePostReverbSend')).toBe('volumePostFX')
    expect(canonicalKnobParam('volumePostFX')).toBe('volumePostFX')
    expect(canonicalKnobParam('pan')).toBe('pan')
    expect(canonicalKnobParam(undefined)).toBeUndefined()
  })
})

describe('modKnobSummary', () => {
  it('reads a slot the file does not carry as its stock assignment', () => {
    expect(STOCK_MOD_KNOBS.map((_, i) => modKnobSummary(undefined, i, raw))).toEqual([
      'Pan', 'Volume', 'LPF Res', 'LPF Freq', 'Env 1 Release', 'Env 1 Attack', 'Delay Feedback', 'Delay Time',
      'Reverb Amount', 'Volume via compressor', 'Pitch via lfo1', 'LFO 1 Rate', 'Portamento', 'Stutter Rate', 'Bitcrush', 'Decimation',
    ])
  })
  it('reads the reassigned fixture: a plain param, a cable depth, and a second source', () => {
    // `Gold Knob Reassigned.XML`: knob 3 → hpfFrequency, knob 1 → volume ← lfo2,
    // knob 11 → pitch ← lfo1 + second source envelope1, knob 12 → noteProbability.
    const knobs = modKnobs(fixtureSound('Gold Knob Reassigned'))
    expect(knobs).toHaveLength(16)
    const s = knobs.map((k, i) => modKnobSummary(k, i, raw))
    expect(s[3]).toBe('HPF Freq')
    expect(s[1]).toBe('Volume via lfo2')
    expect(s[11]).toBe('Pitch via lfo1 · 2nd envelope1')
    expect(s[12]).toBe('Note Probability')
    expect(s[0]).toBe('Pan')
  })
  it('names the source through the caller, so a gated source still shows', () => {
    const knobs = modKnobs(fixtureSound('Gold Knob Reassigned'))
    const pretty = (s: string) => ({ lfo1: 'LFO 1', envelope1: 'Env 1' })[s] ?? s
    expect(modKnobSummary(knobs[11], 11, pretty)).toBe('Pitch via LFO 1 · 2nd Env 1')
  })
})
