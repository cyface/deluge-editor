import { describe, expect, it } from 'vitest'
import { pack8to7, unpack7to8 } from './pack'

describe('7-bit packing (util/pack.c)', () => {
  it('packs one byte with its high bit into the MSB byte', () => {
    expect(Array.from(pack8to7(new Uint8Array([0x80])))).toEqual([0x01, 0x00])
    expect(Array.from(pack8to7(new Uint8Array([0x7f])))).toEqual([0x00, 0x7f])
    expect(Array.from(pack8to7(new Uint8Array([0xff])))).toEqual([0x01, 0x7f])
  })

  it('packs a full group of 0xFF as 0x7F + seven 0x7F', () => {
    expect(Array.from(pack8to7(new Uint8Array(7).fill(0xff)))).toEqual([0x7f, ...new Array(7).fill(0x7f)])
  })

  it('output length is n + ceil(n/7), exactly as pack_8bit_to_7bit computes', () => {
    for (let n = 0; n <= 30; n++) {
      expect(pack8to7(new Uint8Array(n)).length).toBe(n + Math.ceil(n / 7))
    }
  })

  it('every output byte is 7-bit clean', () => {
    const src = Uint8Array.from({ length: 256 }, (_, i) => i)
    for (const b of pack8to7(src)) expect(b).toBeLessThan(0x80)
  })

  it('round-trips every byte value at every partial-group length', () => {
    for (let n = 0; n <= 23; n++) {
      const src = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 0x80) & 0xff)
      expect(Array.from(unpack7to8(pack8to7(src)))).toEqual(Array.from(src))
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(Array.from(unpack7to8(pack8to7(all)))).toEqual(Array.from(all))
  })

  it('unpacks the firmware readBlock framing: MSB byte then up to 7 data bytes', () => {
    // 9 data bytes → groups of 8 and 3 packed bytes.
    const packed = new Uint8Array([0b0000101, 1, 2, 3, 4, 5, 6, 7, 0b1, 8, 9])
    expect(Array.from(unpack7to8(packed))).toEqual([0x81, 2, 0x83, 4, 5, 6, 7, 0x88, 9])
  })
})
