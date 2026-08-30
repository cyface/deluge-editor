/**
 * Deluge parameters are 32-bit signed integers, stored in XML as `0x`-prefixed
 * upper-case hex exactly eight digits wide (`0x7FFFFFFF`, `0x80000000`).
 * State keeps the string form so a loaded file round-trips byte-for-byte;
 * these are the only two conversions in or out of it.
 */

export type HexParam = `0x${string}`

const HEX_RE = /^0x[0-9A-Fa-f]{1,8}$/

export const INT32_MIN = -0x80000000
export const INT32_MAX = 0x7fffffff

/** Parse Deluge hex into a signed 32-bit integer. Throws on anything else. */
export function hexToInt(hex: string): number {
  if (!HEX_RE.test(hex)) throw new RangeError(`not a Deluge hex param: ${JSON.stringify(hex)}`)
  // `| 0` reinterprets the unsigned parse as two's-complement int32.
  return parseInt(hex.slice(2), 16) | 0
}

/** Format a signed 32-bit integer the way the Deluge writes it. */
export function intToHex(n: number): HexParam {
  if (!Number.isInteger(n) || n < INT32_MIN || n > INT32_MAX) {
    throw new RangeError(`not an int32: ${n}`)
  }
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}
