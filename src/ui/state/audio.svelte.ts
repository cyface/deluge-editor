/**
 * Audio preview of a preset's samples. Bytes come from the session's local
 * stash when the sample was built from files on this computer, and over SysEx
 * from the card when a Deluge is connected — decoded once and cached. The
 * AudioContext is created on the first click (browsers require a gesture).
 */

import { untrack } from 'svelte'
import { cardPath } from '../../core/library'
import { hitLoudness } from '../../core/samples/loudness'
import { computePeaks, type Peaks } from '../../core/samples/peaks'
import { NOT_ON_THIS_COMPUTER } from '../copy'
import { errorText } from '../errtext'
import { Activity } from './activity.svelte'
import { card } from './card.svelte'
import { samples } from './samples.svelte'

/** How a sample plays in preview: as its row plays it, where the row says. */
export interface PlayOptions {
  /** Gain relative to the file as it is, dB; 0 (the default) plays it unchanged. */
  gainDb?: number
  /** First frame played (the zone's `startSamplePos`). */
  start?: number
  /** Frame after the last played; 0 or omitted is the end of the file. */
  end?: number
}

/** One row's turn in `playInTurn`. */
export interface TurnItem extends PlayOptions {
  fileName: string
  reversed?: boolean
}

/** `playing` while `playInTurn` runs. Not a file name: no file is named this. */
export const IN_TURN = '*rows in turn*'
/** Each row's turn in `playInTurn`, seconds; a longer sample is cut there. */
const TURN_SECONDS = 0.5

class AudioPreview extends Activity {
  /** fileName of the row playing right now. The one loading is `busy`; the last failure is `error`. */
  playing = $state<string | null>(null)
  /** Bumped whenever a decode lands, so waveform thumbnails re-derive. */
  version = $state(0)

