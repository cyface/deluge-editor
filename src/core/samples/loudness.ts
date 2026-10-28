/**
 * How loud a drum hit sounds, for evening out a kit's rows: the loudest
 * short stretch of the sample after K-weighting, in dB.
 *
 * K-weighting is ITU-R BS.1770's ear model — a high shelf (+4 dB above
 * ~1.7 kHz) and a high-pass (below ~38 Hz) — so a kick's sub energy counts
 * for less and a hi-hat's top end for more, the way they are heard. The
 * filter coefficients are derived for the file's own rate from the
 * standard's analog prototypes (the derivation libebur128 and pyloudnorm
 * use), which reproduces the table BS.1770 prints for 48 kHz.
 *
 * BS.1770's own windows (400 ms momentary, 3 s short-term) are made for
 * programme material: a 60 ms hat inside a 400 ms window reads 8 dB quieter
 * than it sounds next to a kick. So the window here is 100 ms, about the
 * span over which the ear sums a short sound's loudness, and the figure is
 * the loudest such window. Channels are averaged, not summed, because the
 * Deluge plays a mono sample to both sides: a stereo file is not 3 dB
 * louder for having two channels.
 *
 * The number is only meaningful against another sample's: −0.691 dB is
 * BS.1770's offset, kept so a figure lands near the LUFS a meter would
 * show, but it is not LUFS.
 */

/** One biquad's coefficients, normalised so a0 is 1. */
export interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** The BS.1770 pre-filter (stage 1, the head's high shelf) at `sampleRate`. */
export function kShelf(sampleRate: number): Biquad {
  const gain = 3.999843853973347
  const q = 0.7071752369554196
  const fc = 1681.974450955533
  const k = Math.tan((Math.PI * fc) / sampleRate)
  const vh = 10 ** (gain / 20)
  const vb = vh ** 0.4996667741545416
  const a0 = 1 + k / q + k * k
  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  }
}

/** The BS.1770 RLB high-pass (stage 2) at `sampleRate`. Its numerator is [1, −2, 1] as the standard prints it. */
export function kHighPass(sampleRate: number): Biquad {
  const q = 0.5003270373238773
  const fc = 38.13547087602444
  const k = Math.tan((Math.PI * fc) / sampleRate)
  const a0 = 1 + k / q + k * k
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 }
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}

export interface LoudnessOptions {
  /** First frame played (the zone's `startSamplePos`). */
  start?: number
  /** Frame after the last played; 0 or omitted is the end of the file, as the firmware reads `endSamplePos="0"`. */
  end?: number
  /** Window length in ms. */
  windowMs?: number
}

/**
 * The loudness of `channels` (one Float32Array per channel, −1…1) at
 * `sampleRate`, in dB; `-Infinity` for silence. A sound shorter than the
 * window is measured as itself followed by silence — a short hit is heard
 * as quieter than a long one at the same level, and this is that.
 */
export function hitLoudness(channels: readonly Float32Array[], sampleRate: number, opts: LoudnessOptions = {}): number {
  const length = channels[0]?.length ?? 0
  const start = Math.max(0, Math.min(length, Math.floor(opts.start ?? 0)))
  const end = opts.end && opts.end > start ? Math.min(length, Math.floor(opts.end)) : length
  if (end <= start || channels.length === 0) return -Infinity
  const shelf = kShelf(sampleRate)
  const hp = kHighPass(sampleRate)
  // Mean square across channels, frame by frame.
  const power = new Float64Array(end - start)
  for (const ch of channels) {
    const z = filter(filter(ch.subarray(start, end), shelf), hp)
    for (let i = 0; i < z.length; i++) power[i] += (z[i] * z[i]) / channels.length
  }
  const win = Math.max(1, Math.round(((opts.windowMs ?? 100) * sampleRate) / 1000))
  const hop = Math.max(1, Math.round(win / 10))
  let best = 0
  let sum = 0
  // A running sum over [i - win, i): the window slides a frame at a time,
  // and is read every `hop` frames and once at the end.
  for (let i = 0; i < power.length; i++) {
    sum += power[i]
    if (i >= win) sum -= power[i - win]
    if ((i + 1) % hop === 0 || i === power.length - 1) best = Math.max(best, sum)
  }
  const ms = best / win
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity
}
