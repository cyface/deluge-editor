/**
 * Which of the four Mod FX knobs the Deluge actually reads, and what it calls
 * them.
 *
 * Mod FX is one slot with four controls and eight things it can be, and most
 * of those eight ignore two of the four. The firmware's own menu says so: each
 * item under `gui/menu_item/mod_fx/` carries an `isRelevant` that hides it for
 * the types that never read it, so on the instrument a flanger's menu has no
 * Depth and a chorus's has no Feedback. This is that table, taken from
 * SynthstromAudible/DelugeFirmware `upstream/community` bef6d9df —
 * `mod_fx/rate.h`, `depth_patched.h`, `depth_unpatched.h`, `offset.h` and
 * `feedback.h`, which are identical there and in the fork.
 *
 * The render path agrees, which is the useful check that the menu is not
 * merely tidying: `ModFXProcessor::setupModFXWFeedback` gives a flanger the
 * constant `kFlangerAmplitude` for its depth and never looks at `modFXDepth`,
 * and `setupChorus` reads `UNPATCHED_MOD_FX_OFFSET` but no feedback at all.
 *
 * `none` reads nothing. The stored values stay in the file either way and
 * round-trip untouched; this only decides what is worth showing.
 */

import type { ModFxType } from '../preset/enums'

/** The four knobs the Mod FX slot has, whatever it is currently set to. */
export type ModFxKnob = 'rate' | 'depth' | 'offset' | 'feedback'

/**
 * The `isRelevant` sets, verbatim. Rate is the odd one out: it is relevant for
 * every type that is not `none` (`mod_fx/rate.h`, `rate_unpatched.h`), so it
 * is not listed here and falls out of `modFxOffered` directly.
 */
const OFFERED: Readonly<Record<Exclude<ModFxKnob, 'rate'>, readonly ModFxType[]>> = {
  // Depth_Patched / Depth_Unpatched: CHORUS, CHORUS_STEREO, GRAIN, PHASER, WARBLE, DIMENSION.
  depth: ['chorus', 'StereoChorus', 'grainFX', 'phaser', 'TapeWarble', 'dimension'],
  // Offset: CHORUS, CHORUS_STEREO, GRAIN, WARBLE, DIMENSION.
  offset: ['chorus', 'StereoChorus', 'grainFX', 'TapeWarble', 'dimension'],
  // Feedback: FLANGER, PHASER, GRAIN, WARBLE.
  feedback: ['flanger', 'phaser', 'grainFX', 'TapeWarble'],
}

/** Whether the slot does anything at all. `ModFXProcessor::processModFX` returns early on NONE. */
export const modFxEnabled = (type: ModFxType | undefined): boolean => (type ?? 'none') !== 'none'

/** Whether the firmware offers this knob for this type — its menu's `isRelevant`. */
export function modFxOffered(type: ModFxType | undefined, knob: ModFxKnob): boolean {
  const t = type ?? 'none'
  if (t === 'none') return false
  if (knob === 'rate') return true
  return OFFERED[knob].includes(t)
}

/**
 * What the instrument calls the knob. Grain renames three of them — its
 * "depth" is a dry/wet mix and its "feedback" is a pitch spread, so the plain
 * names would be actively misleading (`modfx::getParamName`,
 * `model/global_effectable/global_effectable.cpp`; the strings are
 * `gui/l10n/g_english.cpp`).
 */
const GRAIN_NAMES: Readonly<Record<ModFxKnob, readonly [long: string, short: string]>> = {
  rate: ['Rate', 'Rate'],
  depth: ['Grain Mix', 'Mix'],
  feedback: ['Pitch Spread', 'Spread'],
  offset: ['Grain Density', 'Density'],
}
const PLAIN_NAMES: Readonly<Record<ModFxKnob, readonly [long: string, short: string]>> = {
  rate: ['Rate', 'Rate'],
  depth: ['Depth', 'Depth'],
  feedback: ['Feedback', 'Feedback'],
  offset: ['Offset', 'Offset'],
}

export function modFxKnobLabel(type: ModFxType | undefined, knob: ModFxKnob, short = true): string {
  const names = (type ?? 'none') === 'grainFX' ? GRAIN_NAMES : PLAIN_NAMES
  return names[knob][short ? 1 : 0]
}

/** The `<defaultParams>` attribute each knob turns. Kits use the same four names. */
export const MOD_FX_KNOB_ATTR: Readonly<Record<ModFxKnob, string>> = {
  rate: 'modFXRate',
  depth: 'modFXDepth',
  offset: 'modFXOffset',
  feedback: 'modFXFeedback',
}

/** The knob an attribute belongs to, for callers that start from the CC map. */
export const MOD_FX_ATTR_KNOB: Readonly<Record<string, ModFxKnob>> = {
  modFXRate: 'rate',
  modFXDepth: 'depth',
  modFXOffset: 'offset',
  modFXFeedback: 'feedback',
}
