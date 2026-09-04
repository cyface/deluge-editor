/**
 * A sample oscillator's key ranges, in three parts under one name:
 *
 * - `rangemodel.ts` — the read model: both file shapes as one list, key
 *   spans, sounding order, and what makes a set of ranges off-limits.
 * - `tuning.ts` — root note ↔ `transpose`/`cents`, beside `notes.ts`.
 * - `rangeedit.ts` — the writers, holding the serializer's invariants.
 * - `rangeformat.ts` — how a range is printed: file name, tuning, zone.
 *
 * Import from here as before; the split is only so each part reads whole.
 */

export * from './rangemodel'
export * from './tuning'
export * from './rangeedit'
export * from './rangeformat'
