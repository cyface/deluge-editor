import { describe, expect, it } from 'vitest'
import { bufferReader, readWavInfo } from './wav'

/**
 * WAV bytes built to the RIFF spec (not a Deluge fixture — the fixture rule
 * covers preset XML, where the firmware is the authority; RIFF is a public
 * format and these bytes exercise our chunk walk, including layouts the
 * canonical 44-byte header doesn't have).
 */
function wav({
  channels = 2,
  sampleRate = 44100,
  bitsPerSample = 16,
  frames = 100,
  preDataChunks = [] as { id: string; size: number }[],
}): Uint8Array {
  const blockAlign = (bitsPerSample / 8) * channels
  const dataBytes = frames * blockAlign
  const extra = preDataChunks.reduce((n, c) => n + 8 + c.size + (c.size & 1), 0)
  const total = 4 + 24 + extra + 8 + dataBytes
  const out = new Uint8Array(8 + total)
  const dv = new DataView(out.buffer)
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  dv.setUint32(4, total, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true) // PCM
  dv.setUint16(22, channels, true)
  dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, sampleRate * blockAlign, true)
  dv.setUint16(32, blockAlign, true)
  dv.setUint16(34, bitsPerSample, true)
  let at = 36
  for (const c of preDataChunks) {
    ascii(at, c.id)
    dv.setUint32(at + 4, c.size, true)
    at += 8 + c.size + (c.size & 1)
  }
  ascii(at, 'data')
  dv.setUint32(at + 4, dataBytes, true)
  return out
}

describe('readWavInfo', () => {
  it('reads the canonical 44-byte header', async () => {
    const info = await readWavInfo(bufferReader(wav({ frames: 4321 })))
    expect(info).toEqual({ frames: 4321, sampleRate: 44100, channels: 2, bitsPerSample: 16, dataBytes: 4321 * 4 })
  })

  it('frames are per-frame, not per-channel-sample: mono 8-bit counts bytes', async () => {
    const info = await readWavInfo(bufferReader(wav({ channels: 1, bitsPerSample: 8, frames: 999 })))
    expect(info.frames).toBe(999)
    expect(info.dataBytes).toBe(999)
  })

  it('hops LIST and fact chunks (odd sizes padded) without reading their bodies', async () => {
    let bytesRead = 0
    const data = wav({ frames: 10, preDataChunks: [{ id: 'LIST', size: 501 }, { id: 'fact', size: 4 }] })
    const counting = (offset: number, length: number) => {
      bytesRead += length
      return bufferReader(data)(offset, length)
    }
    const info = await readWavInfo(counting)
    expect(info.frames).toBe(10)
    expect(bytesRead).toBeLessThan(100) // headers only, never the 501-byte LIST body
  })

  it('rejects a non-WAV file', async () => {
    await expect(readWavInfo(bufferReader(new Uint8Array(64)))).rejects.toThrow(/RIFF/)
  })

  it('rejects a WAV with no data chunk', async () => {
    const data = wav({ frames: 8 }).subarray(0, 36) // fmt only, then EOF
    await expect(readWavInfo(bufferReader(data))).rejects.toThrow(/data chunk/)
  })
})
