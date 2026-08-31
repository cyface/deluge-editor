import { describe, expect, it } from 'vitest'
import { columnCount, GAP, IDEAL_COL, MIN_COL, splitStacks } from './masonry'

/** The tallest stack's height, the thing splitStacks minimises. */
const tallest = (stacks: string[][], h: Record<string, number>) =>
  Math.max(...stacks.map((s) => s.reduce((sum, id) => sum + h[id] + GAP, 0)))

describe('columnCount', () => {
  it('aims for the ideal width, so more window means wider panels, then more columns', () => {
    // Around 2.5 ideal widths the count is 2 or 3, never 8 minimum-width slivers.
    expect(columnCount(2 * (IDEAL_COL + GAP), 12)).toBe(2)
    expect(columnCount(3 * (IDEAL_COL + GAP), 12)).toBe(3)
  })

  it('never goes below the design floor', () => {
    // Rounding toward ideal must not produce columns narrower than MIN_COL.
    for (let w = MIN_COL; w < 3000; w += 7) {
      const n = columnCount(w, 12)
      expect((w - (n - 1) * GAP) / n).toBeGreaterThanOrEqual(MIN_COL)
    }
  })

  it('never mints more columns than there are panels', () => {
    expect(columnCount(5000, 3)).toBe(3)
    expect(columnCount(5000, 1)).toBe(1)
  })

  it('degenerate inputs give one column', () => {
    expect(columnCount(0, 12)).toBe(1)
    expect(columnCount(800, 0)).toBe(1)
  })
})

describe('splitStacks', () => {
  it('keeps order and loses nothing', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const stacks = splitStacks(items, [100, 200, 300, 100, 100], 3)
    expect(stacks.flat()).toEqual(items)
    expect(stacks).toHaveLength(3)
  })

  it('balances: one very tall panel gets a column to itself', () => {
    const h = { osc: 900, voice: 200, modfx: 150, dist: 100, filters: 250 }
    const stacks = splitStacks(Object.keys(h), Object.values(h), 3, -1)
    expect(stacks[0]).toEqual(['osc'])
    expect(tallest(stacks, h)).toBe(900 + GAP)
  })

  it('finds the minimal tallest stack among all contiguous cuts', () => {
    // Costs 6,4,5,4 into two stacks: [6,4 | 5,4] is the optimum at 10 —
    // cutting after the first (13) or third (15) item is worse.
    const stacks = splitStacks(['a', 'b', 'c', 'd'], [6 - GAP, 4 - GAP, 5 - GAP, 4 - GAP], 2)
    expect(stacks).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('the forced break always heads a stack', () => {
    const items = ['osc', 'voice', 'kit', 'random', 'gold']
    for (let cols = 2; cols <= 5; cols++) {
      const stacks = splitStacks(items, [300, 300, 400, 200, 200], cols, 2)
      expect(stacks.some((s) => s[0] === 'kit')).toBe(true)
      expect(stacks.flat()).toEqual(items)
    }
  })

  it('a forced break at the front or with one column is moot', () => {
    expect(splitStacks(['kit', 'a'], [100, 100], 2, 0)).toEqual([['kit'], ['a']])
    expect(splitStacks(['a', 'kit'], [100, 100], 1, 1)).toEqual([['a', 'kit']])
  })

  it('more columns than items: one item per stack, none empty', () => {
    const stacks = splitStacks(['a', 'b'], [100, 100], 5)
    expect(stacks).toEqual([['a'], ['b']])
  })

  it('empty input gives no stacks', () => {
    expect(splitStacks([], [], 3)).toEqual([])
  })
})
