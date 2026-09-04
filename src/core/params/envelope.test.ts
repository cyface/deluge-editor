/**
 * Pins the ADSR sketch to the geometry `EnvGraph.svelte` drew before it moved
 * here (values computed from that implementation at its 300px default width,
 * pad 4).
 */
import { describe, expect, it } from 'vitest'
import { ENV_SKETCH, ENV_SKETCH_TOTAL, envelopeGeometry } from './envelope'

const sc = (W: number) => (W - 8) / ENV_SKETCH_TOTAL

describe('the sketch scale', () => {
  it('is 330 units at full stretch', () => {
    expect(ENV_SKETCH).toEqual({ attack: 80, decay: 90, hold: 70, release: 90 })
    expect(ENV_SKETCH_TOTAL).toBe(330)
    expect(sc(300)).toBeCloseTo(0.8848484848484849, 12)
  })
})

describe('envelopeGeometry', () => {
  it("places the graph's fallback envelope (0, 20, 25, 20)", () => {
    const g = envelopeGeometry({ A: 0, D: 20, S: 25, R: 20 }, sc(300), 4)
    expect(g.A).toBe(0)
    expect(g.S).toBe(25)
    expect(g.x1).toBe(4)
    expect(g.x2).toBeCloseTo(35.85454545454546, 9)
    expect(g.x3).toBeCloseTo(97.79393939393941, 9)
    expect(g.x4).toBeCloseTo(129.64848484848486, 9)
  })
  it('fills the width at full stretch: the release ends at W - pad', () => {
    const g = envelopeGeometry({ A: 50, D: 50, S: 50, R: 50 }, sc(300), 4)
    expect(g.x1).toBeCloseTo(74.7878787878788, 9)
    expect(g.x2).toBeCloseTo(154.42424242424244, 9)
    expect(g.x3).toBeCloseTo(216.36363636363637, 9)
    expect(g.x4).toBeCloseTo(296, 9)
  })
  it('scales with the measured width', () => {
    const g = envelopeGeometry({ A: 10, D: 30, S: 40, R: 5 }, sc(420), 4)
    expect(g).toMatchObject({ A: 10, D: 30, S: 40, R: 5 })
    expect(g.x1).toBeCloseTo(23.975757575757576, 9)
    expect(g.x2).toBeCloseTo(91.3939393939394, 9)
    expect(g.x3).toBeCloseTo(178.7878787878788, 9)
    expect(g.x4).toBeCloseTo(190.02424242424246, 9)
  })
  it('the hold is the one stage no menu value changes', () => {
    const a = envelopeGeometry({ A: 0, D: 0, S: 0, R: 0 }, 1, 0)
    const b = envelopeGeometry({ A: 50, D: 50, S: 50, R: 50 }, 1, 0)
    expect(a.x3 - a.x2).toBe(ENV_SKETCH.hold)
    expect(b.x3 - b.x2).toBe(ENV_SKETCH.hold)
  })
})
