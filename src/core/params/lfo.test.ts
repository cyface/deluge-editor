import { describe, expect, it } from 'vitest'
import { INT32_MAX, INT32_MIN } from './hex'
import { menuToStandard } from './scale'
import {
  EXP_TABLE_SMALL,
  LFO_RATE_NEUTRAL,
  SAMPLE_RATE,
  formatLfoRate,
  getExp,
  lfoMenuRateHz,
  lfoNoise,
  lfoPhaseIncrement,
  lfoRandomRun,
  lfoStartPhase,
  lfoWave,
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
  /**
   * Menu 25 is the neutral value with no exponential adjustment, so its rate
   * is `LFO_RATE_NEUTRAL` cycles of 2^32 per second: 1.25 Hz (`lfo.ts`).
   */
  const NEUTRAL_HZ = (LFO_RATE_NEUTRAL / 2 ** 32) * SAMPLE_RATE
  /** The adjustment runs to ±2^29 at the int32 extremes, which `getExp` reads as ±8 octaves (`lfo.ts` header: "a shade under sixteen"). */
  const OCTAVES_EACH_WAY = 8
  const MENU_STEPS = 50

  it('is 1.25 Hz at the middle of the menu', () => {
    expect(NEUTRAL_HZ).toBeCloseTo(1.25, 3)
    // menuToStandard(25) is -7, not 0 (25 · 85899345 − 2^31): a hair under neutral.
    expect(lfoMenuRateHz(25)).toBeCloseTo(NEUTRAL_HZ, 4)
  })

  it('spans just under sixteen octaves, 0.0049 Hz to 320 Hz', () => {
    expect(lfoMenuRateHz(0)).toBeCloseTo(NEUTRAL_HZ / 2 ** OCTAVES_EACH_WAY, 4)
    expect(lfoMenuRateHz(MENU_STEPS)).toBeCloseTo(NEUTRAL_HZ * 2 ** OCTAVES_EACH_WAY, 0)
  })

  it('doubles about every three menu steps', () => {
    // 16 octaves over 50 steps: 2^(16/50) per step.
    for (let m = 1; m <= MENU_STEPS; m++) {
      expect(lfoMenuRateHz(m) / lfoMenuRateHz(m - 1)).toBeCloseTo(2 ** ((2 * OCTAVES_EACH_WAY) / MENU_STEPS), 2)
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

// The shapes are pinned to what `LfoGraph.svelte` drew before they moved here
// (values computed from that implementation at its 480-point resolution).
const IDX = [0, 60, 120, 240, 360, 480]
const pick = (ys: number[]) => IDX.map((i) => Number(ys[i].toFixed(6)))

describe('lfoNoise', () => {
  it('is a stable hash in 0..1, so a graph redraws the same run', () => {
    expect([lfoNoise(0, 1), lfoNoise(5, 2), lfoNoise(100, 4)].map((v) => Number(v.toFixed(9)))).toEqual([
      0.278073576, 0.705164165, 0.562896014,
    ])
    for (let s = 0; s < 200; s++) {
      const v = lfoNoise(s, 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('lfoWave', () => {
  it('draws the four periodic shapes as LFO::render does, over any phase', () => {
    const at = [0, 0.25, 0.5, 0.75, 1.25]
    expect(at.map((p) => Number(lfoWave('sine', p).toFixed(6)))).toEqual([0, 1, 0, -1, 1])
    expect(at.map((p) => lfoWave('square', p))).toEqual([1, 1, -1, -1, 1])
    expect(at.map((p) => lfoWave('triangle', p))).toEqual([-1, 0, 1, 0, 0])
    expect(at.map((p) => lfoWave('saw', p))).toEqual([0, 0.5, -1, -0.5, 0.5])
  })
  it('is flat for the random shapes, which are runs', () => {
    expect(lfoWave('sah', 0.3)).toBe(0)
    expect(lfoWave('rwalk', 0.3)).toBe(0)
    expect(lfoWave('warbler', 0.3)).toBe(0)
  })
})

describe('lfoRandomRun', () => {
  it('returns points + 1 samples in −1..1', () => {
    for (const t of ['sah', 'rwalk', 'warbler']) {
      const ys = lfoRandomRun(1, t, 8, 25, 0, 480)
      expect(ys).toHaveLength(481)
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(-1)
        expect(y).toBeLessThanOrEqual(1)
      }
    }
  })
  it('sample & hold takes a new level each cycle', () => {
    expect(pick(lfoRandomRun(1, 'sah', 8, 25, 0, 480))).toEqual([-0.443853, -0.718582, 0.385631, -0.663595, -0.064925, 0.97233])
  })
  it('random walk creeps by a fortieth at most, pulled back towards zero', () => {
    expect(pick(lfoRandomRun(2, 'rwalk', 32, 25, 0, 480))).toEqual([-0.014382, -0.037998, -0.060107, -0.005732, 0.039362, 0.041529])
  })
  it('the warbler glides towards each target at the rate the LFO is set to', () => {
    expect(pick(lfoRandomRun(3, 'warbler', 8, 25, 0, 480))).toEqual([0.038904, -0.923508, -0.421478, 0.437797, -0.103669, -0.845453])
    expect(pick(lfoRandomRun(4, 'warbler', 8, 40, 0.5, 480))).toEqual([0.002707, -0.999703, -0.487538, 0.435639, 0.251869, -0.929157])
  })
})
