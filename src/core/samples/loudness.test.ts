import { describe, expect, it } from 'vitest'
import { hitLoudness, kHighPass, kShelf } from './loudness'

const sine = (hz: number, seconds: number, amp = 1, rate = 48000): Float32Array =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate))

describe('K-weighting', () => {
  it('reproduces the coefficients BS.1770 prints for 48 kHz', () => {
    const s = kShelf(48000)
    expect(s.b0).toBeCloseTo(1.53512485958697, 10)
    expect(s.b1).toBeCloseTo(-2.69169618940638, 10)
    expect(s.b2).toBeCloseTo(1.19839281085285, 10)
    expect(s.a1).toBeCloseTo(-1.69065929318241, 10)
    expect(s.a2).toBeCloseTo(0.73248077421585, 10)
    const h = kHighPass(48000)
    expect(h.a1).toBeCloseTo(-1.99004745483398, 10)
    expect(h.a2).toBeCloseTo(0.99007225036621, 10)
  })
})

describe('hitLoudness', () => {
  it('reads a full-scale 997 Hz sine near −3 dB, as BS.1770 does per channel', () => {
    expect(hitLoudness([sine(997, 1)], 48000)).toBeCloseTo(-3.01, 1)
  })

  it('moves 6 dB for half the amplitude, and is the same at another rate', () => {
    const full = hitLoudness([sine(997, 1, 1, 44100)], 44100)
    expect(hitLoudness([sine(997, 1, 0.5, 44100)], 44100)).toBeCloseTo(full - 6.02, 1)
    expect(full).toBeCloseTo(hitLoudness([sine(997, 1)], 48000), 1)
  })

  it('weights by ear: 40 Hz counts for less than 4 kHz at the same amplitude', () => {
    expect(hitLoudness([sine(40, 1)], 48000)).toBeLessThan(hitLoudness([sine(4000, 1)], 48000) - 4)
  })

  it('averages channels: a stereo copy of a mono sample reads the same', () => {
    const m = sine(997, 0.5)
    expect(hitLoudness([m, m], 48000)).toBeCloseTo(hitLoudness([m], 48000), 6)
  })

  it('takes the loudest window, and measures only the zone that plays', () => {
    const x = new Float32Array(48000)
    x.set(sine(997, 0.2), 24000) // a burst in the second half
    const whole = hitLoudness([x], 48000)
    expect(whole).toBeCloseTo(-3.01, 1)
    expect(hitLoudness([x], 48000, { end: 24000 })).toBe(-Infinity)
    expect(hitLoudness([x], 48000, { start: 24000, end: 0 })).toBeCloseTo(whole, 6)
  })

  it('hears a hit shorter than the window as quieter, by its share of the window', () => {
    expect(hitLoudness([sine(997, 0.05)], 48000)).toBeCloseTo(-3.01 - 3.01, 0)
  })

  it('is −Infinity for silence and for nothing', () => {
    expect(hitLoudness([new Float32Array(1000)], 48000)).toBe(-Infinity)
    expect(hitLoudness([], 48000)).toBe(-Infinity)
  })
})
