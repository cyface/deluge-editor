/**
 * A WAV file's shape without loading its audio: a RIFF chunk walk over a
 * ranged reader, so the same code serves a local `File` (sliced) and a sample
 * on the card (a SysEx ranged read of just the header bytes).
 *
 * `frames` is data-chunk bytes / block align, which is exactly the frame
 * count the Deluge computes for a loaded sample — `Sample::finalizeAfterLoad`
 * does `lengthInSamples = audioDataLengthBytes / (byteDepth * numChannels)`
 * (`src/deluge/model/sample/sample.cpp:1715-1729`, upstream/community
 * bef6d9df) — and the zone end the firmware gives a freshly selected sample
 * is that length (`SampleHolder::setAudioFile`, sample_holder.cpp:128).
 * Writing `endSamplePos={frames}` therefore matches what the instrument
 * itself would save after loading the sample.
 */

export interface WavInfo {
  /** Sample frames in the data chunk (all channels together count as one frame). */
  frames: number
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Bytes in the data chunk. */
  dataBytes: number
}

/** Bytes at [offset, offset+length); short only at end of file. */
export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>

export const bufferReader = (data: Uint8Array): RangeReader => {
  return (offset, length) => Promise.resolve(data.subarray(offset, offset + length))
}

const fourCC = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])
const u32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8)

/**
 * Walk the chunk list until both `fmt ` and `data` have been seen. Chunks are
 * hopped over by their declared size (word-aligned), so a large LIST or cue
 * chunk before `data` costs one small read, not a transfer of its body.
 */
export async function readWavInfo(read: RangeReader): Promise<WavInfo> {
  const head = await read(0, 12)
  if (head.length < 12 || fourCC(head, 0) !== 'RIFF' || fourCC(head, 8) !== 'WAVE') {
    throw new Error('not a WAV file (no RIFF/WAVE header)')
  }
  let offset = 12
  let fmt: { channels: number; sampleRate: number; blockAlign: number; bitsPerSample: number } | null = null
  let dataBytes: number | null = null
  // A well-formed file needs 2 chunks; tolerate a few extras (LIST, fact, cue, bext…).
  for (let hops = 0; hops < 64 && (fmt === null || dataBytes === null); hops++) {
    const header = await read(offset, 8)
    if (header.length < 8) break
    const id = fourCC(header, 0)
    const size = u32(header, 4)
    if (id === 'fmt ') {
      const body = await read(offset + 8, 16)
      if (body.length < 16) throw new Error('WAV fmt chunk is truncated')
      fmt = {
        channels: u16(body, 2),
        sampleRate: u32(body, 4),
        blockAlign: u16(body, 12),
        bitsPerSample: u16(body, 14),
      }
    } else if (id === 'data') {
      dataBytes = size
    }
    offset += 8 + size + (size & 1)
  }
  if (fmt === null) throw new Error('WAV file has no fmt chunk')
  if (dataBytes === null) throw new Error('WAV file has no data chunk')
  if (fmt.blockAlign === 0) throw new Error('WAV fmt chunk has a zero block align')
  return {
    frames: Math.floor(dataBytes / fmt.blockAlign),
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    dataBytes,
  }
}
