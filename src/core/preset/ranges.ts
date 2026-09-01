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
 * `isMultiSample()`; crossing between them is a write, and belongs in the
 * editing layer.
 *
 * The pre-3.0 nested format needs no special handling here: `parseTree` turns
 * a leaf child element into an attribute of its parent, so a `<sampleRange>`
 * with `<rangeTopNote>53</rangeTopNote>` arrives with the same attributes as
 * the modern `rangeTopNote="53"` form (`src/core/xml/parse.ts`).
 */

import { child, childrenOf, element, type Attrs, type XmlElement } from '../xml/element'
import { ensureChild, insertChild, removeAttr, removeChild, setAttr } from '../xml/edit'
import { MIDDLE_C, noteName } from './notes'
import { OSC_CHILD_ORDER, SAMPLE_OSC_ATTR_ORDER, SAMPLE_RANGE_ATTR_ORDER, ZONE_ATTR_ORDER } from './order'
import type {
  OscElement,
  SampleRangeAttrs,
  SampleRangeElement,
  SampleRangesElement,
  WavetableRangeElement,
  ZoneAttrs,
  ZoneElement,
} from './types'

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

const int = (s: string | undefined, fallback: number): number => {
  if (s === undefined) return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

const topNoteOf = (attrs: { rangeTopNote?: string }): number | undefined => {
  if (attrs.rangeTopNote === undefined) return undefined
  const n = int(attrs.rangeTopNote, UNBOUNDED_TOP_NOTE)
  return n >= UNBOUNDED_TOP_NOTE ? undefined : n
}

/**
 * The root note `transpose`/`cents` encode, in hundredths of a semitone.
 *
 * The firmware derives them from a sample's detected pitch as
 * `semitones = 60 - midiNote`, split into whole semitones and cents
 * (`SampleHolderForVoice::setTransposeAccordingToSamplePitch`,
 * `model/sample/sample_holder_for_voice.cpp:137`). Reading them back the same
 * way is what lets the editor show the root note the instrument would show
 * without storing anything extra: the file already carries it losslessly.
 * Hundredths, not a float, so a value survives the round trip exactly.
 */
export const rootCents = (transpose: number, cents: number): number => MIDDLE_C * 100 - transpose * 100 - cents

/** Round half away from zero, C's `roundf` — never returning `-0`. */
function roundf(x: number): number {
  const n = Math.round(Math.abs(x))
  return x < 0 && n !== 0 ? -n : n
}

/**
 * The inverse of `rootCents`, split the way the firmware splits it. Only for
 * a root the *user* changed: `transpose`/`cents` a file already has are read
 * verbatim and never re-derived, since the instrument doesn't re-derive them
 * either and a stored pair can carry deliberate detuning.
 *
 * (The transpose *menu* splits ties the other way —
 * `computeFinalValuesForTranspose`, `gui/menu_item/value_scaling.cpp:68`,
 * rounds a half up rather than away from zero. Same pitch either way.)
 */
export function rootToTransposeCents(root: number): { transpose: number; cents: number } {
  const semitones = MIDDLE_C * 100 - root
  const transpose = roundf(semitones / 100)
  return { transpose, cents: semitones - transpose * 100 }
}

/** A root note as a note code plus its offset in cents, for display. */
export function rootParts(root: number): { note: number; cents: number } {
  const note = roundf(root / 100)
  return { note, cents: root - note * 100 }
}

/** `"C3"`, or `"F2 -8¢"` when the root sits between two notes. */
export function rootName(root: number, sharps = true): string {
  const { note, cents } = rootParts(root)
  return cents === 0 ? noteName(note, sharps) : `${noteName(note, sharps)} ${cents > 0 ? '+' : '-'}${Math.abs(cents)}¢`
}

/** Whether the oscillator uses the `<sampleRanges>` array rather than the flattened single-sample form. */
export const isMultiSample = (osc: OscElement): boolean => child(osc, 'sampleRanges') !== undefined

/**
 * The elements a sample oscillator's ranges live on, in document order: the
 * `<sampleRange>` children, or the `<osc>` itself when it carries the one
 * range the firmware flattens onto it.
 */
function sampleRangeHosts(osc: OscElement): RangeHost[] {
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
    const transpose = int(el.attrs.transpose, 0)
    const cents = int(el.attrs.cents, 0)
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
 * when `oscType == WAVETABLE`, `sound.cpp:3527`).
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

// ---- writing --------------------------------------------------------------

/**
 * Every write below leaves the oscillator in a state the instrument will load
 * and re-save unchanged:
 *
 * - Ranges are stored ascending by top note. The reader inserts them sorted
 *   (`ranges.search(...GREATER_OR_EQUAL)`, sound.cpp:3542) whatever order the
 *   file listed them in, so document order carries no information — but a
 *   file written out of order differs from the one the instrument would save.
 *   Ranges are reordered on the first edit, never on load.
 * - Top notes are strictly ascending and unique. A duplicate is
 *   `Error::FILE_CORRUPTED` and the whole preset fails to load
 *   (sound.cpp:3545-3550). They stay on the keyboard too, so every range
 *   sounds at least one note and none is left silent under the one below.
 * - Exactly one range — the last — has no `rangeTopNote`. That is how the
 *   firmware writes the topmost range (`e != numRanges - 1`, sound.cpp:3618),
 *   and `Source::getRange` clamps to it for anything above, so an explicit
 *   32767 is never written.
 * - The shape follows the count, as the serializer's `numRanges > 1` does:
 *   several ranges are a `<sampleRanges>` array, one is flattened onto the
 *   `<osc>`, and none at all leaves the oscillator with no sample.
 *
 * Wavetable ranges are read-only for now; they carry the same invariants but
 * a different shape (`fileName` only, no zone) and no editor asks yet.
 */

/**
 * The highest note a *bounded* range can store: `MultiRange::topNote` is an
 * `int16_t` (`storage/multi_range/multi_range.h`) whose top value is the
 * unbounded sentinel. Nothing reachable from an editor comes near it — the
 * instrument keeps a bounded top note in 1..126 (`multi_range.cpp:116-151`) —
 * it is only where a repair of a malformed file clamps.
 */
const MAX_STORED_TOP_NOTE = UNBOUNDED_TOP_NOTE - 1

/** The top of the keyboard. A bounded top note above 126 leaves the range above it silent. */
const HIGHEST_NOTE = 127

/** `SampleHolderForVoice::transpose` is an `int16_t`, `cents` an `int8_t`. */
const clampTranspose = (n: number): number => Math.max(-32768, Math.min(32767, Math.round(n)))
const clampCents = (n: number): number => Math.max(-128, Math.min(127, Math.round(n)))

/** A range's play window. `endSamplePos` 0 means the whole file: the firmware fills it in from the sample's length on load (`SampleHolder::setAudioFile`, sample_holder.cpp:134-136). */
export interface RangeZone {
  startSamplePos?: number
  endSamplePos?: number
  startLoopPos?: number
  endLoopPos?: number
}

/** A range to add: everything the firmware stores per range. */
export interface NewRange {
  fileName: string
  /** Pass the sample's frame count as `endSamplePos` where it is known — `src/core/kit/build.ts` reads it from the WAV header. */
  zone?: RangeZone
  transpose?: number
  cents?: number
}

/**
 * Ranges this editor will not rewrite: ones keyed by velocity rather than by
 * note. Stock firmware has no such thing — the serializer writes
 * `rangeTopNote` and nothing else (sound.cpp:3619) — but a fork that adds
 * velocity layers to drum rows writes `rangeTopVelocity` in its place, and
 * those files are on real cards. Such a range has no top *note* at all, so
 * ordering or repairing it would invent bounds the file never had. Every
 * write below refuses, and the ranges pass through untouched.
 */
export const isVelocityKeyed = (osc: OscElement): boolean =>
  sampleRangeHosts(osc).some((host) => (host.attrs as Attrs).rangeTopVelocity !== undefined)

const attrOrder = (host: RangeHost, osc: OscElement): readonly string[] =>
  host === (osc as RangeHost) ? SAMPLE_OSC_ATTR_ORDER : SAMPLE_RANGE_ATTR_ORDER

const sortKey = (host: RangeHost): number => topNoteOf(host.attrs) ?? UNBOUNDED_TOP_NOTE

function writeZone(host: RangeHost, zone: RangeZone | undefined): void {
  const el = ensureChild(host, 'zone', OSC_CHILD_ORDER)
  setAttr(el, 'startSamplePos', String(zone?.startSamplePos ?? 0), ZONE_ATTR_ORDER)
  setAttr(el, 'endSamplePos', String(zone?.endSamplePos ?? 0), ZONE_ATTR_ORDER)
  // The firmware writes the loop points only when set (sound.cpp:3638-3643).
  for (const key of ['startLoopPos', 'endLoopPos'] as const) {
    const v = zone?.[key]
    if (v) setAttr(el, key, String(v), ZONE_ATTR_ORDER)
    else removeAttr(el, key)
  }
}

function writeTuning(host: RangeHost, osc: OscElement, transpose: number, cents: number): void {
  // Each is written only when non-zero (sound.cpp:3626-3631).
  const order = attrOrder(host, osc)
  if (transpose) setAttr(host, 'transpose', String(clampTranspose(transpose)), order)
  else removeAttr(host, 'transpose')
  if (cents) setAttr(host, 'cents', String(clampCents(cents)), order)
  else removeAttr(host, 'cents')
}

/** Strip the flattened single-sample fields from the `<osc>`. */
function clearFlatRange(osc: OscElement): void {
  for (const key of ['fileName', 'transpose', 'cents'] as const) removeAttr(osc, key)
  const zone = child(osc, 'zone')
  if (zone) removeChild(osc, zone)
}

/** The `<sampleRanges>` array, moving a flattened single range into it if that is the shape the file has. */
function toMultiSample(osc: OscElement): SampleRangesElement {
  const existing = child(osc, 'sampleRanges')
  if (existing) return existing
  const set = element('sampleRanges') as SampleRangesElement
  for (const flat of sampleRangeHosts(osc)) {
    const host = element('sampleRange') as SampleRangeElement
    // In the serializer's order, so `rangeTopNote` (which comes first) still lands ahead of them.
    for (const key of ['fileName', 'transpose', 'cents'] as const) {
      if (flat.attrs[key] !== undefined) host.attrs[key] = flat.attrs[key]
    }
    host.children = flat.children.filter((c) => c.tag === 'zone')
    clearFlatRange(osc)
    set.children.push(host)
  }
  insertChild(osc, set, OSC_CHILD_ORDER)
  return set
}

/** Flatten a lone `<sampleRange>` back onto the `<osc>`, the shape the firmware writes for one range. */
function toSingleSample(osc: OscElement): void {
  const set = child(osc, 'sampleRanges')
  if (!set) return
  const hosts = childrenOf(set, 'sampleRange')
  if (hosts.length > 1) return
  removeChild(osc, set)
  clearFlatRange(osc)
  const host = hosts[0]
  if (!host) return
  for (const [key, value] of Object.entries(host.attrs)) {
    // The flattened form has no top note: one range is the topmost, and unbounded.
    if (key !== 'rangeTopNote' && value !== undefined) setAttr(osc, key, value, SAMPLE_OSC_ATTR_ORDER)
  }
  for (const c of host.children) insertChild(osc, c, OSC_CHILD_ORDER)
}

/**
 * Put the oscillator's ranges in the shape and order the firmware would write
 * them, repairing a file that breaks the invariants above. A well-formed
 * preset comes through untouched.
 */
export function normalizeRanges(osc: OscElement): void {
  const set = child(osc, 'sampleRanges')
  if (!set || isVelocityKeyed(osc)) return
  const sorted = childrenOf(set, 'sampleRange').sort((a, b) => sortKey(a) - sortKey(b))
  let next = 0
  set.children = set.children.map((c) => (c.tag === 'sampleRange' ? sorted[next++] : c))

  let floor = -1
  sorted.forEach((host, i) => {
    if (i === sorted.length - 1) {
      removeAttr(host, 'rangeTopNote')
      return
    }
    // Keep the range at least a note wide and on the keyboard — the bounds
    // the instrument's own editor enforces (multi_range.cpp:116-151) — so a
    // repaired range is one that can actually sound.
    const ceiling = Math.min(MAX_STORED_TOP_NOTE, Math.max(floor + 1, HIGHEST_NOTE - 1))
    const top = Math.max(floor + 1, Math.min(sortKey(host), ceiling))
    setAttr(host, 'rangeTopNote', String(top), SAMPLE_RANGE_ATTR_ORDER)
    floor = top
  })

  if (sorted.length <= 1) toSingleSample(osc)
}

/**
 * The range hosts a write may touch, in sounding order, normalising the
 * oscillator first so neighbours are the real ones. Velocity-keyed ranges are
 * not editable and come back empty, so every write over them fails cleanly.
 */
function orderedHosts(osc: OscElement): RangeHost[] {
  if (isVelocityKeyed(osc)) return []
  normalizeRanges(osc)
  return sampleRangeHosts(osc)
}

/**
 * Move the split point below the range above `index`.
 *
 * Clamped to the bounds the instrument's own encoder enforces
 * (`MultiRange::selectEncoderAction`, multi_range.cpp:116-151): above the
 * range below, below the range above, and inside 1..126 so both the bottom
 * and the topmost range keep at least one note. Returns the note actually
 * written, or `undefined` for the topmost range, whose top is unbounded and
 * not a value at all.
 */
export function setRangeTopNote(osc: OscElement, index: number, note: number): number | undefined {
  const hosts = orderedHosts(osc)
  const host = hosts[index]
  if (!host || index === hosts.length - 1) return undefined
  const minimum = index === 0 ? 1 : (topNoteOf(hosts[index - 1].attrs) ?? 0) + 1
  const maximum = index < hosts.length - 2 ? (topNoteOf(hosts[index + 1].attrs) ?? MAX_STORED_TOP_NOTE) - 1 : 126
  if (minimum > maximum) return undefined
  const top = Math.max(minimum, Math.min(Math.round(note), maximum))
  setAttr(host, 'rangeTopNote', String(top), SAMPLE_RANGE_ATTR_ORDER)
  return top
}

/** Point a range at a different sample. */
export function setRangeFileName(osc: OscElement, index: number, fileName: string): boolean {
  const hosts = orderedHosts(osc)
  const host = hosts[index]
  if (!host) return false
  setAttr(host, 'fileName', fileName, attrOrder(host, osc))
  return true
}

/** Replace a range's play window; absent fields fall back to the firmware's own defaults. */
export function setRangeZone(osc: OscElement, index: number, zone: RangeZone): boolean {
  const hosts = orderedHosts(osc)
  const host = hosts[index]
  if (!host) return false
  writeZone(host, zone)
  return true
}

/** Set a range's tuning directly. Either value at zero drops its attribute, as the firmware omits it. */
export function setRangeTuning(osc: OscElement, index: number, transpose: number, cents: number): boolean {
  const hosts = orderedHosts(osc)
  const host = hosts[index]
  if (!host) return false
  writeTuning(host, osc, transpose, cents)
  return true
}

/** Set a range's root note, in hundredths of a semitone — see `rootCents`. */
export function setRangeRoot(osc: OscElement, index: number, root: number): boolean {
  const { transpose, cents } = rootToTransposeCents(root)
  return setRangeTuning(osc, index, transpose, cents)
}

/**
 * Move every range by whole semitones — roots and the boundaries between them
 * together, so the instrument transposes as one piece and a boundary someone
 * placed by hand keeps its position relative to the samples either side.
 *
 * This is the repair for a sample library named against a different middle C
 * (`src/core/samples/roots.ts` fits that offset at import; this applies it
 * afterwards, to ranges that are already on the oscillator). Returns the
 * semitones actually applied — less than asked when a root would otherwise
 * leave the keyboard, and zero when there is nothing to move.
 */
export function shiftRanges(osc: OscElement, semitones: number): number {
  const hosts = orderedHosts(osc)
  if (hosts.length === 0 || semitones === 0) return 0
  const roots = hosts.map((h) => rootCents(int(h.attrs.transpose, 0), int(h.attrs.cents, 0)) / 100)
  const room = { down: -Math.floor(Math.min(...roots)), up: HIGHEST_NOTE - Math.ceil(Math.max(...roots)) }
  const by = Math.max(room.down, Math.min(semitones, room.up))
  if (by === 0) return 0
  hosts.forEach((host, i) => {
    const { transpose, cents } = rootToTransposeCents(roots[i] * 100 + by * 100)
    writeTuning(host, osc, transpose, cents)
    const top = topNoteOf(host.attrs)
    // The topmost range has no top note, and the rest stay on the keyboard;
    // `normalizeRanges` still holds the ordering afterwards.
    if (top !== undefined) {
      setAttr(host, 'rangeTopNote', String(Math.max(1, Math.min(126, top + by))), attrOrder(host, osc))
    }
  })
  normalizeRanges(osc)
  return by
}

function newRangeElement(spec: NewRange, osc: OscElement): SampleRangeElement {
  const host = element('sampleRange') as SampleRangeElement
  host.attrs.fileName = spec.fileName
  writeTuning(host, osc, spec.transpose ?? 0, spec.cents ?? 0)
  writeZone(host, spec.zone)
  return host
}

/**
 * Split the range at `index`, putting a new one above or below it.
 *
 * This is the instrument's own insert (`MultiRange::selectEncoderAction` with
 * shift held, multi_range.cpp:167-226): the range being split runs from the
 * one below's top note plus one (or note 0 at the bottom) to its own top note
 * (or 127 at the top), and the two ranges divide it at the midpoint — the new
 * one taking the upper half when inserted above, the lower half when
 * inserted below. A range only one note wide cannot be split, and returns
 * false, exactly as the instrument refuses with "Range contains one note".
 */
export function insertRange(
  osc: OscElement,
  index: number,
  where: 'above' | 'below',
  spec: NewRange,
): boolean {
  const hosts = orderedHosts(osc)
  if (index < 0 || index >= hosts.length) return false
  const bottom =
    index === 0 ? Math.min(sortKey(hosts[0]) - 1, 0) : (topNoteOf(hosts[index - 1].attrs) ?? 0) + 1
  const top = index === hosts.length - 1 ? Math.max(bottom + 1, 127) : (topNoteOf(hosts[index].attrs) ?? 127)
  if (top === bottom) return false
  const midPoint = (top + bottom) >> 1

  const set = toMultiSample(osc)
  const split = childrenOf(set, 'sampleRange')[index]
  const created = newRangeElement(spec, osc)
  const at = set.children.indexOf(split)
  if (where === 'above') {
    setAttr(created, 'rangeTopNote', String(top), SAMPLE_RANGE_ATTR_ORDER)
    setAttr(split, 'rangeTopNote', String(midPoint), SAMPLE_RANGE_ATTR_ORDER)
    set.children.splice(at + 1, 0, created)
  } else {
    setAttr(created, 'rangeTopNote', String(midPoint), SAMPLE_RANGE_ATTR_ORDER)
    set.children.splice(at, 0, created)
  }
  normalizeRanges(osc)
  return true
}

/**
 * Replace an oscillator's ranges outright, each with the top note it is given.
 *
 * The per-range editors above move one boundary at a time and use the
 * instrument's own split arithmetic to do it. An import doesn't: it arrives
 * with a whole instrument's worth of samples and boundaries already worked out
 * from their root notes, and applying a split rule to them one at a time would
 * fight the answer. So this writes the list and lets `normalizeRanges` hold
 * the invariants — ascending order, unique tops, the last one unbounded, and
 * the flat single-sample shape when only one survives.
 *
 * `topNote` is what the range is bounded at; leave it off for the topmost.
 * Returns false for an oscillator that isn't a sample, or whose ranges are
 * keyed by velocity and so are not ours to rewrite.
 */
export function replaceRanges(osc: OscElement, specs: readonly (NewRange & { topNote?: number })[]): boolean {
  if (osc.attrs.type !== 'sample' || isVelocityKeyed(osc)) return false
  const existing = child(osc, 'sampleRanges')
  if (existing) removeChild(osc, existing)
  clearFlatRange(osc)
  if (specs.length === 0) return true

  const set = element('sampleRanges') as SampleRangesElement
  for (const spec of specs) {
    const host = newRangeElement(spec, osc)
    if (spec.topNote !== undefined) setAttr(host, 'rangeTopNote', String(spec.topNote), SAMPLE_RANGE_ATTR_ORDER)
    set.children.push(host)
  }
  insertChild(osc, set, OSC_CHILD_ORDER)
  normalizeRanges(osc)
  return true
}

/**
 * Add a sample above every existing range, or as the oscillator's first if it
 * has none. Only a sample oscillator can hold ranges, so an oscillator of
 * another type is left alone — switching the type is a separate edit.
 */
export function addRange(osc: OscElement, spec: NewRange): boolean {
  if (osc.attrs.type !== 'sample' || isVelocityKeyed(osc)) return false
  const hosts = orderedHosts(osc)
  if (hosts.length > 0) return insertRange(osc, hosts.length - 1, 'above', spec)
  setAttr(osc, 'fileName', spec.fileName, SAMPLE_OSC_ATTR_ORDER)
  writeTuning(osc, osc, spec.transpose ?? 0, spec.cents ?? 0)
  writeZone(osc, spec.zone)
  return true
}

/**
 * Delete a range; the one below it takes over the space, as on the
 * instrument (`MultiRange::deletePress`, multi_range.cpp:300-329). Deleting
 * the bottom range needs no adjustment — the new bottom already catches
 * everything beneath it — deleting the top one makes the range below the new
 * unbounded top, and deleting one in the middle moves the split below it up
 * to the midpoint, so the ranges either side share the space.
 */
export function removeRange(osc: OscElement, index: number): boolean {
  const hosts = orderedHosts(osc)
  const host = hosts[index]
  if (!host) return false
  const set = child(osc, 'sampleRanges')
  if (!set) {
    clearFlatRange(osc)
    return true
  }
  const oldTop = topNoteOf(host.attrs)
  removeChild(set, host)
  if (index > 0) {
    const below = hosts[index - 1]
    if (index === hosts.length - 1) removeAttr(below, 'rangeTopNote')
    else setAttr(below, 'rangeTopNote', String((sortKey(below) + oldTop!) >> 1), SAMPLE_RANGE_ATTR_ORDER)
  }
  normalizeRanges(osc)
  return true
}
