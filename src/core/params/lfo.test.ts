import { describe, expect, it } from 'vitest'
import { INT32_MAX, INT32_MIN } from './hex'
import { menuToStandard } from './scale'
import {
  EXP_TABLE_SMALL,
  LFO_RATE_NEUTRAL,
  formatLfoRate,
  getExp,
  lfoMenuRateHz,
  lfoPhaseIncrement,
  lfoStartPhase,
} from './lfo'

describe('expTableSmall', () => {
  it('is the firmware table: 257 entries spanning one doubling', () => {
    expect(EXP_TABLE_SMALL).toHaveLength(257)
    expect(EXP_TABLE_SMALL[0]).toBe(32768)
    expect(EXP_TABLE_SMALL[256]).toBe(65535)
  })

  it('rises monotonically', () => {
    for (let i = 1; i < EXP_TABLE_SMALL.length; i++) {
      expect(EXP_TABLE_SMALL[i]).toBeGreaterThan(EXP_TABLE_SMALL[i - 1])
    }
  })
})

describe('getExp', () => {
  it('doubles once per 2^26 of adjustment', () => {
    const at = (a: number) => getExp(LFO_RATE_NEUTRAL, a)
    // Not exactly the neutral value: the >>32 in the fine adjustment throws
    // away the low two bits before the <<2 puts them back, so the firmware
    // lands three counts light of 121739 at the middle of the menu too.
    expect(at(0)).toBe(121736)
    // Each further 2^26 is one more octave, and the rounding doubles with it.
    for (const octaves of [1, 2, 3, 4]) {
      expect(at(octaves * 67108864)).toBe(121736 * 2 ** octaves)
    }
    expect(at(-67108864)).toBe(121736 / 2)
  })
})

describe('lfoPhaseIncrement', () => {
  // Computed by running the firmware's own arithmetic (getParamFromUserValue →
  // combineCablesExp → getExp over expTableSmall) on the values in
  // upstream/community bef6d9df; see the module header for the chain.
  const EXPECTED: Record<number, number> = {
    0: 475,
    5: 1441,
    10: 4370,
    15: 13247,
    20: 40159,
    25: 121736,
    30: 369040,
    35: 1118720,
    40: 3391296,
    45: 10280704,
    50: 31164416,
  }

  it('matches the firmware for every tabulated menu step', () => {
    for (const [menu, increment] of Object.entries(EXPECTED)) {
      expect(lfoPhaseIncrement(menuToStandard(Number(menu)))).toBe(increment)
    }
  })

  it('is the neutral value at the middle of the menu', () => {
    // menu 25 stores -23, not 0, so it lands one count below neutral.
    expect(lfoPhaseIncrement(menuToStandard(25))).toBeCloseTo(LFO_RATE_NEUTRAL, -1)
  })

  it('rises with the menu value across the whole range', () => {
    let last = 0
    for (let m = 0; m <= 50; m++) {
      const inc = lfoPhaseIncrement(menuToStandard(m))
      expect(inc).toBeGreaterThan(last)
      last = inc
    }
  })

  it('stays inside int32 at the extremes', () => {
    expect(lfoPhaseIncrement(INT32_MIN)).toBeGreaterThan(0)
    expect(lfoPhaseIncrement(INT32_MAX)).toBeLessThanOrEqual(INT32_MAX)
  })
})

describe('lfoMenuRateHz', () => {
  it('is 1.25 Hz at the middle of the menu', () => {
    expect(lfoMenuRateHz(25)).toBeCloseTo(1.25, 3)
  })

  it('spans just under sixteen octaves, 0.0049 Hz to 320 Hz', () => {
    expect(lfoMenuRateHz(0)).toBeCloseTo(1.25 / 256, 4)
    expect(lfoMenuRateHz(50)).toBeCloseTo(320, 0)
  })

  it('doubles about every three menu steps', () => {
    // 16 octaves over 50 steps: 2^(8/25) per step.
    for (let m = 1; m <= 50; m++) {
      expect(lfoMenuRateHz(m) / lfoMenuRateHz(m - 1)).toBeCloseTo(2 ** (8 / 25), 2)
    }
  })
})

describe('formatLfoRate', () => {
  it('shows slow rates as the seconds a cycle takes', () => {
    expect(formatLfoRate(0)).toBe('205 s per cycle')
  })

  it('shows audible rates in Hz', () => {
    expect(formatLfoRate(25)).toBe('1.25 Hz')
    expect(formatLfoRate(50)).toBe('320 Hz')
  })
})

describe('lfoStartPhase', () => {
  it('starts a voice LFO at its negative extreme', () => {
    expect(lfoStartPhase('triangle', 'voice')).toBe(0)
    expect(lfoStartPhase('saw', 'voice')).toBe(0.5)
    expect(lfoStartPhase('sine', 'voice')).toBe(0.75)
  })

  it('starts a global sine or triangle at zero instead', () => {
    expect(lfoStartPhase('sine', 'global')).toBe(0)
    expect(lfoStartPhase('triangle', 'global')).toBe(0.25)
    expect(lfoStartPhase('saw', 'global')).toBe(0.5)
  })

  it('leaves square at phase 0, which is its positive extreme', () => {
    expect(lfoStartPhase('square', 'voice')).toBe(0)
    expect(lfoStartPhase('square', 'global')).toBe(0)
  })
})
