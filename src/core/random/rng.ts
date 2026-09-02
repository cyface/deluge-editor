/**
 * A small seeded generator, so a roll is reproducible.
 *
 * `Math.random` would do for making a patch, but not for testing one: the
 * randomizer's whole job is to stay inside the firmware's ranges and string
 * tables, and that is only checkable by rolling the same seeds every run.
 * A seed is also what lets the UI say which roll you are listening to and
 * repeat it.
 *
 * mulberry32 (Tommy Ettinger, public domain) — 32 bits of state, uniform
 * enough for choosing knob positions, and short enough to read.
 */

export interface Rng {
  /** The seed this generator started from. */
  readonly seed: number
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [min, max], both ends included. */
  int(min: number, max: number): number
  /** Uniform number in [min, max). */
  float(min: number, max: number): number
  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean
  /** One of `items`. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T
  /**
   * One of `items`, weighted: the same entry listed twice is twice as likely.
   * `weights` must be the same length and non-negative.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng: Rng = {
    seed: seed >>> 0,
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => (max <= min ? min : min + Math.floor(next() * (max - min + 1))),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from an empty list')
      return items[Math.floor(next() * items.length)]
    },
    weighted: (items, weights) => {
      if (items.length === 0) throw new Error('pick from an empty list')
      const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0)
      if (total <= 0) return rng.pick(items)
      let r = next() * total
      for (let i = 0; i < items.length; i++) {
        r -= Math.max(0, weights[i])
        if (r < 0) return items[i]
      }
      return items[items.length - 1]
    },
  }
  return rng
}

/** A fresh seed for a roll nobody asked to repeat. */
export const randomSeed = (): number => Math.floor(Math.random() * 0x100000000) >>> 0

/** A seed as the UI shows it and the user can type back: eight hex digits. */
export const formatSeed = (seed: number): string => (seed >>> 0).toString(16).toUpperCase().padStart(8, '0')

/** `formatSeed` read back; anything unparseable is `undefined`, not 0. */
export function parseSeed(text: string): number | undefined {
  const t = text.trim().replace(/^0x/i, '')
  if (!/^[0-9a-f]{1,8}$/i.test(t)) return undefined
  return parseInt(t, 16) >>> 0
}
