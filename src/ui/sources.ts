/** Colour and lane for each patch source, for wires, pips and mod rings. */

import { LFO_SCOPE } from '../core/firmware/features'
import { PATCH_SOURCE_NAMES, type PatchSource } from '../core/preset'

// The value → feature maps live in core, where the randomizer reads them too
// (`src/core/firmware/gates.ts`).
export { ALL_SOURCES, SOURCE_FEATURE } from '../core/firmware/gates'

export const SOURCE_COLOR: Record<PatchSource, string> = {
  lfo1: 'var(--lfo1)',
  lfo2: 'var(--lfo2)',
  lfo3: 'var(--lfo1)',
  lfo4: 'var(--lfo2)',
  envelope1: 'var(--env1)',
  envelope2: 'var(--env2)',
  envelope3: 'var(--env1)',
  envelope4: 'var(--env2)',
  velocity: 'var(--vel)',
  note: 'var(--note)',
  aftertouch: 'var(--at)',
  random: 'var(--rnd)',
  compressor: 'var(--sc)',
  x: 'var(--note)',
  y: 'var(--note)',
}

export const sourceColor = (s: string | undefined): string =>
  SOURCE_COLOR[s as PatchSource] ?? 'var(--muted)'
export const sourceName = (s: string | undefined): string =>
  PATCH_SOURCE_NAMES[s as PatchSource] ?? (s ?? '?')

/** Short description shown under a modulator when it has no cables. */
export function sourceHint(s: PatchSource): string {
  if (s in LFO_SCOPE) return LFO_SCOPE[s as keyof typeof LFO_SCOPE] === 'global' ? 'global' : 'per voice'
  if (s === 'envelope1') return 'volume'
  if (s.startsWith('envelope')) return 'free'
  const hints: Partial<Record<PatchSource, string>> = { velocity: 'per note', note: 'key track', aftertouch: 'channel', random: 'per note', compressor: 'ducking', x: 'MPE', y: 'MPE' }
  return hints[s] ?? ''
}

/**
 * What feeds a modulator, for its tooltip in the flow strip. The MIDI facts
 * are the firmware's routing in `MelodicInstrument::receivedCC`,
 * `receivedPitchBend` and `receivedAftertouch`
 * (`model/instrument/melodic_instrument.cpp`, `upstream/community` bef6d9df):
 * the mod wheel (CC 1) on a plain channel becomes the Y axis, CC 74 on an MPE
 * member channel becomes per-note Y, pitch bend is X, and channel or
 * polyphonic pressure is aftertouch.
 */
export function sourceTip(s: PatchSource): string {
  const about: Record<PatchSource, string> = {
    lfo1: 'LFO 1 — one free-running oscillator shared by every voice.',
    lfo2: 'LFO 2 — per voice: restarts with each note.',
    lfo3: 'LFO 3 — one free-running oscillator shared by every voice.',
    lfo4: 'LFO 4 — per voice: restarts with each note.',
    envelope1: 'Envelope 1 — the volume envelope; every note passes through it, and it can drive other destinations too.',
    envelope2: 'Envelope 2 — a free envelope: does nothing until a cable gives it a destination.',
    envelope3: 'Envelope 3 — a free envelope: does nothing until a cable gives it a destination.',
    envelope4: 'Envelope 4 — a free envelope: does nothing until a cable gives it a destination.',
    velocity: 'Velocity — how hard the note was struck, fixed for the life of the note.',
    note: 'Note — where the note sits on the keyboard, so a destination tracks pitch.',
    aftertouch: 'Aftertouch — pressure after the note is down: channel pressure, or per note from a polyphonic or MPE controller.',
    random: 'Random — a fresh random value for each note, fixed for its life.',
    compressor: 'Sidechain — the compressor block’s envelope, pulled down on every trigger.',
    x: 'MPE X — pitch bend: per note on an MPE member channel, whole channel otherwise.',
    y: 'MPE Y — the mod wheel (CC 1) on an ordinary MIDI channel, or per-note slide (CC 74) from an MPE controller.',
  }
  return `${about[s]} Click to trace its cables.`
}
