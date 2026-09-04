/**
 * How the range editor prints a range: the file's base name, its tuning, and
 * its zone with the loop points. Display only; the writers are `rangeedit.ts`.
 */

import type { RangeZone } from './rangeedit'
import type { SampleRange } from './rangemodel'
import type { ZoneElement } from './types'

/** The last path segment: `SAMPLES/Fixtures/kick.wav` → `kick.wav`; empty for nothing. */
export const baseName = (path: string | undefined): string => (path ?? '').split('/').pop() ?? ''

/** `+3 st`, `-12 st -8 ¢`, `+15 ¢`, or a dash when the range is untuned. */
export const tuningText = (r: Pick<SampleRange, 'transpose' | 'cents'>): string =>
  r.transpose === 0 && r.cents === 0
    ? '—'
    : [r.transpose ? `${r.transpose > 0 ? '+' : ''}${r.transpose} st` : '', r.cents ? `${r.cents > 0 ? '+' : ''}${r.cents} ¢` : '']
        .filter(Boolean)
        .join(' ')

const num = (v: string | undefined): number => Number(v ?? 0) || 0

/** A range's zone as four numbers, zero for anything absent — the shape every zone write sends whole. */
export const zoneOf = (r: { zone?: ZoneElement } | undefined): Required<RangeZone> => ({
  startSamplePos: num(r?.zone?.attrs.startSamplePos),
  endSamplePos: num(r?.zone?.attrs.endSamplePos),
  startLoopPos: num(r?.zone?.attrs.startLoopPos),
  endLoopPos: num(r?.zone?.attrs.endLoopPos),
})

/**
 * A zero loop point is not a position — it means the marker isn't set. The
 * voice falls back to the zone's own start and end when it loops
 * (`loopStart = holder->loopStartPos ? … : holder->startPos`, and the same
 * for the end, `src/deluge/model/voice/voice.cpp:2138-2139`, `beta` e7bae539),
 * and the serializer omits the attribute rather than writing 0
 * (`Sound::writeSourceToFile`, `processing/sound/sound.cpp:3648-3655`). So say
 * so, instead of printing a marker at 0.
 */
export const loopText = (start: number, end: number): string => `loop ${start || 'zone start'}–${end || 'zone end'}`

/** `0–146506 · loop 19101–19603`, `0–end`, or a dash when the range has no zone. */
export const zoneText = (r: Pick<SampleRange, 'zone'>): string => {
  const z = zoneOf(r)
  if (!r.zone) return '—'
  const play = `${z.startSamplePos}–${z.endSamplePos || 'end'}`
  return z.startLoopPos || z.endLoopPos ? `${play} · ${loopText(z.startLoopPos, z.endLoopPos)}` : play
}

/** A loop field's value: zero is the marker being off, not a position of zero. */
export const loopPointText = (n: number): string => (n === 0 ? 'off' : String(n))
