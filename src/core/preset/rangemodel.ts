/**
 * A sample oscillator's key ranges, as one list whichever shape the file uses.
 *
 * The firmware always holds a `Source`'s samples in a `ranges` array, but it
 * writes that array two ways (`Sound::writeSourceToFile`,
 * `processing/sound/sound.cpp:3615`, upstream/community bef6d9df): more than
 * one range goes in a `<sampleRanges>` array of `<sampleRange>` elements,
 * exactly one is flattened onto the `<osc>` itself — `fileName`, `transpose`
 * and `cents` as attributes plus a bare `<zone>` child. `sampleRanges()`
 * returns both as the same list, so the UI and the writer see the array the
 * firmware has in memory rather than two cases. Which shape a file used is
 * `isMultiSample()`; crossing between them is a write, and belongs in
 * `rangeedit.ts`.
 *
 * The pre-3.0 nested format needs no special handling here: `parseTree` turns
 * a leaf child element into an attribute of its parent, so a `<sampleRange>`
 * with `<rangeTopNote>53</rangeTopNote>` arrives with the same attributes as
 * the modern `rangeTopNote="53"` form (`src/core/xml/parse.ts`).
 */

import { child, childrenOf, type Attrs, type XmlElement } from '../xml/element'
import { rootCents } from './tuning'
import type { OscElement, SampleRangeAttrs, WavetableRangeElement, ZoneElement } from './types'

/**
 * `MultiRange`'s constructor default (`storage/multi_range/multi_range.cpp:20`)
 * and so what an absent `rangeTopNote` means. The firmware omits the attribute
 * on the topmost range; a file that writes 32767 explicitly means the same
 * thing, and both read here as an unbounded `topNote`.
 */
export const UNBOUNDED_TOP_NOTE = 32767

/** The element a range's fields live on: a `<sampleRange>`, or the `<osc>` itself in the single-sample form. */
export type RangeHost = XmlElement<SampleRangeAttrs, { zone: ZoneElement }>

export interface SampleRange {
  /** Position in the oscillator's list, matching document order. */
  index: number
  el: RangeHost
  /** Highest note this range sounds, inclusive; `undefined` on the topmost range, which is unbounded. */
  topNote?: number
  fileName?: string
  transpose: number
  cents: number
  /** The sample's root note in hundredths of a semitone — see `rootCents`. */
  rootCents: number
  zone?: ZoneElement
}

export interface WavetableRange {
  index: number
  el: WavetableRangeElement
  topNote?: number
  fileName?: string
}

