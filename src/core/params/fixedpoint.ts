/**
 * The firmware's fixed-point primitives (`util/fixedpoint.h`,
 * SynthstromAudible/DelugeFirmware upstream/community bef6d9df), shared by
 * the menu scaling (`scale.ts`), the LFO rate path (`lfo.ts`) and the pulse
 * width path (`pulse.ts`). Plain doubles are exact below 2^53; the one
 * product that isn't goes through BigInt.
 */

export const TWO31 = 2147483648
export const TWO32 = 4294967296

/**
 * `multiply_32x32_rshift32`: the top 32 bits of a signed 64-bit product.
 * BigInt because the product reaches 2^62.
 */
export const mulRshift32 = (a: number, b: number): number => Number((BigInt(a) * BigInt(b)) >> 32n)
