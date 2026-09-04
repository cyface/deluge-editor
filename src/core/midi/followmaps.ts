/**
 * MIDI Follow's default CC → parameter maps, per firmware era.
 *
 * The map is the firmware's *default*; a user can rewrite it in
 * `SETTINGS/MIDIFollow.XML`. The tables are named the way that file names
 * parameters (`params::paramNameForFile`, `modulation/params/param.cpp`) —
 * the same name space `src/core/preset/params.ts` already uses for cable
 * destinations and gold-knob targets, so every value is a `ParamName`.
 * `src/core/preset/follow.ts` says where each of those lives in a preset.
 */

import { atLeast, parseVersion, type FirmwareVersion } from '../firmware/version'
import type { ParamName } from '../preset/params'

/**
 * The CC → parameter map of community 1.3.0.
 *
 * Transcribed from `MidiFollow::initDefaultMappings()`
 * (`io/midi/midi_follow.cpp`, `beta` e7bae539) by resolving each
 * `params::` id through `paramNameForFileConst` — the same conversion
 * `writeDefaultMappingsToFile` makes when the firmware writes
 * `SETTINGS/MIDIFollow.XML`.
 *
 * Two notes on entries that look wrong:
 *
 * - **CC 30 is osc B's wavetable position, as in c1.1–c1.2.** The lookup-table
 *   refactor (0d79ad6f #3257) wrote `ccToSoundParam[30] = LOCAL_OSC_A_WAVE_INDEX`,
 *   so on c1.3 betas before 2026-06-11 CC 25 and CC 30 both drove osc A and
 *   osc B's wave index had no default CC. 9a74e162 (#4528) put osc B back at
 *   30; the `community` branch (bef6d9df) predates the fix and still shows the
 *   doubled entry, so it is not the reference for this table.
 * - **CC 61 addresses no sound parameter.** `GLOBAL_VOLUME_POST_REVERB_SEND`
 *   is commented out there ("replace this with the patch cable from sidechain
 *   to volume, once midi follow supports patch cables"); it is only the kit
 *   bus's `sidechainCompressorVolume`.
 */
export const FOLLOW_SOUND_CC_C13: Readonly<Record<number, ParamName>> = {
  3: 'pitch',
  5: 'portamento',
  7: 'volumePostFX',
  10: 'pan',
  12: 'oscAPitch',
  13: 'oscBPitch',
  14: 'modulator1Pitch',
  15: 'modulator2Pitch',
  16: 'modFXRate',
  17: 'modFXFeedback',
  18: 'modFXOffset',
  19: 'waveFold',
  20: 'stutterRate',
  21: 'oscAVolume',
  23: 'oscAPhaseWidth',
  24: 'carrier1Feedback',
  25: 'oscAWavetablePosition',
  26: 'oscBVolume',
  27: 'compressorThreshold',
  28: 'oscBPhaseWidth',
  29: 'carrier2Feedback',
  30: 'oscBWavetablePosition',
  36: 'reverseProbability',
  37: 'spreadVelocity',
  39: 'spreadOctave',
  40: 'spreadGate',
  41: 'noiseVolume',
  42: 'rhythm',
  43: 'sequenceLength',
  44: 'chordPolyphony',
  45: 'ratchetAmount',
  46: 'noteProbability',
  47: 'bassProbability',
  48: 'chordProbability',
  49: 'ratchetProbability',
  50: 'arpGate',
  51: 'arpRate',
  52: 'delayFeedback',
  53: 'delayRate',
  54: 'modulator1Volume',
  55: 'modulator1Feedback',
  56: 'modulator2Volume',
  57: 'modulator2Feedback',
  58: 'lfo1Rate',
  59: 'lfo2Rate',
  60: 'compressorShape',
  62: 'bitcrushAmount',
  63: 'sampleRateReduction',
  70: 'lpfMorph',
  71: 'lpfResonance',
  72: 'env1Release',
  73: 'env1Attack',
  74: 'lpfFrequency',
  75: 'env1Decay',
  76: 'env1Sustain',
  77: 'env2Attack',
  78: 'env2Decay',
  79: 'env2Sustain',
  80: 'env2Release',
  81: 'hpfFrequency',
  82: 'hpfResonance',
  83: 'hpfMorph',
  84: 'bassFreq',
  85: 'trebleFreq',
  86: 'bass',
  87: 'treble',
  91: 'reverbAmount',
  93: 'modFXDepth',
  102: 'env3Attack',
  103: 'env3Decay',
  104: 'env3Sustain',
  105: 'env3Release',
  106: 'env4Attack',
  107: 'env4Decay',
  108: 'env4Sustain',
  109: 'env4Release',
  110: 'lfo3Rate',
  111: 'lfo4Rate',
  112: 'swapProbability',
  113: 'glideProbability',
}

/**
 * The same for a kit clip with AFFECT ENTIRE on: `ccToGlobalParam`, resolved
 * through `Kind::UNPATCHED_GLOBAL`. These are the kit bus's own parameters.
 */
