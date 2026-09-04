/**
 * Turning a folder of samples with known root notes into a multi-sampled
 * oscillator: where the key boundaries fall, what each range's zone is, and
 * which repeat mode the set implies.
 *
 * All three rules are the instrument's own, because a folder imported here and
 * the same folder imported on the device should give the same instrument. The
 * roots are ours (`src/core/samples/roots.ts`); everything downstream of them
 * is the firmware's:
 *
 * - boundaries at the midpoint between adjacent roots
 *   (`SampleBrowser::importFolderAsMultisamples`, `sample_browser.cpp:1640`,
 *   upstream/community bef6d9df);
 * - the zone a freshly selected sample gets, loop points and all
 *   (`SampleHolderForVoice::sampleBeenSet`, `sample_holder_for_voice.cpp:170-203`);
 * - repeat mode inferred from the set's loop points and average length
 *   (`sample_browser.cpp:1810-1863`).
 *
 * Boundaries are computed **only** here, when an import is built. Nothing
 * recomputes them on load: across the presets on Tim's card the midpoint rule
 * holds for 716 of 783 adjacent pairs, and every miss is a preset a human
 * touched. A boundary that doesn't match the midpoint is a decision, not a
 * defect.
 */

import { OSC_ATTR_ORDER } from './order'
import { replaceRanges, rootToTransposeCents, type NewRange, type RangeZone } from './ranges'
import type { OscElement } from './types'
import { setAttr } from '../xml/edit'

/** One sample on its way into an oscillator, with its root already resolved. */
export interface ImportSample {
  /** The path as the preset will carry it, e.g. `SAMPLES/Piano/C3.wav`. */
  fileName: string
  /** The resolved root, in cents. */
  root: number
  /** Frames in the file — `readWavInfo`. Without it the zone is left open-ended. */
  frames?: number
  /** Loop points the WAV declares, in frames. */
  loopStart?: number
  loopEnd?: number
  /** Length in milliseconds, for the repeat mode. */
  ms?: number
}

/** `loopMode` as the file stores it (`SampleRepeatMode`); `LOOP_MODE_NAMES` in `names.ts` is keyed by these. */
export const LOOP_MODE = { cut: '0', once: '1', loop: '2', stretch: '3' } as const

export interface ImportResult {
  /** Ranges actually written. */
  written: number
  /** Files left out because their root sits too close to the one below to get a band of its own. */
  crowdedOut: string[]
  loopMode: string
}

/**
 * The zone the instrument gives a sample the moment it is chosen: the whole
 * file, then the WAV's own loop points folded in.
 *
 * A loop that ends with less waveform after it than the loop itself is treated
 * as the end of the sample rather than as a loop — the tail is a fade the
 * player would never reach — so the zone is cut there and no loop is marked.
 * Otherwise the loop end is kept as a loop end. Either way the loop start
 * comes across when it isn't nonsense, and a loop end past the end of the file
 * is ignored entirely.
 */
export function importZone(sample: Pick<ImportSample, 'frames' | 'loopStart' | 'loopEnd'>): RangeZone {
  const frames = sample.frames ?? 0
  const zone: RangeZone = { startSamplePos: 0, endSamplePos: frames }
  const end = sample.loopEnd ?? 0
  const start = sample.loopStart ?? 0
  if (end === 0 || end > frames) return zone
  if (end - start >= frames - end) zone.endSamplePos = end
  else zone.endLoopPos = end
  // The device stores a start of 0 and notes that zero already means "no loop
  // start"; the serializer then omits it, so it is left off here too.
  if (start > 0 && start < frames && start < end) zone.startLoopPos = start
  return zone
}

/**
 * Where the boundaries fall between roots given in ascending order: each range
 * runs up to the midpoint between its root and the next, rounded down, and the
 * topmost is unbounded.
 *
 * A root close enough to the one below that the midpoint doesn't clear the
 * previous boundary gets `undefined` — there is no band left for it. The
 * device drops such a sample from the import without saying so; here the
 * caller is told which files they were.
 */