  private ctx: AudioContext | null = null
  private cache = new Map<string, AudioBuffer>()
  private peaks = new Map<string, Peaks>()
  private levels = new Map<string, number>()
  private decoding = new Set<string>()
  /** Counts prefetch runs, so a newer preset or connection retires the older run. */
  private prefetchGen = 0
  private sources: AudioBufferSourceNode[] = []

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
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // already ended, or never started
      }
    }
    this.sources = []
    this.playing = null
  }

  /** A source for `buffer` through a gain of `gainDb`, wired to the speakers. */
  private node(ctx: AudioContext, buffer: AudioBuffer, gainDb: number): AudioBufferSourceNode {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    if (gainDb === 0) source.connect(ctx.destination)
    else {
      const gain = ctx.createGain()
      gain.gain.value = gainDb === -Infinity ? 0 : 10 ** (gainDb / 20)
      source.connect(gain).connect(ctx.destination)
    }
    return source
  }

  /** The zone `opts` names, in seconds of `buffer`, read the way the row plays it (a reversed row starts from the zone's end). */
  private span(buffer: AudioBuffer, reversed: boolean, opts: PlayOptions): { offset: number; duration: number } {
    const start = Math.max(0, Math.min(buffer.length, opts.start ?? 0))
    const end = opts.end && opts.end > start ? Math.min(buffer.length, opts.end) : buffer.length
    const from = reversed ? buffer.length - end : start
    return { offset: from / buffer.sampleRate, duration: (end - start) / buffer.sampleRate }
  }

  async toggle(fileName: string, reversed = false, opts: PlayOptions = {}): Promise<void> {
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
          const source = this.node(ctx, buffer, opts.gainDb ?? 0)
          source.onended = () => {
            if (this.sources.includes(source)) {
              this.sources = []
              this.playing = null
            }
          }
          this.sources = [source]
          this.playing = fileName
          const { offset, duration } = this.span(buffer, reversed, opts)
          source.start(0, offset, duration)
        } catch (e) {
          throw new Error(`${fileName}: ${errorText(e)}`)
        }
      },
      { supersede: true },
    )
  }

  /**
   * The rows one after another, each as its row plays it, half a second
   * apart — so their levels can be compared by ear without a click per
   * row. A second call while they play stops them. Samples not yet in the
   * browser are read first, as a preview would.
   */
  async playInTurn(items: readonly TurnItem[]): Promise<void> {
    if (this.playing === IN_TURN) {
      this.stop()
      return
    }
    this.stop()
    await this.run(
      'Playing the rows in turn',
      async (live) => {
        const buffers: AudioBuffer[] = []
        for (const item of items) {
          const buffer = await this.load(item.fileName)
          buffers.push(item.reversed ? this.reversedOf(item.fileName, buffer) : buffer)
        }
        if (!live() || items.length === 0) return
        this.ctx ??= new AudioContext()
        const ctx = this.ctx
        if (ctx.state === 'suspended') await ctx.resume()
        const t0 = ctx.currentTime + 0.05
        const sources = items.map((item, i) => {
          const source = this.node(ctx, buffers[i], item.gainDb ?? 0)
          const { offset, duration } = this.span(buffers[i], !!item.reversed, item)
          source.start(t0 + i * TURN_SECONDS, offset, Math.min(duration, TURN_SECONDS))
          return source
        })
        sources[sources.length - 1].onended = () => {
          if (this.sources === sources) {
            this.sources = []
            this.playing = null
          }
        }
        this.sources = sources
        this.playing = IN_TURN
      },
      { supersede: true },
    )
  }

  /** The decoded audio, or undefined while it isn't; local bytes start decoding on the first ask. */
  private buffer(fileName: string): AudioBuffer | undefined {
    void this.version // re-derive when a decode lands
    const hit = this.cache.get(fileName)
    if (hit) return hit
    const bytes = samples.bytes.get(fileName)
    if (bytes && !this.decoding.has(fileName)) {
      this.decoding.add(fileName)
      void this.decodeLocal(fileName, bytes)
    }
    return undefined
  }

  /**
   * How loud the zone `start`…`end` of a sample is (`hitLoudness`, dB), or
   * null while its audio isn't in the browser. Cached per zone: the rows
   * table asks on every render.
   */
  loudnessFor(fileName: string, start = 0, end = 0): number | null {
    const key = `${fileName}@${start}-${end}`
    const hit = this.levels.get(key)
    if (hit !== undefined) return hit
    const buffer = this.buffer(fileName)
    if (!buffer) return null
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    const level = hitLoudness(channels, buffer.sampleRate, { start, end })
    this.levels.set(key, level)
    return level
  }

  /**
   * Waveform peaks for a thumbnail, or null when the audio isn't decoded
   * yet. Local bytes kick off a one-time background decode (no user gesture
   * needed — OfflineAudioContext); card-only samples arrive by `prefetch`,
   * or by being previewed.
   */
  peaksFor(fileName: string, buckets: number): Peaks | null {
    void this.version // re-derive when a decode lands
    const key = `${fileName}@${buckets}`
    const hit = this.peaks.get(key)
    if (hit) return hit
    const buffer = this.buffer(fileName)
    if (!buffer) return null
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    const computed = computePeaks(channels, buckets)
    this.peaks.set(key, computed)
    return computed
  }

  /**
   * Thumbnails for samples that live only on the card: each one the session
   * has no bytes or decode for is read over SysEx, one at a time, and decoded
   * off the audio graph — so a kit opened from the Deluge shows its waveforms
   * without a click per row. The reads give way: while the card or a preview
   * is busy with something asked for, the next read waits. A newer call (the
   * preset names other files, the connection went) or `cancelPrefetch` ends
   * the run between files. A file the card lacks is skipped; the missing
   * check is what reports it.
   */
  async prefetch(files: readonly string[]): Promise<void> {
    const gen = ++this.prefetchGen
    const current = () => gen === this.prefetchGen && card.connected
    for (const fileName of files) {
      if (this.cache.has(fileName) || samples.bytes.has(fileName) || this.decoding.has(fileName)) continue
      while (current() && (card.busy !== null || this.busy !== null)) await new Promise((r) => setTimeout(r, 200))
      if (!current()) return
      if (samples.missing.has(fileName)) continue
      this.decoding.add(fileName)
      try {
        const bytes = await card.readFile(cardPath(fileName))
        if (!this.cache.has(fileName)) this.cache.set(fileName, await decodeOffline(bytes))
      } catch {
        // not on the card, or not audio: no thumbnail, and a preview says why
      } finally {
        this.decoding.delete(fileName)
        this.version++
      }
    }
  }

  cancelPrefetch(): void {
    this.prefetchGen++
  }

  private async decodeLocal(fileName: string, bytes: Uint8Array): Promise<void> {
    try {
      this.cache.set(fileName, await decodeOffline(bytes))
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

/** Decode without a playback context (no gesture needed); the buffer plays in any context. decodeAudioData detaches its input, so it gets a copy. */
function decodeOffline(bytes: Uint8Array): Promise<AudioBuffer> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(copy)
}

export const audio = new AudioPreview()

// A preset opened from (or connected to) the card fetches its samples'
// thumbnails, keyed like the missing-on-card check (`card.svelte.ts`): the
// connection, and the set of files the preset names — not every attribute.
$effect.root(() => {
  $effect(() => {
    const connected = card.status === 'connected'
    void samples.fileKey
    untrack(() => (connected ? void audio.prefetch(samples.files()) : audio.cancelPrefetch()))
  })
})
