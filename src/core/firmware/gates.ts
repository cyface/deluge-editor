/**
 * Which `FEATURES` entry gates each individual *value* — an enum string, a
 * patch source, a cable destination, a knob target.
 *
 * `features.ts` says when a firmware gained a capability; this says which
 * strings in a file need it. Both the selects (`src/ui/options.ts`) and the
 * randomizer (`src/core/random/patch.ts`) ask these maps, so a control the
 * editor won't offer is also a value the randomizer won't roll. An entry
 * absent from a map is ungated: official 4.1.4 already wrote it.
 *
 * The citations are in `features.ts` beside each feature; nothing new is
 * asserted here beyond which name belongs to which feature.
 */

import { PATCH_SOURCES, type PatchSource } from '../preset/enums'
import type { Feature } from './features'

/** Oscillator `type` strings that need a feature. */
export const OSC_TYPE_FEATURE: Record<string, Feature> = {
  dx7: 'dx7',
}

/** LFO `type` strings that need a feature. */
export const LFO_TYPE_FEATURE: Record<string, Feature> = {
  sah: 'lfoTypesSahRwalk',
  rwalk: 'lfoTypesSahRwalk',
  warbler: 'modFxWarble',
}

/** `modFXType` strings that need a feature. */
export const MOD_FX_FEATURE: Record<string, Feature> = {
  StereoChorus: 'modFxStereoChorus',
  grainFX: 'modFxGrain',
  TapeWarble: 'modFxWarble',
  dimension: 'modFxDimension',
}

/**
 * `lpfMode` strings that need a feature. `HPLadder` is never an LPF mode —
 * the LPF menu stops at the SVFs — so it is excluded by the select, not gated
 * here.
 */
export const LPF_MODE_FEATURE: Record<string, Feature> = {
  SVF_Band: 'svfFilterModes',
  SVF_Notch: 'svfFilterModes',
  Off: 'svfFilterModes',
}

/** HPF modes exist only where the `hpfMode` attribute does. */
export const HPF_MODES = ['SVF_Band', 'SVF_Notch', 'HPLadder', 'Off'] as const

/** Which feature a patch source needs, if any. */
export const SOURCE_FEATURE: Partial<Record<PatchSource, Feature>> = {
  lfo3: 'lfo3',
  lfo4: 'lfo4',
  envelope3: 'env3',
  envelope4: 'env4',
}

/** Which feature a cable destination needs, if any. */
export const DEST_FEATURE: Record<string, Feature> = {
  lpfMorph: 'filterMorph',
  hpfMorph: 'filterMorph',
  waveFold: 'waveFold',
  lfo3Rate: 'lfo3',
  lfo4Rate: 'lfo4',
  env3Attack: 'env3', env3Decay: 'env3', env3Sustain: 'env3', env3Release: 'env3',
  env4Attack: 'env4', env4Decay: 'env4', env4Sustain: 'env4', env4Release: 'env4',
}

/**
 * Which feature an unpatched knob target needs, if any. The unpatched names
 * official 4.1.4 itself knows (`Sound::paramToString` +
 * `ModControllableAudio::paramToString`, branch `synthstrom-official`:
 * arpGate, portamento, stutterRate, bass, treble, bassFreq, trebleFreq,
 * sampleRateReduction, bitcrushAmount, modFXOffset, modFXFeedback,
 * compressorShape) are the ungated baseline; the rest arrived with the
 * FEATURES entry that introduced the param.
 */
export const UNPATCHED_KNOB_FEATURE: Record<string, Feature> = {
  compressorThreshold: 'audioCompressor',
  ratchetProbability: 'arpModes', ratchetAmount: 'arpModes', sequenceLength: 'arpModes',
  rhythm: 'arpRhythm',
  noteProbability: 'arp3', bassProbability: 'arp3', chordProbability: 'arp3', chordPolyphony: 'arp3',
  reverseProbability: 'arpReverseGlideSwap', glideProbability: 'arpReverseGlideSwap', swapProbability: 'arpReverseGlideSwap',
  spreadVelocity: 'arpSpread', spreadGate: 'arpSpread', spreadOctave: 'arpSpread',
}

/**
 * `<defaultParams>` attributes that need a feature. Same features as the
 * cable destinations, keyed by the writer's attribute spelling — the two name
 * sets differ (`src/core/preset/params.ts`).
 */
export const PARAM_ATTR_FEATURE: Record<string, Feature> = {
  lpfMorph: 'filterMorph',
  hpfMorph: 'filterMorph',
  waveFold: 'waveFold',
  lfo3Rate: 'lfo3',
  lfo4Rate: 'lfo4',
  compressorThreshold: 'audioCompressor',
  ...UNPATCHED_KNOB_FEATURE,
}

export const ALL_SOURCES: readonly PatchSource[] = PATCH_SOURCES

type Supports = (feature: string) => boolean

/**
 * Whether the selected firmware can honour `value` under `gates`. The tables
 * above are `Feature`-typed so a misspelt gate fails to compile; the check
 * itself takes any string-valued map, since `supports` treats an unknown
 * feature as unsupported rather than as an error.
 */
export const gateAllows = (gates: Record<string, string>, value: string, supports: Supports): boolean => {
  const f = gates[value]
  return f === undefined || supports(f)
}
