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
 *
 * With `{ tags: true }` the walk goes on past `data` to the `smpl` and `inst`
 * chunks, which is where a sampler records the note a file was recorded at.
 * The Deluge reads exactly these two (`AudioFile::loadFile`,
 * `src/deluge/storage/audio/audio_file.cpp:188-254`, upstream/community
 * bef6d9df) and what it makes of them is reproduced here byte for byte,
 * including the cases where it decides a declared note means "unset".
 */

export interface WavInfo {
  /** Sample frames in the data chunk (all channels together count as one frame). */
  frames: number
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Bytes in the data chunk. */
  dataBytes: number
  /**
   * The root note the file declares, fractional part included — the
   * firmware's `midiNoteFromFile`. Only read with `{ tags: true }`, and
   * absent when no chunk declares one the firmware would accept.
   */
  rootNote?: number
  /** Which chunk `rootNote` came from. The last one in the file wins, as on the Deluge. */
  rootFrom?: 'smpl' | 'inst'
  /** `smpl` loop points, in frames, as stored — only when the file declares exactly one loop. */
  loopStart?: number
  loopEnd?: number
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
 *
 * `tags` keeps walking to the end of the file instead of stopping at `data`,
 * because `smpl` and `inst` usually sit after it. That costs a few more small
 * reads — a round trip each over SysEx — so it is off unless the caller wants
 * the root note.
 */
export async function readWavInfo(read: RangeReader, { tags = false } = {}): Promise<WavInfo> {
  const head = await read(0, 12)
  if (head.length < 12 || fourCC(head, 0) !== 'RIFF' || fourCC(head, 8) !== 'WAVE') {
    throw new Error('not a WAV file (no RIFF/WAVE header)')
  }
  let offset = 12
  let fmt: { channels: number; sampleRate: number; blockAlign: number; bitsPerSample: number } | null = null
  let dataBytes: number | null = null
  let root: { note: number; from: 'smpl' | 'inst' } | null = null
  let loop: { start: number; end: number } | null = null
  // A well-formed file needs 2 chunks; tolerate a few extras (LIST, fact, cue, bext…).
  for (let hops = 0; hops < 64; hops++) {
    if (!tags && fmt !== null && dataBytes !== null) break
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
    } else if (tags && id === 'smpl') {
      const body = await read(offset + 8, 36)
      if (body.length >= 36) {
        const note = u32(body, 12)
        const fraction = u32(body, 16)
        // The Deluge takes an all-zero note *and* fraction to mean the field
        // was never filled in — plenty of exporters write the chunk regardless
        // — so a file is never rooted at C-2 by omission.
        if ((note !== 0 || fraction !== 0) && note < 128) {
          root = { note: note + fraction / 2 ** 32, from: 'smpl' }
        }
        // Loop points only when there is exactly one loop, as on the device:
        // it has one pair of markers and no way to choose between several.
        if (u32(body, 28) === 1) {
          const l = await read(offset + 44, 24)
          if (l.length >= 24) loop = { start: u32(l, 8), end: u32(l, 12) }
        }
      }
    } else if (tags && id === 'inst') {
      const body = await read(offset + 8, 7)
      if (body.length >= 7) {
        const note = body[0]
        // `fineTune` is signed, and the Deluge *subtracts* it — the chunk
        // measures how sharp the recording is, so the note it plays back at
        // sits that far below the one written down. Note 0 is taken at face
        // value here: the device applies its all-zero guard to `smpl` only.
        const fine = (body[1] << 24) >> 24
        if (note < 128) root = { note: note - fine * 0.01, from: 'inst' }
      }
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
    ...(root ? { rootNote: root.note, rootFrom: root.from } : {}),
    ...(loop ? { loopStart: loop.start, loopEnd: loop.end } : {}),
  }
}
