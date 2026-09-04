/**
 * Where a range's band sits on the key map, and what it can say there.
 *
 * The map is the only place `rangeTopNote` is legible: the number says "72",
 * the map says "everything up to C4, then the next sample". The arithmetic
 * lives here rather than in the component (like `masonry.ts`) so it can be
 * tested in Node — and so the same layout serves the full-width editor and
 * the thumbnail in the oscillator panel.
 */

const KEY_COUNT = 128
export const LOWEST_NOTE = 0
export const HIGHEST_NOTE = KEY_COUNT - 1

/** Which semitones are black keys, C first. */
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false]
export const isBlackKey = (note: number): boolean => BLACK[((note % 12) + 12) % 12]

/** Left edge of a note's key, in px, on a map `width` px wide. */
export const noteX = (note: number, width: number): number => ((note - LOWEST_NOTE) * width) / KEY_COUNT

/** The note under a point, clamped to the keyboard. */
export function noteAtX(x: number, width: number): number {
  if (width <= 0) return LOWEST_NOTE
  const n = LOWEST_NOTE + Math.floor((x / width) * KEY_COUNT)
  return Math.max(LOWEST_NOTE, Math.min(HIGHEST_NOTE, n))
}

/** A range as drawn: the notes it sounds, and where they land. */
interface Band {
  index: number
  low: number
  high: number
  x: number
  width: number
}

/**
 * One band per range that sounds, positioned across the keyboard. A range
 * with no span — shadowed by the one below it, which the instrument would
 * refuse to load — is left out rather than drawn as a zero-width sliver.
 */
export function bands(spans: readonly ({ low: number; high: number } | undefined)[], width: number): Band[] {
  const out: Band[] = []
  spans.forEach((span, index) => {
    if (!span) return
    const x = noteX(span.low, width)
    out.push({ index, low: span.low, high: span.high, x, width: noteX(span.high + 1, width) - x })
  })
  return out
}

/** Width of one character of the map's 9.5px mono label, plus the band's padding. */
const CHAR = 5.6
const PAD = 9

/**
 * The most a band can say in the room it has: the span and the sample, the
 * sample alone, the span alone, or nothing. A 70-range instrument fills the
 * map with unlabelled bands and stays readable; the table underneath carries
 * the names.
 */
export function bandLabel(bandWidth: number, name: string, span: string): string | null {
  const fits = (s: string): boolean => s.length * CHAR + PAD <= bandWidth
  const both = `${span} · ${name}`
  if (fits(both)) return both
  if (fits(name)) return name
  if (fits(span)) return span
  return null
}

/**
 * The C notes to label under the keys, thinned by whole octaves until the
 * labels have `minGap` px between them. Always starts at note 0, so the
 * labelled Cs are the same ones whatever the width.
 */
export function octaveTicks(width: number, minGap = 34): number[] {
  const perOctave = noteX(12, width)
  const step = perOctave > 0 ? Math.max(1, Math.ceil(minGap / perOctave)) : 1
  const out: number[] = []
  for (let octave = 0; octave * 12 <= HIGHEST_NOTE; octave += step) out.push(octave * 12)
  return out
}
