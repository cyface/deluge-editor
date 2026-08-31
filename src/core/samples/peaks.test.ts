import { describe, expect, it } from 'vitest'
import { computePeaks } from './peaks'

describe('computePeaks', () => {
  it('each bucket holds the extremes of its slice', () => {
    const data = Float32Array.from([0, 0.5, -0.5, 0, 1, -1, 0, 0.25])
    const { min, max } = computePeaks([data], 4)
    expect([...max]).toEqual([0.5, 0, 1, 0.25])
    expect([...min]).toEqual([0, -0.5, -1, 0])
  })

  it('mixes extremes across channels', () => {
    const left = Float32Array.from([0.2, 0.2])
    const right = Float32Array.from([-0.9, 0.7])
    const { min, max } = computePeaks([left, right], 1)
    expect(min[0]).toBeCloseTo(-0.9)
    expect(max[0]).toBeCloseTo(0.7)
  })

  it('more buckets than frames still covers every frame without holes', () => {
    const data = Float32Array.from([0.5, -0.5])
    const { min, max } = computePeaks([data], 8)
    expect(Math.max(...max)).toBeCloseTo(0.5)
    expect(Math.min(...min)).toBeCloseTo(-0.5)
  })

  it('empty audio yields flat zeros', () => {
    const { min, max } = computePeaks([], 4)
    expect([...min]).toEqual([0, 0, 0, 0])
    expect([...max]).toEqual([0, 0, 0, 0])
  })
})
