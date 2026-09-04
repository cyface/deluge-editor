/**
 * WAV bytes built to the RIFF spec, for tests that need a sample file to
 * read. Not a fixture: the fixture rule (`tests/fixtures/README.md`) covers
 * Deluge preset XML, where the firmware is the authority. RIFF is a public
 * format, and these bytes only exercise our chunk walk — including layouts
 * the canonical 44-byte header doesn't have.
 *
 * Runs under both the browser (vitest, happy-dom) and Node (Playwright
 * specs), so it uses `Uint8Array`/`DataView` only — no `Buffer`.
 */

export interface WavSpec {
  channels?: number
  sampleRate?: number
  bitsPerSample?: number
  frames?: number
  /**
   * A MIDI unity note to declare in a `smpl` chunk after the data — the
   * strongest signal in the root cascade, and the one a file name can't
   * stand in for. Omit for a file whose name has to carry it.
   */
  root?: number
  /** Chunks between `fmt ` and `data`, body zeroed. */
  preDataChunks?: { id: string; size: number }[]
  /** Chunks after `data`. */
  postDataChunks?: { id: string; body: Uint8Array }[]
}

/** A `smpl` chunk body: 9 words, then one 6-word loop record per loop. */
export function smplChunk({
  note = 60,
  fraction = 0,
  loops = [] as { start: number; end: number }[],
}): Uint8Array {
  const body = new Uint8Array(36 + loops.length * 24)
  const dv = new DataView(body.buffer)
  dv.setUint32(12, note, true) // dwMIDIUnityNote
  dv.setUint32(16, fraction, true) // dwMIDIPitchFraction
  dv.setUint32(28, loops.length, true) // cSampleLoops
  loops.forEach((l, i) => {
    dv.setUint32(36 + i * 24 + 8, l.start, true)
    dv.setUint32(36 + i * 24 + 12, l.end, true)
  })
  return body
}

/** PCM WAV bytes. Defaults: stereo 16-bit at 44.1 kHz, 100 frames, canonical header. */
export function wavBytes({
  channels = 2,
  sampleRate = 44100,
  bitsPerSample = 16,
  frames = 100,
  root,
  preDataChunks = [],
  postDataChunks = [],
}: WavSpec = {}): Uint8Array {
  const post = root === undefined ? postDataChunks : [...postDataChunks, { id: 'smpl', body: smplChunk({ note: root }) }]
  const blockAlign = (bitsPerSample / 8) * channels
  const dataBytes = frames * blockAlign
  const pre = preDataChunks.reduce((n, c) => n + 8 + c.size + (c.size & 1), 0)
  const tail = post.reduce((n, c) => n + 8 + c.body.length + (c.body.length & 1), 0)
  const total = 4 + 24 + pre + 8 + dataBytes + tail
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
  at += 8 + dataBytes
  for (const c of post) {
    ascii(at, c.id)
    dv.setUint32(at + 4, c.body.length, true)
    out.set(c.body, at + 8)
    at += 8 + c.body.length + (c.body.length & 1)
  }
  return out
}

/** A 16-bit mono WAV at 44.1 kHz of `frames` frames, optionally declaring its root. */
export const monoWav = (frames: number, root?: number): Uint8Array => wavBytes({ channels: 1, frames, root })

/**
 * A WAV whose every byte is ≤ 0x7F, as a latin1 string — the e2e fake card's
 * seed crosses into the page as JSON text and is UTF-8 encoded there, so only
 * ASCII-safe bytes survive. 4096 Hz mono 16-bit keeps every header word under
 * 0x80; `frames` must stay ≤ 45 so the RIFF size does too.
 */
export function asciiWav(frames: number): string {
  const bytes = wavBytes({ channels: 1, sampleRate: 4096, frames })
  const high = bytes.findIndex((b) => b > 0x7f)
  if (high >= 0) throw new Error(`asciiWav(${frames}): byte ${high} is 0x${bytes[high].toString(16)}; keep frames ≤ 45`)
  return String.fromCharCode(...bytes)
}
