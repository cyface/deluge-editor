/**
 * The stock tables (issues #14, #15) against Deluge-authored fixtures: the
 * init synth the firmware writes must read as entirely stock, and a value a
 * user changed must not.
 */
import { describe, expect, it } from 'vitest'
import community from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML?raw'
import baseline from '../../../tests/fixtures/official-4.0.1/Attribute Format Baseline.XML?raw'
import { parseXML } from '../xml'
import { setAttr } from '../xml/edit'
import { isSound } from './index'
import { envelopeIsStock, lfoIsStock, modKnobDeviations, STOCK_MOD_KNOBS } from './stock'
import { modKnobs, setEnvelopeMenu, setParamMenu } from './sound'
import type { SoundElement } from './types'

const load = (text: string): SoundElement => {
  const p = parseXML(text)
  if (!isSound(p)) throw new Error('fixture is not a sound')
  return p
}

describe('stock mod knobs (issue #14)', () => {
  it('matches the 16 knobs the firmware writes for the init synth', () => {
    const k = modKnobs(load(community))
    expect(k.length).toBe(STOCK_MOD_KNOBS.length)
    for (const [i, el] of k.entries()) {
      expect(el.attrs.controlsParam).toBe(STOCK_MOD_KNOBS[i].controlsParam)
      expect(el.attrs.patchAmountFromSource).toBe(STOCK_MOD_KNOBS[i].patchAmountFromSource)
    }
  })
  it('finds no deviations in a Deluge-written init synth', () => {
    expect(modKnobDeviations(load(community))).toEqual([])
  })
  it('flags a reassigned knob, and only that knob', () => {
    const s = load(community)
    const k = modKnobs(s)
    setAttr(k[3], 'controlsParam', 'portamento')
    expect(modKnobDeviations(s)).toEqual([k[3]])
  })
  it('flags a knob whose bound source changed', () => {
    const s = load(community)
    const k = modKnobs(s)
    setAttr(k[10], 'patchAmountFromSource', 'lfo2') // stock is pitch ← lfo1
    expect(modKnobDeviations(s)).toEqual([k[10]])
  })
})

describe('stock envelopes (issue #15)', () => {
  it('the init synth is stock throughout', () => {
    const s = load(community)
    for (const n of [1, 2, 3, 4] as const) expect(envelopeIsStock(s, n)).toBe(true)
  })
  it('the load-default form counts as stock too', () => {
    // Baseline's env2 carries initParams values (0xE6666654… = 20/20/25/20).
    expect(envelopeIsStock(load(baseline), 2)).toBe(true)
  })
  it('a user-shaped envelope is not stock', () => {
    // Baseline's env1 was edited on the device (A0 D? S0 R?).
    expect(envelopeIsStock(load(baseline), 1)).toBe(false)
  })
  it('an edit flips an envelope to non-standard', () => {
    const s = load(community)
    setEnvelopeMenu(s, 3, 'decay', 40)
    expect(envelopeIsStock(s, 3)).toBe(false)
  })
})

describe('stock LFOs (issue #15)', () => {
  it('the init synth is stock throughout', () => {
    const s = load(community)
    for (const n of [1, 2, 3, 4] as const) expect(lfoIsStock(s, n)).toBe(true)
  })
  it('a shape change is non-standard', () => {
    const s = load(community)
    setAttr(s.children.find((c) => c.tag === 'lfo1')!, 'type', 'saw')
    expect(lfoIsStock(s, 1)).toBe(false)
  })
  it('a rate change is non-standard', () => {
    const s = load(community)
    setParamMenu(s, 'lfo1Rate', 40)
    expect(lfoIsStock(s, 1)).toBe(false)
  })
  it('a synced LFO is non-standard', () => {
    const s = load(community)
    setAttr(s.children.find((c) => c.tag === 'lfo2')!, 'syncLevel', '7')
    expect(lfoIsStock(s, 2)).toBe(false)
  })
})