export const FOLLOW_GLOBAL_CC_C13: Readonly<Record<number, ParamName>> = {
  3: 'pitchAdjust',
  7: 'volume',
  10: 'pan',
  16: 'modFXRate',
  17: 'modFXFeedback',
  18: 'modFXOffset',
  20: 'stutterRate',
  51: 'arpRate',
  52: 'delayFeedback',
  53: 'delayRate',
  60: 'compressorShape',
  61: 'sidechainCompressorVolume',
  62: 'bitcrushAmount',
  63: 'sampleRateReduction',
  70: 'lpfMorph',
  71: 'lpfResonance',
  74: 'lpfFrequency',
  81: 'hpfFrequency',
  82: 'hpfResonance',
  83: 'hpfMorph',
  84: 'bassFreq',
  85: 'trebleFreq',
  86: 'bass',
  87: 'treble',
  91: 'reverbAmount',
  93: 'modFXDepth',
}

/**
 * Community 1.1.0 – 1.2.1, where the map was a grid indexed by the shortcut
 * pad rather than a pair of lookup tables: `defaultParamToCCMapping`
 * (`io/midi/midi_follow.cpp`) read against `patchedParamShortcuts` /
 * `unpatchedNonGlobalParamShortcuts` (`modulation/params/param.h`), which is
 * the join `writeDefaultMappingsToFile` makes at those tags. Byte-identical
 * from `release_1_1_0` through `release_1_2_1`.
 *
 * It is a subset of the 1.3.0 table plus the one difference noted above: no
 * envelope 3/4, no LFO 3/4, none of the Arpeggiator 3.0 probabilities, no
 * stutter rate or compressor threshold — and CC 30 is osc B's wave index.
 */
export const FOLLOW_SOUND_CC_C11: Readonly<Record<number, ParamName>> = {
  3: 'pitch',
  5: 'portamento',
  7: 'volumePostFX',
  10: 'pan',
  12: 'oscAPitch',
  13: 'oscBPitch',
  14: 'modulator1Pitch',
  15: 'modulator2Pitch',
  16: 'modFXRate',
  17: 'modFXFeedback',
  18: 'modFXOffset',
  19: 'waveFold',
  21: 'oscAVolume',
  23: 'oscAPhaseWidth',
  24: 'carrier1Feedback',
  25: 'oscAWavetablePosition',
  26: 'oscBVolume',
  28: 'oscBPhaseWidth',
  29: 'carrier2Feedback',
  30: 'oscBWavetablePosition',
  41: 'noiseVolume',
  50: 'arpGate',
  51: 'arpRate',
  52: 'delayFeedback',
  53: 'delayRate',
  54: 'modulator1Volume',
  55: 'modulator1Feedback',
  56: 'modulator2Volume',
  57: 'modulator2Feedback',
  58: 'lfo1Rate',
  59: 'lfo2Rate',
  60: 'compressorShape',
  62: 'bitcrushAmount',
  63: 'sampleRateReduction',
  70: 'lpfMorph',
  71: 'lpfResonance',
  72: 'env1Release',
  73: 'env1Attack',
  74: 'lpfFrequency',
  75: 'env1Decay',
  76: 'env1Sustain',
  77: 'env2Attack',
  78: 'env2Decay',
  79: 'env2Sustain',
  80: 'env2Release',
  81: 'hpfFrequency',
  82: 'hpfResonance',
  83: 'hpfMorph',
  84: 'bassFreq',
  85: 'trebleFreq',
  86: 'bass',
  87: 'treble',
  91: 'reverbAmount',
  93: 'modFXDepth',
}

/** `unpatchedGlobalParamShortcuts` against the same grid: the kit bus at c1.1–c1.2. */
export const FOLLOW_GLOBAL_CC_C11: Readonly<Record<number, ParamName>> = {
  3: 'pitchAdjust',
  7: 'volume',
  10: 'pan',
  16: 'modFXRate',
  17: 'modFXFeedback',
  18: 'modFXOffset',
  52: 'delayFeedback',
  53: 'delayRate',
  60: 'compressorShape',
  61: 'sidechainCompressorVolume',
  62: 'bitcrushAmount',
  63: 'sampleRateReduction',
  70: 'lpfMorph',
  71: 'lpfResonance',
  74: 'lpfFrequency',
  81: 'hpfFrequency',
  82: 'hpfResonance',
  83: 'hpfMorph',
  84: 'bassFreq',
  85: 'trebleFreq',
  86: 'bass',
  87: 'treble',
  91: 'reverbAmount',
  93: 'modFXDepth',
}

export interface FollowMap {
  /** CC → parameter for a synth, and for a kit row (AFFECT ENTIRE off). */
  sound: Readonly<Record<number, ParamName>>
  /** CC → parameter for the kit bus (AFFECT ENTIRE on). */
  global: Readonly<Record<number, ParamName>>
}

const C11 = parseVersion('c1.1.0')
const C13 = parseVersion('c1.3.0')

/**
 * The default map the given firmware runs, or `null` where MIDI Follow does
 * not exist: every official build (no `midi_follow.cpp` on
 * `synthstrom-official` at all) and community below 1.1.0, where the file
 * first appears (`release_1_1_0`; `release_1_0_1` has neither the file nor
 * any `midiFollow` reference).
 */
export function followMap(version: FirmwareVersion): FollowMap | null {
  if (version.lineage !== 'community' || !atLeast(version, C11)) return null
  return atLeast(version, C13)
    ? { sound: FOLLOW_SOUND_CC_C13, global: FOLLOW_GLOBAL_CC_C13 }
    : { sound: FOLLOW_SOUND_CC_C11, global: FOLLOW_GLOBAL_CC_C11 }
}
