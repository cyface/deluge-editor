/** Colour and lane for each patch source, for wires, pips and mod rings. */

import { LFO_SCOPE } from '../core/firmware/features'
import { PATCH_SOURCES, PATCH_SOURCE_NAMES, type PatchSource } from '../core/preset'

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
  if (s === 'envelope1') return 'amp'
  if (s.startsWith('envelope')) return 'free'
  const hints: Partial<Record<PatchSource, string>> = { velocity: 'per note', note: 'key track', aftertouch: 'channel', random: 'per note', compressor: 'ducking', x: 'MPE', y: 'MPE' }
  return hints[s] ?? ''
}

/** Which feature gates a patch source, if any. */
export const SOURCE_FEATURE: Partial<Record<PatchSource, string>> = {
  lfo3: 'lfo3',
  lfo4: 'lfo4',
  envelope3: 'env3',
  envelope4: 'env4',
}

export const ALL_SOURCES: readonly PatchSource[] = PATCH_SOURCES
