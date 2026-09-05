/**
 * Audio preview of a preset's samples. Bytes come from the session's local
 * stash when the sample was built from files on this computer, and over SysEx
 * from the card when a Deluge is connected — decoded once and cached. The
 * AudioContext is created on the first click (browsers require a gesture).
 */

import { cardPath } from '../../core/library'
import { computePeaks, type Peaks } from '../../core/samples/peaks'
import { NOT_ON_THIS_COMPUTER } from '../copy'
import { errorText } from '../errtext'
import { Activity } from './activity.svelte'
import { card } from './card.svelte'
import { samples } from './samples.svelte'

class AudioPreview extends Activity {
  /** fileName of the row playing right now. The one loading is `busy`; the last failure is `error`. */
  playing = $state<string | null>(null)
  /** Bumped whenever a decode lands, so waveform thumbnails re-derive. */
  version = $state(0)

  private ctx: AudioContext | null = null
  private cache = new Map<string, AudioBuffer>()
  private peaks = new Map<string, Peaks>()
  private decoding = new Set<string>()
  private source: AudioBufferSourceNode | null = null

  /**
   * Where card-only bytes come from while the sample library is browsing a
   * card in a reader rather than the Deluge (`state/library.svelte.ts`):
   * the same XML path, read from the mounted folder. Null means the Deluge.
   */
  mounted: ((fileName: string) => Promise<Uint8Array>) | null = null

  /** Preview needs bytes: local, already decoded, or fetchable from the card. */
  canPreview(fileName: string): boolean {
    void this.version // the cache is a plain Map; a decode landing is what changes the answer
    return this.cache.has(fileName) || samples.bytes.has(fileName) || this.mounted !== null || card.connected
  }

  stop(): void {
    try {
      this.source?.stop()
    } catch {
      // already ended
    }
    this.source = null
    this.playing = null
  }

  async toggle(fileName: string, reversed = false): Promise<void> {
    if (this.playing === fileName) {
      this.stop()
      return
    }
    this.stop()
    // Toggle A, then B while A's read is pending: B supersedes, so A's node
    // must not start and A's finish must not clear B's busy line.
    await this.run(
      fileName,
      async (live) => {
        try {
          const buffer0 = await this.load(fileName)
          if (!live()) return
          // The cache may have been filled by the background thumbnail decode
          // (OfflineAudioContext), so the playback context can still be missing
          // here — and this click is exactly the gesture that may create it.
          this.ctx ??= new AudioContext()
          const ctx = this.ctx
          const buffer = reversed ? this.reversedOf(fileName, buffer0) : buffer0
          if (ctx.state === 'suspended') await ctx.resume()
          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(ctx.destination)
          source.onended = () => {
            if (this.source === source) {
              this.source = null
              this.playing = null
            }
          }
          this.source = source
          this.playing = fileName
          source.start()
        } catch (e) {
          throw new Error(`${fileName}: ${errorText(e)}`)
        }
      },
      { supersede: true },
    )
  }

  /**
   * Waveform peaks for a thumbnail, or null when the audio isn't decoded
   * yet. Local bytes kick off a one-time background decode (no user gesture
   * needed — OfflineAudioContext); card-only samples get a thumbnail as a
   * side effect of previewing them, never an unasked-for SysEx transfer.
   */
  peaksFor(fileName: string, buckets: number): Peaks | null {
    void this.version // re-derive when a decode lands
    const key = `${fileName}@${buckets}`
    const hit = this.peaks.get(key)
    if (hit) return hit
    const buffer = this.cache.get(fileName)
    if (buffer) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
      const computed = computePeaks(channels, buckets)
      this.peaks.set(key, computed)
      return computed
    }
    const bytes = samples.bytes.get(fileName)
    if (bytes && !this.decoding.has(fileName)) {
      this.decoding.add(fileName)
      void this.decodeLocal(fileName, bytes)
    }
    return null
  }

  private async decodeLocal(fileName: string, bytes: Uint8Array): Promise<void> {
    try {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(copy)
      this.cache.set(fileName, buffer)
    } catch {
      // a broken file simply has no thumbnail; preview reports its own errors
    } finally {
      this.version++
    }
  }

  /** The row plays backwards: preview does too. Reversed copies are cached beside the forward decode. */
  private reversedOf(fileName: string, buffer: AudioBuffer): AudioBuffer {
    const key = `${fileName}#rev`
    const hit = this.cache.get(key)
    if (hit) return hit
    const out = this.ctx!.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch).slice()
      data.reverse()
      out.copyToChannel(data, ch)
    }
    this.cache.set(key, out)
    return out
  }

  private async load(fileName: string): Promise<AudioBuffer> {
    const hit = this.cache.get(fileName)
    if (hit) return hit
    this.ctx ??= new AudioContext()
    let bytes = samples.bytes.get(fileName)
    if (!bytes && this.mounted) bytes = await this.mounted(fileName)
    if (!bytes) {
      if (!card.connected) {
        throw new Error(NOT_ON_THIS_COMPUTER)
      }
      bytes = await card.readFile(cardPath(fileName), (done, total) => (this.progress = total ? done / total : 0))
    }
    // decodeAudioData detaches its buffer, so hand it a copy, not the stash.
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const buffer = await this.ctx.decodeAudioData(copy)
    this.cache.set(fileName, buffer)
    this.version++ // a previewed card sample gains a thumbnail too
    return buffer
  }
}

export const audio = new AudioPreview()
