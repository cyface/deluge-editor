/**
 * Pins the filter sketch to the curves `FilterGraph.svelte` drew before the
 * arithmetic moved here (values computed from that implementation).
 */
import { describe, expect, it } from 'vitest'
import { filterCutoffHz, hpfMagnitude, hpfQ, lpfMagnitude, lpfQ } from './filter'

const F = [20, 200, 632.455532, 2000, 20000]
const r6 = (v: number) => Number(v.toFixed(6))
const lpf = (mode: string, freq: number, res: number) => F.map((f) => r6(lpfMagnitude(f, mode, freq, res)))
const hpf = (mode: string, freq: number, res: number) => F.map((f) => r6(hpfMagnitude(f, mode, freq, res)))

describe('filterCutoffHz', () => {
  it('runs 20 Hz to 20 kHz on a log axis, 632 Hz at the middle', () => {
    expect([0, 25, 50].map(filterCutoffHz).map(r6)).toEqual([20, 632.455532, 20000])
  })
  it('gives the Q the graph used for each filter', () => {
    expect([lpfQ(0), lpfQ(50), hpfQ(0), hpfQ(50)]).toEqual([1, 12, 1, 9])
  })
})

describe('lpfMagnitude', () => {
  it('is flat when Off', () => {
    expect(lpf('Off', 25, 50)).toEqual([1, 1, 1, 1, 1])
  })
  it('draws the ladders as Butterworth roll-offs of their order, resonance as a peak at the cutoff', () => {
    expect(lpf('24dB', 25, 0)).toEqual([1, 0.99995, 0.707107, 0.01, 0.000001])
    expect(lpf('24dB', 25, 50)).toEqual([1, 0.999964, 8.485281, 0.01, 0.000001])
    expect(lpf('12dB', 25, 25)).toEqual([1, 0.995044, 4.596194, 0.099504, 0.001])
    expect(lpf('24dBDrive', 25, 25)).toEqual([1, 0.999957, 4.596194, 0.01, 0.000001])
  })
  it('draws the SVF band and its notch complement', () => {
    expect(lpf('SVF_Band', 25, 25)).toEqual([0.00487, 0.053977, 1, 0.053977, 0.00487])
    expect(lpf('SVF_Notch', 25, 25)).toEqual([0.999988, 0.998542, 0, 0.998542, 0.999988])
  })
})

describe('hpfMagnitude', () => {
  it('is flat when Off', () => {
    expect(hpf('Off', 25, 50)).toEqual([1, 1, 1, 1, 1])
  })
  it('draws the ladder second-order with a gentler peak', () => {
    expect(hpf('HPLadder', 25, 0)).toEqual([0.001, 0.099504, 0.707107, 0.995037, 1])
    expect(hpf('HPLadder', 25, 50)).toEqual([0.001, 0.099504, 2.969848, 0.995041, 1])
  })
  it('draws the SVF band and notch with its own Q', () => {
    expect(hpf('SVF_Band', 25, 25)).toEqual([0.006331, 0.0701, 1, 0.0701, 0.006331])
    expect(hpf('SVF_Notch', 25, 25)).toEqual([0.99998, 0.99754, 0, 0.99754, 0.99998])
  })
})
