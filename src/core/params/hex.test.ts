import { describe, expect, it } from 'vitest'
import { hexToInt, intToHex, INT32_MAX, INT32_MIN } from './hex'

describe('hexToInt', () => {
  it('reads positive and negative two\'s-complement values', () => {
    expect(hexToInt('0x7FFFFFFF')).toBe(INT32_MAX)
    expect(hexToInt('0x80000000')).toBe(INT32_MIN)
    expect(hexToInt('0x00000000')).toBe(0)
    expect(hexToInt('0xFFFFFFFF')).toBe(-1)
    expect(hexToInt('0xE0000000')).toBe(-536870912)
  })
  it('rejects things that are not Deluge hex', () => {
    for (const bad of ['7FFFFFFF', '0x', '0x123456789', '0xZZ', '', '12'])
      expect(() => hexToInt(bad)).toThrow(RangeError)
  })
})

describe('intToHex', () => {
  it('writes eight upper-case digits', () => {
    expect(intToHex(INT32_MAX)).toBe('0x7FFFFFFF')
    expect(intToHex(INT32_MIN)).toBe('0x80000000')
    expect(intToHex(0)).toBe('0x00000000')
    expect(intToHex(-1)).toBe('0xFFFFFFFF')
    expect(intToHex(255)).toBe('0x000000FF')
  })
  it('rejects non-int32', () => {
    for (const bad of [INT32_MAX + 1, INT32_MIN - 1, 1.5, NaN, Infinity])
      expect(() => intToHex(bad)).toThrow(RangeError)
  })
})

describe('round trip', () => {
  it('hex → int → hex is identity for every value the Deluge writes', () => {
    for (const h of ['0x7FFFFFFF', '0x80000000', '0x00000000', '0xFFFFFFFF', '0x19999999', '0xE6666666'])
      expect(intToHex(hexToInt(h))).toBe(h)
  })
})
