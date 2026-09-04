import { describe, expect, it } from 'vitest'
import { menuToHalf } from './scale'
import {
  pulseBaseWave,
  pulseDuty,
  pulseFamily,
  pulseSyncRatio,
  pulseWidthHeard,
  pulseWidthOffered,
  pulseWidthRendered,
} from './pulse'

describe('pulseWidthRendered', () => {
  it('hands the renderer the value the file stores', () => {
    // The patcher quarters it, the hybrid final value doubles it, and
    // lshiftAndSaturate<1> doubles it again; the only loss is the >>3 rounding.
    for (let m = 0; m <= 50; m++) {
      const stored = menuToHalf(m)
      expect(Math.abs(pulseWidthRendered(stored) - stored)).toBeLessThan(8)
    }
  })

  it('is zero at the bottom of the menu, so nothing is shaped', () => {
    expect(pulseWidthRendered(menuToHalf(0))).toBe(0)
  })
})

describe('pulseFamily', () => {
  it('puts both squares on the duty-cycle path', () => {
    expect(pulseFamily('square')).toBe('square')
    expect(pulseFamily('analogSquare')).toBe('square')
  })

  it('puts every other rendered wave on the sync path', () => {
    for (const t of ['sine', 'triangle', 'saw', 'analogSaw', 'wavetable']) {
      expect(pulseFamily(t)).toBe('sync')
    }
  })

  it('leaves out the types the renderer never sees', () => {
    for (const t of ['sample', 'inLeft', 'inRight', 'inStereo', 'dx7']) {
      expect(pulseFamily(t)).toBe('none')
    }
  })
})

describe('pulseWidthOffered', () => {
  const plain = { fm: false, fileLoaded: false }

  it('is offered for the oscillators the firmware offers it for', () => {
    for (const t of ['square', 'analogSquare', 'sine', 'triangle', 'saw', 'analogSaw']) {
      expect(pulseWidthOffered(t, plain)).toBe(true)
    }
  })

  it('is never offered in FM mode', () => {
    expect(pulseWidthOffered('sine', { fm: true, fileLoaded: false })).toBe(false)
    expect(pulseWidthOffered('square', { fm: true, fileLoaded: true })).toBe(false)
  })

  it('waits for a wavetable to have a file', () => {
    expect(pulseWidthOffered('wavetable', plain)).toBe(false)
    expect(pulseWidthOffered('wavetable', { fm: false, fileLoaded: true })).toBe(true)
  })

  it('is not offered for samples or the audio inputs', () => {
    for (const t of ['sample', 'inLeft', 'inRight', 'inStereo']) {
      expect(pulseWidthOffered(t, { fm: false, fileLoaded: true })).toBe(false)
    }
  })
})

describe('pulseWidthHeard', () => {
  it('is silenced by osc sync for everything but the mathematical square', () => {
    expect(pulseWidthHeard('saw', { oscSync: true })).toBe(false)
    expect(pulseWidthHeard('analogSquare', { oscSync: true })).toBe(false)
    expect(pulseWidthHeard('square', { oscSync: true })).toBe(true)
  })

  it('leaves everything alone with osc sync off', () => {
    for (const t of ['saw', 'square', 'analogSquare', 'wavetable']) {
      expect(pulseWidthHeard(t, { oscSync: false })).toBe(true)
    }
  })
})

describe('pulseDuty', () => {
  it('is a plain 50% square at zero', () => {
    expect(pulseDuty(menuToHalf(0))).toBe(0.5)
  })

  it('widens by one percent of the cycle per menu step', () => {
    expect(pulseDuty(menuToHalf(25))).toBeCloseTo(0.75, 3)
    expect(pulseDuty(menuToHalf(40))).toBeCloseTo(0.9, 3)
  })

  it('reaches a full cycle — silence — at the top of the menu', () => {
    expect(pulseDuty(menuToHalf(50))).toBeCloseTo(1, 4)
  })
})

describe('pulseSyncRatio', () => {
  it('leaves the wave alone at zero', () => {
    expect(pulseSyncRatio(menuToHalf(0))).toBe(1)
  })

  it('reaches two cycles per note cycle at the top of the menu', () => {
    expect(pulseSyncRatio(menuToHalf(25))).toBeCloseTo(1.5, 3)
    expect(pulseSyncRatio(menuToHalf(50))).toBeCloseTo(2, 4)
  })

  it('rises with the menu value', () => {
    let last = 0
    for (let m = 0; m <= 50; m++) {
      const r = pulseSyncRatio(menuToHalf(m))
      expect(r).toBeGreaterThanOrEqual(last)
      last = r
    }
  })
})

describe('pulseBaseWave', () => {
  // Pinned to what `PulseGraph.svelte` drew before the wave moved here.
  const at = [0, 0.125, 0.25, 0.5, 0.75, 1.5]
  const of = (t: string) => at.map((p) => Number(pulseBaseWave(t, p).toFixed(6)))
  it('draws sine and triangle from zero, the saws as a falling ramp', () => {
    expect(of('sine')).toEqual([0, 0.707107, 1, 0, -1, 0])
    expect(of('triangle')).toEqual([0, 0.5, 1, 0, -1, 0])
    expect(of('saw')).toEqual([1, 0.75, 0.5, 0, -0.5, 0])
    expect(of('analogSaw')).toEqual(of('saw'))
    expect(of('wavetable')).toEqual(of('saw'))
  })
  it('draws everything else as a square, high for the first half', () => {
    expect(of('square')).toEqual([1, 1, 1, -1, -1, -1])
    expect(of('analogSquare')).toEqual(of('square'))
    expect(of('dx7')).toEqual(of('square'))
  })
})
