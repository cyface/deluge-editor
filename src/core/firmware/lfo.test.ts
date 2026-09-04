import { describe, expect, it } from 'vitest'
import { fixtureSound } from '../../../tests/helpers/fixtures'
import { LFO_ATTR_ORDER } from '../preset/order'
import { lfo } from '../preset/sound'
import { setAttr } from '../xml/edit'
import { canLfoSync, lfoRateIgnored, type LfoNumber } from './lfo'
import { parseVersion } from './version'

const v = parseVersion
const ALL: LfoNumber[] = [1, 2, 3, 4]

describe('canLfoSync', () => {
  it('official firmware syncs LFO 1 only: <lfo2> is written bare and its reader skips syncLevel', () => {
    expect(ALL.map((n) => canLfoSync(v('4.1.4'), n))).toEqual([true, false, false, false])
    expect(ALL.map((n) => canLfoSync(v('3.1.1'), n))).toEqual([true, false, false, false])
  })
  it('community 1.2.0 adds LFO 2 (8ab5f9e4 #2005); 1.1.1 has not got it', () => {
    expect(ALL.map((n) => canLfoSync(v('c1.1.1'), n))).toEqual([true, false, false, false])
    expect(ALL.map((n) => canLfoSync(v('c1.2.0'), n))).toEqual([true, true, false, false])
    expect(ALL.map((n) => canLfoSync(v('c1.2.1'), n))).toEqual([true, true, false, false])
  })
  it('community 1.3.0 syncs all four: LFOs 3 and 4 arrived syncable (44d8e601 #3332)', () => {
    expect(ALL.map((n) => canLfoSync(v('c1.3.0'), n))).toEqual([true, true, true, true])
  })
})

describe('lfoRateIgnored', () => {
  it('is false for every LFO of the init synth, whose sync levels are all 0', () => {
    const s = fixtureSound('Default Synth')
    for (const n of ALL) expect(lfoRateIgnored(s, n, v('c1.3.0')), `lfo${n}`).toBe(false)
  })
  it('is true once the file syncs an LFO the firmware can sync', () => {
    const s = fixtureSound('Default Synth')
    setAttr(lfo(s, 1)!, 'syncLevel', '7', LFO_ATTR_ORDER)
    setAttr(lfo(s, 2)!, 'syncLevel', '7', LFO_ATTR_ORDER)
    expect(lfoRateIgnored(s, 1, v('4.1.4'))).toBe(true)
    expect(lfoRateIgnored(s, 2, v('c1.3.0'))).toBe(true)
  })
  it('leaves the rate in charge where the firmware ignores the attribute', () => {
    const s = fixtureSound('Default Synth')
    setAttr(lfo(s, 2)!, 'syncLevel', '7', LFO_ATTR_ORDER)
    expect(lfoRateIgnored(s, 2, v('4.1.4'))).toBe(false)
    expect(lfoRateIgnored(s, 2, v('c1.1.1'))).toBe(false)
    expect(lfoRateIgnored(s, 2, v('c1.2.0'))).toBe(true)
  })
  it('treats an absent <lfoN> as unsynced', () => {
    const s = fixtureSound('Attribute Format Baseline') // official 4.0.1: no <lfo3>/<lfo4>
    expect(lfo(s, 3)).toBeUndefined()
    expect(lfoRateIgnored(s, 3, v('c1.3.0'))).toBe(false)
  })
})
