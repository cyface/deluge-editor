import { describe, expect, it } from 'vitest'
import { mulRshift32, TWO31, TWO32 } from './fixedpoint'

describe('fixedpoint', () => {
  it('names the two powers of two the int32 arithmetic turns on', () => {
    expect(TWO31).toBe(2 ** 31)
    expect(TWO32).toBe(2 ** 32)
  })

  it('mulRshift32 is the top 32 bits of the signed 64-bit product', () => {
    expect(mulRshift32(0x7fffffff, 0x40000000)).toBe(0x1fffffff) // (2^31-1) * 2^30 >> 32
    expect(mulRshift32(-0x80000000, 0x40000000)).toBe(-0x20000000) // rounds toward -inf, as the arithmetic shift does
    expect(mulRshift32(0, 0x7fffffff)).toBe(0)
    expect(mulRshift32(1, 1)).toBe(0)
  })

  it('stays exact where a double product would not', () => {
    // 2^31 * 2^31 = 2^62, past the 2^53 a double carries exactly.
    expect(mulRshift32(-0x80000000, -0x80000000)).toBe(0x40000000)
  })
})
