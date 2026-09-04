/**
 * Writing a sample oscillator's ranges. The read model is `rangemodel.ts`;
 * every write here leaves the oscillator in a state the instrument will load
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
 * Two kinds of oscillator are refused outright (`rangesLocked`): ranges keyed
 * by velocity, which have no top note to order by, and ranges carrying a
 * `rangeTopNote`, `transpose` or `cents` that is not a number — the read
 * model shows those as unbounded or zero so the file still displays, but a
 * repair built on that misreading would rewrite the file around a value it
 * never understood. Every writer returns false or `undefined` for both, and
 * the ranges pass through untouched.
 *
 * Wavetable ranges are read-only for now; they carry the same invariants but
 * a different shape (`fileName` only, no zone) and no editor asks yet.
 */

import { clamp } from '../params/scale'
import { child, childrenOf, element } from '../xml/element'
import { ensureChild, insertChild, removeAttr, removeChild, reorderChildren, setAttr } from '../xml/edit'
import { OSC_CHILD_ORDER, SAMPLE_OSC_ATTR_ORDER, SAMPLE_RANGE_ATTR_ORDER, ZONE_ATTR_ORDER } from './order'
import {
  rangesLocked,
  readInt,
  sampleRangeHosts,
  topNoteOf,
  UNBOUNDED_TOP_NOTE,
  type RangeHost,
} from './rangemodel'
import { rootCents, rootToTransposeCents } from './tuning'
import type { OscElement, SampleRangeElement, SampleRangesElement } from './types'

/**
 * The highest note a *bounded* range can store: `MultiRange::topNote` is an
 * `int16_t` (`storage/multi_range/multi_range.h`) whose top value is the
 * unbounded sentinel. Nothing reachable from an editor comes near it — the
 * instrument keeps a bounded top note in 1..126 (`gui/menu_item/multi_range.cpp:68-151`) —
 * it is only where a repair of a malformed file clamps.
 */
const MAX_STORED_TOP_NOTE = UNBOUNDED_TOP_NOTE - 1

/** The top of the keyboard. A bounded top note above 126 leaves the range above it silent. */
const HIGHEST_NOTE = 127

/** `SampleHolderForVoice::transpose` is an `int16_t`, `cents` an `int8_t`. */
const clampTranspose = (n: number): number => clamp(Math.round(n), -32768, 32767)
const clampCents = (n: number): number => clamp(Math.round(n), -128, 127)

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
  // Without a `<sampleRanges>` the oscillator holds at most one range, flattened onto itself.
  const [flat] = sampleRangeHosts(osc)
  if (flat) {
    const host = element('sampleRange') as SampleRangeElement
    // In the serializer's order, so `rangeTopNote` (which comes first) still lands ahead of them.
    for (const key of ['fileName', 'transpose', 'cents'] as const) {
      if (flat.attrs[key] !== undefined) host.attrs[key] = flat.attrs[key]
    }
    for (const zone of childrenOf(flat, 'zone')) insertChild(host, zone)
    clearFlatRange(osc)
    insertChild(set, host)
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
 * preset comes through untouched; a locked one (see the module note) is left
 * exactly as it was.
 */
export function normalizeRanges(osc: OscElement): void {
  const set = child(osc, 'sampleRanges')
  if (!set || rangesLocked(osc)) return
  const sorted = childrenOf(set, 'sampleRange').sort((a, b) => sortKey(a) - sortKey(b))
  reorderChildren(set, sorted)

  let floor = -1
  sorted.forEach((host, i) => {
    if (i === sorted.length - 1) {
      removeAttr(host, 'rangeTopNote')
      return
    }
    // Keep the range at least a note wide and on the keyboard — the bounds
    // the instrument's own editor enforces (gui/menu_item/multi_range.cpp:68-151) — so a
    // repaired range is one that can actually sound.
    const ceiling = Math.min(MAX_STORED_TOP_NOTE, Math.max(floor + 1, HIGHEST_NOTE - 1))
    const top = clamp(sortKey(host), floor + 1, ceiling)
    setAttr(host, 'rangeTopNote', String(top), SAMPLE_RANGE_ATTR_ORDER)
    floor = top
  })

  if (sorted.length <= 1) toSingleSample(osc)
}

/**
 * The range hosts a write may touch, in sounding order, normalising the
 * oscillator first so neighbours are the real ones. A locked oscillator
 * comes back empty, so every write over it fails cleanly.
 */
function orderedHosts(osc: OscElement): RangeHost[] {
  if (rangesLocked(osc)) return []
  normalizeRanges(osc)
  return sampleRangeHosts(osc)
}

/**
 * Move the split point below the range above `index`.
 *
 * Clamped to the bounds the instrument's own encoder enforces
 * (`MultiRange::selectEncoderAction`, gui/menu_item/multi_range.cpp:68-151): above the
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
  const top = clamp(Math.round(note), minimum, maximum)
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
  const roots = hosts.map((h) => rootCents(readInt(h.attrs.transpose, 0), readInt(h.attrs.cents, 0)) / 100)
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
      setAttr(host, 'rangeTopNote', String(clamp(top + by, 1, 126)), attrOrder(host, osc))
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
 * shift held, gui/menu_item/multi_range.cpp:165-226): the range being split runs from the
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
  if (where === 'above') {
    setAttr(created, 'rangeTopNote', String(top), SAMPLE_RANGE_ATTR_ORDER)
    setAttr(split, 'rangeTopNote', String(midPoint), SAMPLE_RANGE_ATTR_ORDER)
  } else {
    setAttr(created, 'rangeTopNote', String(midPoint), SAMPLE_RANGE_ATTR_ORDER)
  }
  // Appended; the two top notes differ, so `normalizeRanges` puts it in its place.
  insertChild(set, created)
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
 * locked (see the module note) and so are not ours to rewrite.
 */
export function replaceRanges(osc: OscElement, specs: readonly (NewRange & { topNote?: number })[]): boolean {
  if (osc.attrs.type !== 'sample' || rangesLocked(osc)) return false
  const existing = child(osc, 'sampleRanges')
  if (existing) removeChild(osc, existing)
  clearFlatRange(osc)
  if (specs.length === 0) return true

  const set = element('sampleRanges') as SampleRangesElement
  for (const spec of specs) {
    const host = newRangeElement(spec, osc)
    if (spec.topNote !== undefined) setAttr(host, 'rangeTopNote', String(spec.topNote), SAMPLE_RANGE_ATTR_ORDER)
    insertChild(set, host)
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
  if (osc.attrs.type !== 'sample' || rangesLocked(osc)) return false
  const hosts = orderedHosts(osc)
  if (hosts.length > 0) return insertRange(osc, hosts.length - 1, 'above', spec)
  setAttr(osc, 'fileName', spec.fileName, SAMPLE_OSC_ATTR_ORDER)
  writeTuning(osc, osc, spec.transpose ?? 0, spec.cents ?? 0)
  writeZone(osc, spec.zone)
  return true
}

/**
 * Delete a range; the one below it takes over the space, as on the
 * instrument (`MultiRange::deletePress`, gui/menu_item/multi_range.cpp:282-329). Deleting
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