/** An integer attribute, or `fallback` when absent or not a number. */
export const readInt = (s: string | undefined, fallback: number): number => {
  if (s === undefined) return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

/** Present but not a number — a hand-edited or damaged file. */
const unreadable = (s: string | undefined): boolean => s !== undefined && !Number.isFinite(Number(s))

/** A range's top note; `undefined` when absent, unbounded, or unreadable. */
export const topNoteOf = (attrs: { rangeTopNote?: string }): number | undefined => {
  if (attrs.rangeTopNote === undefined) return undefined
  const n = readInt(attrs.rangeTopNote, UNBOUNDED_TOP_NOTE)
  return n >= UNBOUNDED_TOP_NOTE ? undefined : n
}

/** Whether the oscillator uses the `<sampleRanges>` array rather than the flattened single-sample form. */
export const isMultiSample = (osc: OscElement): boolean => child(osc, 'sampleRanges') !== undefined

/**
 * The elements a sample oscillator's ranges live on, in document order: the
 * `<sampleRange>` children, or the `<osc>` itself when it carries the one
 * range the firmware flattens onto it.
 */
export function sampleRangeHosts(osc: OscElement): RangeHost[] {
  const set = child(osc, 'sampleRanges')
  if (set) return childrenOf(set, 'sampleRange')
  const flat = osc.attrs.type === 'sample' && (osc.attrs.fileName !== undefined || child(osc, 'zone') !== undefined)
  return flat ? [osc] : []
}

/**
 * Every sample range on the oscillator, in document order — one entry for the
 * single-sample form, none when the oscillator isn't a sample oscillator or
 * has no file at all.
 */
export function sampleRanges(osc: OscElement): SampleRange[] {
  return sampleRangeHosts(osc).map((el, index) => {
    const transpose = readInt(el.attrs.transpose, 0)
    const cents = readInt(el.attrs.cents, 0)
    return {
      index,
      el,
      topNote: topNoteOf(el.attrs),
      fileName: el.attrs.fileName,
      transpose,
      cents,
      rootCents: rootCents(transpose, cents),
      zone: child(el, 'zone'),
    }
  })
}

/**
 * A wavetable oscillator's ranges. These carry only `rangeTopNote` and
 * `fileName` — no zone, transpose or cents, which stay on the `<osc>` and
 * apply to every range (`sound.cpp:3695-3735`; the reader skips those tags
 * when `oscType == WAVETABLE`, `sound.cpp:3495`).
 */
export function wavetableRanges(osc: OscElement): WavetableRange[] {
  const set = child(osc, 'wavetableRanges')
  const hosts: WavetableRangeElement[] = set
    ? childrenOf(set, 'wavetableRange')
    : osc.attrs.type === 'wavetable' && osc.attrs.fileName !== undefined
      ? [osc as WavetableRangeElement]
      : []
  return hosts.map((el, index) => ({ index, el, topNote: topNoteOf(el.attrs), fileName: el.attrs.fileName }))
}

/**
 * Ranges this editor will not rewrite: ones keyed by velocity rather than by
 * note. Stock firmware has no such thing — the serializer writes
 * `rangeTopNote` and nothing else (sound.cpp:3619) — but a fork that adds
 * velocity layers to drum rows writes `rangeTopVelocity` in its place, and
 * those files are on real cards. Such a range has no top *note* at all, so
 * ordering or repairing it would invent bounds the file never had. Every
 * write refuses, and the ranges pass through untouched.
 */
export const isVelocityKeyed = (osc: OscElement): boolean =>
  sampleRangeHosts(osc).some((host) => (host.attrs as Attrs).rangeTopVelocity !== undefined)

/**
 * Whether any range carries a `rangeTopNote`, `transpose` or `cents` that is
 * not a number. Reading tolerates it — a bad top note reads as unbounded, bad
 * tuning as zero — so the ranges still display; writing does not, since a
 * normaliser that took the misread value at face value would rewrite the
 * file around a number it never understood.
 */
export const hasUnreadableRange = (osc: OscElement): boolean =>
  sampleRangeHosts(osc).some(
    (host) => unreadable(host.attrs.rangeTopNote) || unreadable(host.attrs.transpose) || unreadable(host.attrs.cents),
  )

/** Ranges no write may touch: keyed by velocity, or carrying a field this code cannot read. */
export const rangesLocked = (osc: OscElement): boolean => isVelocityKeyed(osc) || hasUnreadableRange(osc)

/** The notes a range sounds, inclusive at both ends. */
export interface KeySpan {
  low: number
  high: number
}

/**
 * Which notes each range sounds, aligned to the ranges given.
 *
 * The firmware searches the ranges in top-note order for the first top note
 * `>= key` and clamps to the last (`Source::getRange`,
 * `processing/source.cpp:137-151`), so a top note is **inclusive**, the
 * lowest range also catches everything beneath it, and the topmost catches
 * everything above whatever its own top note says. Ranges are ordered by top
 * note here because that is the order the firmware's reader inserts them in,
 * whatever order the file listed them.
 *
 * A range that can never sound — a top note at or below one already covered,
 * which is a duplicate the instrument would refuse to load — gets `undefined`.
 */
export function keySpans(
  ranges: readonly { topNote?: number }[],
  lowest = 0,
  highest = 127,
): (KeySpan | undefined)[] {
  const order = ranges
    .map((r, i) => ({ i, top: r.topNote ?? UNBOUNDED_TOP_NOTE }))
    .sort((a, b) => a.top - b.top)
  if (order.length > 0) order[order.length - 1].top = Infinity
  const spans: (KeySpan | undefined)[] = ranges.map(() => undefined)
  let low = lowest
  for (const { i, top } of order) {
    const high = Math.min(top, highest)
    if (high >= low) {
      spans[i] = { low, high }
      low = high + 1
    }
  }
  return spans
}

/**
 * The ranges in sounding order — lowest top note first, the topmost last.
 *
 * This is the order the firmware's reader builds in memory whatever order the
 * file listed (`sound.cpp:3542`), the order `normalizeRanges` puts the
 * document in, and so the order every writer's `index` counts in. An editor
 * showing ranges to a user shows them in this order; a file written out of
 * order simply displays sorted before its first edit tidies it.
 */
export const soundingOrder = (ranges: readonly SampleRange[]): SampleRange[] =>
  [...ranges].sort((a, b) => (a.topNote ?? UNBOUNDED_TOP_NOTE) - (b.topNote ?? UNBOUNDED_TOP_NOTE))

/** The index of the range that sounds `note`, or -1 when there are none (`Source::getRangeIndex`, source.cpp:153). */
export function rangeIndexAt(ranges: readonly { topNote?: number }[], note: number): number {
  if (ranges.length === 0) return -1
  if (ranges.length === 1) return 0
  const order = ranges
    .map((r, i) => ({ i, top: r.topNote ?? UNBOUNDED_TOP_NOTE }))
    .sort((a, b) => a.top - b.top)
  return (order.find((r) => r.top >= note) ?? order[order.length - 1]).i
}
