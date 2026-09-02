import { describe, expect, it } from 'vitest'
import { formatSeed, makeRng, parseSeed, randomSeed } from './rng'

describe('makeRng', () => {
  it('gives the same stream for the same seed', () => {
    const draw = () => {
      const rng = makeRng(0xc0ffee)
      return [rng.next(), rng.int(0, 50), rng.pick(['a', 'b', 'c']), rng.chance(0.5)]
    }
    expect(draw()).toEqual(draw())
  })

  it('gives different streams for different seeds', () => {
    const first = Array.from({ length: 8 }, (_, i) => makeRng(i).next())
    expect(new Set(first).size).toBe(8)
  })

  it('stays inside the range it is asked for', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(-25, 25)
      expect(v).toBeGreaterThanOrEqual(-25)
      expect(v).toBeLessThanOrEqual(25)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('reaches both ends of an inclusive range', () => {
    const rng = makeRng(11)
    const seen = new Set(Array.from({ length: 300 }, () => rng.int(0, 3)))
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })

  it('int with an empty range returns the single value', () => {
    expect(makeRng(1).int(5, 5)).toBe(5)
    expect(makeRng(1).int(9, 2)).toBe(9)
  })

  it('weighted follows the weights, and ignores a zero weight', () => {
    const rng = makeRng(3)
    const counts = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 4000; i++) counts[rng.weighted(['a', 'b', 'c'] as const, [8, 2, 0])]++
    expect(counts.c).toBe(0)
    expect(counts.a).toBeGreaterThan(counts.b * 2)
  })

  it('weighted with no weight at all still returns a member', () => {
    expect(['a', 'b']).toContain(makeRng(4).weighted(['a', 'b'], [0, 0]))
  })

  it('refuses to pick from nothing rather than returning undefined', () => {
    expect(() => makeRng(1).pick([])).toThrow()
    expect(() => makeRng(1).weighted([], [])).toThrow()
  })
})

describe('seeds', () => {
  it('round-trips through the text the UI shows', () => {
    for (const seed of [0, 1, 0xc0ffee, 0xffffffff]) {
      expect(parseSeed(formatSeed(seed))).toBe(seed)
    }
    expect(formatSeed(0xc0ffee)).toBe('00C0FFEE')
  })

  it('reads a seed the user typed loosely, and refuses nonsense', () => {
    expect(parseSeed(' c0ffee ')).toBe(0xc0ffee)
    expect(parseSeed('0xC0FFEE')).toBe(0xc0ffee)
    expect(parseSeed('')).toBeUndefined()
    expect(parseSeed('zzz')).toBeUndefined()
    expect(parseSeed('123456789')).toBeUndefined()
  })

  it('randomSeed is a uint32', () => {
    for (let i = 0; i < 100; i++) {
      const s = randomSeed()
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(0xffffffff)
      expect(Number.isInteger(s)).toBe(true)
    }
  })
})