export function midpointTopNotes(roots: readonly number[]): (number | undefined)[] {
  const tops: (number | undefined)[] = []
  let last = -1
  for (let i = 0; i < roots.length; i++) {
    if (i === roots.length - 1) {
      tops.push(undefined)
      break
    }
    const top = Math.floor((roots[i] + roots[i + 1]) / 200)
    if (top <= last) tops.push(undefined)
    else {
      tops.push(top)
      last = top
    }
  }
  return tops
}

/**
 * The repeat mode a set of samples implies. Loop points on at least half the
 * files mean the instrument was sampled to loop; whether that becomes `once`
 * or `loop` turns on whether those loops survived into zones (a loop cut short
 * by `importZone` did not) and on the set being short enough to play out.
 * Without loop points it comes down to length alone: short samples play once,
 * long ones are cut off by the note ending.
 */
export function inferLoopMode(samples: readonly ImportSample[]): string {
  if (samples.length === 0) return LOOP_MODE.cut
  const withLoops = samples.filter((s) => s.loopEnd).length
  const withZoneLoops = samples.filter((s) => importZone(s).endLoopPos).length
  const average = samples.reduce((total, s) => total + (s.ms ?? 0), 0) / samples.length
  if (withLoops * 2 >= samples.length) {
    return withZoneLoops * 2 >= samples.length && average < 2002 ? LOOP_MODE.once : LOOP_MODE.loop
  }
  return average < 2002 ? LOOP_MODE.once : LOOP_MODE.cut
}

/** One sample's place in the instrument: the band it gets, or none at all. */
export interface FittedSample {
  sample: ImportSample
  /** Where its band ends; absent on the topmost range, which is unbounded. */
  topNote?: number
  /** True when its root sits too close to the one below to get a band of its own. */
  crowded: boolean
}

/**
 * Where each sample lands, in root order. The review table shows this before
 * anything is written and `buildMultisample` writes exactly it, so what the
 * user is shown and what the oscillator gets cannot drift apart.
 */
export function fitSamples(samples: readonly ImportSample[]): FittedSample[] {
  const sorted = [...samples].sort((a, b) => a.root - b.root || a.fileName.localeCompare(b.fileName))
  const tops = midpointTopNotes(sorted.map((s) => s.root))
  // Only the last range may be unbounded; an earlier one with no band left
  // would claim everything above it and shadow the rest.
  return sorted.map((sample, i) => ({
    sample,
    topNote: tops[i],
    crowded: tops[i] === undefined && i !== sorted.length - 1,
  }))
}

/**
 * Build the oscillator's ranges from a folder of samples. Order is by root,
 * which is the order the boundaries are computed in; a sample with no root is
 * the caller's to resolve or leave out, and is refused here rather than
 * guessed at.
 */
export function buildMultisample(osc: OscElement, samples: readonly ImportSample[]): ImportResult {
  const fitted = fitSamples(samples)
  const specs: (NewRange & { topNote?: number })[] = []
  const crowdedOut: string[] = []
  for (const { sample, topNote, crowded } of fitted) {
    if (crowded) {
      crowdedOut.push(sample.fileName)
      continue
    }
    const { transpose, cents } = rootToTransposeCents(sample.root)
    specs.push({ fileName: sample.fileName, topNote, transpose, cents, zone: importZone(sample) })
  }

  const loopMode = inferLoopMode(fitted.map((f) => f.sample))
  if (!replaceRanges(osc, specs)) return { written: 0, crowdedOut, loopMode }
  // The device sets the mode as part of the import, so it is part of the build
  // rather than something the caller has to remember to apply.
  setAttr(osc, 'loopMode', loopMode, OSC_ATTR_ORDER)
  return { written: specs.length, crowdedOut, loopMode }
}
