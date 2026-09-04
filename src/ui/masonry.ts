/**
 * The Overview's measured masonry. CSS multicolumn can't be told "stop adding
 * columns when the content runs out" or "prefer wider columns", so at wide
 * windows it minted empty columns (balancing around the tallest panel) while
 * pinning every panel to the 262px floor. Instead the component measures the
 * rendered panels and this module does the arithmetic: how many columns the
 * width deserves, and which contiguous run of panels each column gets.
 * Pure functions, so the balancing is testable in Node.
 */

/** Horizontal gap between stacks, and the panels' own bottom margin. */
export const GAP = 9

/** Panels were designed against this floor; a column never goes narrower. */
export const MIN_COL = 262

/** Preferred column width: the count snaps to whatever lands nearest this. */
export const IDEAL_COL = 340

/** A stack stops stretching here — three panels on a cinema display stay panels. */
export const MAX_COL = 460

/**
 * Columns for the available width: whatever count puts the column width
 * nearest IDEAL_COL, never below MIN_COL, and never more columns than there
 * are panels — every column gets content, so none can sit empty.
 */
export function columnCount(width: number, panels: number): number {
  if (width <= 0 || panels <= 0) return 1
  const fit = Math.floor((width + GAP) / (MIN_COL + GAP))
  const ideal = Math.round((width + GAP) / (IDEAL_COL + GAP))
  return Math.max(1, Math.min(fit, ideal, panels))
}

/**
 * Split the ordered panels into `cols` contiguous stacks, minimising the
 * tallest stack. Order is preserved — reading still runs down each column —
 * and `forcedBreak` (the kit bus) always heads a stack, as its
 * `break-before: column` did under CSS multicolumn.
 */
export function splitStacks<T>(
  items: readonly T[],
  heights: readonly number[],
  cols: number,
  forcedBreak = -1,
): T[][] {
  const n = items.length
  if (n === 0) return []
  const k = Math.max(1, Math.min(cols, n))
  const cost = items.map((_, i) => (heights[i] ?? 0) + GAP)

  let bounds: number[]
  if (k > 1 && forcedBreak > 0 && forcedBreak < n) {
    bounds = withForcedBreak(cost, k, forcedBreak)
  } else {
    bounds = partition(cost, k)
  }

  const stacks: T[][] = []
  let start = 0
  for (const end of bounds) {
    stacks.push(items.slice(start, end))
    start = end
  }
  return stacks
}

/** Give the two sides of the forced break their fairest share of columns. */
function withForcedBreak(cost: number[], k: number, brk: number): number[] {
  const left = cost.slice(0, brk)
  const right = cost.slice(brk)
  let best: number[] | null = null
  let bestMax = Infinity
  for (let kl = 1; kl < k; kl++) {
    if (kl > left.length || k - kl > right.length) continue
    const lb = partition(left, kl)
    const rb = partition(right, k - kl)
    const tallest = Math.max(maxStack(left, lb), maxStack(right, rb))
    if (tallest < bestMax) {
      bestMax = tallest
      best = [...lb, ...rb.map((b) => b + brk)]
    }
  }
  return best ?? partition(cost, k)
}

function maxStack(cost: number[], bounds: number[]): number {
  let start = 0
  let tallest = 0
  for (const end of bounds) {
    let sum = 0
    for (let i = start; i < end; i++) sum += cost[i]
    tallest = Math.max(tallest, sum)
    start = end
  }
  return tallest
}

/**
 * Linear partition: end indices (exclusive) of `k` contiguous stacks over
 * `cost`, minimising the largest stack sum. Classic DP; n is a dozen panels,
 * so the O(n²k) table costs nothing.
 */
function partition(cost: number[], k: number): number[] {
  const n = cost.length
  if (k >= n) return cost.map((_, i) => i + 1)
  const prefix = [0]
  for (const c of cost) prefix.push(prefix[prefix.length - 1] + c)
  const sum = (a: number, b: number) => prefix[b] - prefix[a]

  // best[j][i]: minimal tallest stack splitting the first i items into j stacks.
  const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity))
  const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 1; i <= n; i++) best[1][i] = sum(0, i)
  for (let j = 2; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let m = j - 1; m < i; m++) {
        const tallest = Math.max(best[j - 1][m], sum(m, i))
        if (tallest < best[j][i]) {
          best[j][i] = tallest
          cut[j][i] = m
        }
      }
    }
  }

  const bounds = new Array<number>(k)
  let i = n
  for (let j = k; j >= 1; j--) {
    bounds[j - 1] = i
    i = cut[j][i]
  }
  return bounds
}

/**
 * The measuring half, shared by the Overview and Follow Mode's grid: a Svelte
 * action factory. `const measure = heightMeasurer(heights)` once, then
 * `use:measure={id}` on each panel's wrapper keeps `heights[id]` at its
 * rendered height — `heights` being the component's `$state` record, so the
 * stacks re-balance as panels grow and shrink. Heights only move when the
 * width or the panel's content does, so the remeasure after a redistribution
 * reports the same numbers and settles.
 */
export function heightMeasurer(heights: Record<string, number>): (node: Element, id: string) => { destroy(): void } {
  const observed = new Map<Element, string>()
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const e of entries) {
            const id = observed.get(e.target)
            if (id === undefined) continue
            const h = e.contentRect.height
            if (Math.abs((heights[id] ?? -1) - h) > 0.5) heights[id] = h
          }
        })
  return (node, id) => {
    observed.set(node, id)
    ro?.observe(node)
    return {
      destroy() {
        observed.delete(node)
        ro?.unobserve(node)
      },
    }
  }
}
