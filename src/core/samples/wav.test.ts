import { describe, expect, it } from 'vitest'
import { instChunk as inst, smplChunk as smpl, wavBytes as wav } from '../../../tests/helpers/wav'
import { bufferReader, readWavInfo } from './wav'

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

describe('readWavInfo tags', () => {
  const withTags = (chunks: { id: string; body: Uint8Array }[], frames = 1000) =>
    readWavInfo(bufferReader(wav({ frames, postDataChunks: chunks })), { tags: true })

  it('reads a smpl root note and its pitch fraction', async () => {
    const info = await withTags([{ id: 'smpl', body: smpl({ note: 57, fraction: 2 ** 31 }) }])
    expect(info.rootNote).toBeCloseTo(57.5, 6)
    expect(info.rootFrom).toBe('smpl')
  })

  it('leaves the root off unless asked, so the kit builder pays for no extra reads', async () => {
    const data = wav({ frames: 10, postDataChunks: [{ id: 'smpl', body: smpl({ note: 57 }) }] })
    let bytesRead = 0
    const counting = (offset: number, length: number) => {
      bytesRead += length
      return bufferReader(data)(offset, length)
    }
    const info = await readWavInfo(counting)
    expect(info.rootNote).toBeUndefined()
    expect(bytesRead).toBe(44) // RIFF header, fmt header and body, data header — and stop
    bytesRead = 0
    expect((await readWavInfo(counting, { tags: true })).rootNote).toBe(57)
    expect(bytesRead).toBeGreaterThan(44)
  })

  it('takes an all-zero smpl note and fraction as unset, not as C-2', async () => {
    const info = await withTags([{ id: 'smpl', body: smpl({ note: 0, fraction: 0 }) }])
    expect(info.rootNote).toBeUndefined()
    expect(info.rootFrom).toBeUndefined()
  })

  it('accepts smpl note 0 when a fraction is present, and refuses a note of 128 or more', async () => {
    expect((await withTags([{ id: 'smpl', body: smpl({ note: 0, fraction: 2 ** 32 / 4 }) }])).rootNote).toBeCloseTo(
      0.25,
      6,
    )
    expect((await withTags([{ id: 'smpl', body: smpl({ note: 128 }) }])).rootNote).toBeUndefined()
  })

  it('reads an inst root note, subtracting its signed fine tune', async () => {
    const info = await withTags([{ id: 'inst', body: inst({ note: 48, fineTune: -25 }) }])
    expect(info.rootNote).toBeCloseTo(48.25, 6)
    expect(info.rootFrom).toBe('inst')
  })

  it('lets the last chunk in the file win, as the device does', async () => {
    const both = [
      { id: 'smpl', body: smpl({ note: 60 }) },
      { id: 'inst', body: inst({ note: 36 }) },
    ]
    expect((await withTags(both)).rootFrom).toBe('inst')
    expect((await withTags([...both].reverse())).rootFrom).toBe('smpl')
  })

  it('reads loop points from a single-loop smpl, and ignores two loops', async () => {
    const one = await withTags([{ id: 'smpl', body: smpl({ loops: [{ start: 4410, end: 8820 }] }) }])
    expect([one.loopStart, one.loopEnd]).toEqual([4410, 8820])
    const two = await withTags([
      {
        id: 'smpl',
        body: smpl({
          loops: [
            { start: 1, end: 2 },
            { start: 3, end: 4 },
          ],
        }),
      },
    ])
    expect(two.loopStart).toBeUndefined()
  })

  it('still reports frames and rate when it walks the whole file', async () => {
    const info = await withTags([{ id: 'smpl', body: smpl({ note: 62 }) }], 4321)
    expect([info.frames, info.sampleRate]).toEqual([4321, 44100])
  })

  it('survives a truncated smpl chunk', async () => {
    const info = await withTags([{ id: 'smpl', body: new Uint8Array(12) }])
    expect(info.rootNote).toBeUndefined()
    expect(info.frames).toBe(1000)
  })
})
