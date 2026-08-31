/**
 * A minimal ZIP writer (PKZIP 2.0, store method) for the kit share package.
 * No compression: the payload is WAV audio and one small XML — deflate would
 * buy little and cost a dependency. Structure per the PKWARE APPNOTE: local
 * file headers + data, central directory, end-of-central-directory record.
 * Names are written as UTF-8 with the language-encoding flag (bit 11) set.
 */

export interface ZipEntry {
  /** Forward-slash path inside the archive, e.g. `KITS/My Kit.XML`. */
  path: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS date+time words, as ZIP wants them (2-second resolution, 1980 epoch). */
const dosStamp = (d: Date): { date: number; time: number } => ({
  date: ((Math.max(0, d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
})

class ByteWriter {
  private chunks: Uint8Array[] = []
  length = 0
  bytes(b: Uint8Array): void {
    this.chunks.push(b)
    this.length += b.length
  }
  u16(v: number): void {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]))
  }
  u32(v: number): void {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]))
  }
  join(): Uint8Array {
    const out = new Uint8Array(this.length)
    let at = 0
    for (const c of this.chunks) {
      out.set(c, at)
      at += c.length
    }
    return out
  }
}

export function buildZip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  const { date, time } = dosStamp(now)
  const out = new ByteWriter()
  const encoder = new TextEncoder()
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const crc = crc32(entry.data)
    central.push({ name, crc, size: entry.data.length, offset: out.length })
    out.u32(0x04034b50) // local file header
    out.u16(20) // version needed
    out.u16(0x0800) // flags: UTF-8 name
    out.u16(0) // method: store
    out.u16(time)
    out.u16(date)
    out.u32(crc)
    out.u32(entry.data.length) // compressed = uncompressed (store)
    out.u32(entry.data.length)
    out.u16(name.length)
    out.u16(0) // extra length
    out.bytes(name)
    out.bytes(entry.data)
  }

  const dirStart = out.length
  for (const e of central) {
    out.u32(0x02014b50) // central directory header
    out.u16(20) // version made by
    out.u16(20) // version needed
    out.u16(0x0800)
    out.u16(0)
    out.u16(time)
    out.u16(date)
    out.u32(e.crc)
    out.u32(e.size)
    out.u32(e.size)
    out.u16(e.name.length)
    out.u16(0) // extra
    out.u16(0) // comment
    out.u16(0) // disk number
    out.u16(0) // internal attrs
    out.u32(0) // external attrs
    out.u32(e.offset)
    out.bytes(e.name)
  }
  const dirSize = out.length - dirStart

  out.u32(0x06054b50) // end of central directory
  out.u16(0) // this disk
  out.u16(0) // dir start disk
  out.u16(central.length)
  out.u16(central.length)
  out.u32(dirSize)
  out.u32(dirStart)
  out.u16(0) // comment length
  return out.join()
}
