/**
 * Min/max peak buckets for waveform thumbnails: the whole sample reduced to
 * a fixed number of columns, each holding the extremes across all channels
 * in its slice. One full pass per sample, cached by the caller — drawing
 * never touches the audio again.
 */

export interface Peaks {
  min: Float32Array
  max: Float32Array
}

export function computePeaks(channels: readonly Float32Array[], buckets: number): Peaks {
  const min = new Float32Array(buckets)
  const max = new Float32Array(buckets)
  const length = channels[0]?.length ?? 0
  if (length === 0 || buckets <= 0) return { min, max }
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * length) / buckets)
    const end = Math.max(start + 1, Math.floor(((b + 1) * length) / buckets))
    let lo = Infinity
    let hi = -Infinity
    for (const ch of channels) {
      for (let i = start; i < end && i < ch.length; i++) {
        const v = ch[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    min[b] = lo === Infinity ? 0 : lo
    max[b] = hi === -Infinity ? 0 : hi
  }
  return { min, max }
}
