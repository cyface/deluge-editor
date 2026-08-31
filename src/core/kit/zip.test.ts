import { describe, expect, it } from 'vitest'
import { buildZip, crc32 } from './zip'

const u32 = (b: Uint8Array, at: number): number =>
  ((b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0)
const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8)

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('buildZip', () => {
  const entries = [
    { path: 'README.md', data: new TextEncoder().encode('hello') },
    { path: 'SAMPLES/Kit/Kick.wav', data: Uint8Array.from({ length: 300 }, (_, i) => i & 0xff) },
  ]
  const zip = buildZip(entries, new Date(2026, 7, 31, 12, 0, 0))

  it('ends with a well-formed end-of-central-directory record', () => {
    const eocd = zip.length - 22
    expect(u32(zip, eocd)).toBe(0x06054b50)
    expect(u16(zip, eocd + 10)).toBe(2) // entries
    const dirStart = u32(zip, eocd + 16)
    expect(u32(zip, dirStart)).toBe(0x02014b50)
  })

  it('stores every entry uncompressed with its CRC, findable via the central directory', () => {
    const eocd = zip.length - 22
    let at = u32(zip, eocd + 16)
    for (const entry of entries) {
      expect(u32(zip, at)).toBe(0x02014b50)
      expect(u16(zip, at + 10)).toBe(0) // store
      expect(u32(zip, at + 16)).toBe(crc32(entry.data))
      expect(u32(zip, at + 24)).toBe(entry.data.length)
      const nameLen = u16(zip, at + 28)
      const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen))
      expect(name).toBe(entry.path)
      // follow the local header offset to the stored bytes
      const local = u32(zip, at + 42)
      expect(u32(zip, local)).toBe(0x04034b50)
      const localName = u16(zip, local + 26)
      const localExtra = u16(zip, local + 28)
      const data = zip.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + entry.data.length)
      expect(Array.from(data)).toEqual(Array.from(entry.data))
      at += 46 + nameLen
    }
  })
})
