/**
 * 7-bit packing for SysEx binary blocks, the Sequential/DSI "packed data"
 * format the firmware uses for file contents: each group is one MSB byte
 * (bit i = the high bit of data byte i) followed by up to seven data bytes
 * with their high bits cleared. A partial final group is allowed and its
 * length is exact — packing n bytes always yields n + ceil(n/7) bytes.
 *
 * Source: `src/deluge/util/pack.c` (`pack_8bit_to_7bit` /
 * `unpack_7bit_to_8bit`), upstream/main 3f898e95.
 */

export function pack8to7(src: Uint8Array): Uint8Array {
  const groups = Math.ceil(src.length / 7)
  const out = new Uint8Array(src.length + groups)
  let o = 0
  for (let g = 0; g < groups; g++) {
    const start = g * 7
    const count = Math.min(7, src.length - start)
    let msbs = 0
    for (let i = 0; i < count; i++) {
      const b = src[start + i]
      if (b & 0x80) msbs |= 1 << i
      out[o + 1 + i] = b & 0x7f
    }
    out[o] = msbs
    o += count + 1
  }
  return out
}

export function unpack7to8(src: Uint8Array): Uint8Array {
  // out_len = 7 * groups - missing, exactly as pack.c computes it.
  const groups = Math.ceil(src.length / 8)
  const out = new Uint8Array(src.length - groups < 0 ? 0 : src.length - groups)
  let o = 0
  for (let g = 0; g < groups; g++) {
    const start = g * 8
    const msbs = src[start]
    for (let i = 0; i < 7 && start + 1 + i < src.length; i++) {
      out[o++] = src[start + 1 + i] | (msbs & (1 << i) ? 0x80 : 0)
    }
  }
  return out
}
