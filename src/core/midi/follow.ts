/**
 * MIDI Follow: the firmware's CC ↔ parameter map, and the arithmetic that
 * turns a CC value the Deluge sent into the int32 a parameter stores.
 *
 * Community firmware's MIDI Follow Mode routes CCs on a designated channel to
 * the *active context's* sound, and with feedback enabled sends CCs back out
 * whenever a value there changes (`src/deluge/io/midi/midi_follow.cpp`,
 * SynthstromAudible/DelugeFirmware `upstream/community` bef6d9df). The editor
 * only listens: a CC arriving here is the instrument reporting a knob move.
 *
 * Two facts make that readable without guessing:
 *
 * - The value on the wire is a **knob position**, not the parameter's int32:
 *   `sendCCForMidiFollowFeedback` sends `knobPos + kKnobPosOffset` where
 *   `kKnobPosOffset` is 64 and `knobPos` came from
 *   `ParamCollection::paramValueToKnobPos` (`modulation/params/param_collection.cpp`).
 *   Reversing it is `knobPosToParamValue` from the same file — which is
 *   exactly what the Deluge itself does with a follow CC it receives
 *   (`MidiFollow::handleReceivedCC`).
 * - The map from CC number to parameter is the firmware's *default*; a user
 *   can rewrite it in `SETTINGS/MIDIFollow.XML`. The tables below are the
 *   defaults, per firmware era, named the way that file names parameters
 *   (`params::paramNameForFile`, `modulation/params/param.cpp`) — the same
 *   name space `src/core/preset/params.ts` already uses for cable
 *   destinations and gold-knob targets.
 */

import { INT32_MAX } from '../params/hex'
import type { FirmwareVersion } from '../firmware/version'
import { atLeast, parseVersion } from '../firmware/version'

/** `kKnobPosOffset`, `src/definitions_cxx.hpp:364`. */
export const KNOB_POS_OFFSET = 64

/**
 * The CC → parameter map of community 1.3.0.
 *
 * Transcribed from `MidiFollow::initDefaultMappings()`
 * (`io/midi/midi_follow.cpp`, upstream/community bef6d9df) by resolving each
 * `params::` id through `paramNameForFileConst` — the same conversion
 * `writeDefaultMappingsToFile` makes when the firmware writes
 * `SETTINGS/MIDIFollow.XML`.
 *
 * Two entries look wrong and are transcribed as they are:
 *
 * - **CC 30 is osc A's wavetable position, not osc B's.** The lookup-table
 *   refactor (0d79ad6f #3257) wrote `ccToSoundParam[30] = LOCAL_OSC_A_WAVE_INDEX`,
 *   so CC 25 and CC 30 both drive osc A and osc B's wave index has no default
 *   CC at all. In c1.1–c1.2 the grid had osc B at CC 30 (see `FOLLOW_SOUND_CC_C11`).
 * - **CC 61 addresses no sound parameter.** `GLOBAL_VOLUME_POST_REVERB_SEND`
 *   is commented out there ("replace this with the patch cable from sidechain
 *   to volume, once midi follow supports patch cables"); it is only the kit
 *   bus's `sidechainCompressorVolume`.
 */
export const FOLLOW_SOUND_CC_C13: Readonly<Record<number, string>> = {
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
  30: 'oscAWavetablePosition',
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
export const FOLLOW_GLOBAL_CC_C13: Readonly<Record<number, string>> = {
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
export const FOLLOW_SOUND_CC_C11: Readonly<Record<number, string>> = {
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
export const FOLLOW_GLOBAL_CC_C11: Readonly<Record<number, string>> = {
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
  sound: Readonly<Record<number, string>>
  /** CC → parameter for the kit bus (AFFECT ENTIRE on). */
  global: Readonly<Record<number, string>>
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

/**
 * The knob position a CC carries, read exactly as the instrument reads one.
 *
 * `MidiEngine::sendCC` clamps its value to 127 while the offset makes a full
 * knob 128, so CC 127 is ambiguous on the wire — and the firmware resolves it
 * upwards: `MidiTakeover::calculateKnobPos` starts at `midiKnobPos = 64` and
 * only assigns `ccValue - 64` when `ccValue < kMaxMIDIValue`
 * (`io/midi/midi_takeover.cpp`). So 127 is the top, `INT32_MAX`, both here and
 * on the instrument, and a value sent out comes back as the same CC.
 */
export const ccToKnobPos = (cc: number): number =>
  cc >= 127 ? KNOB_POS_OFFSET : cc - KNOB_POS_OFFSET

/**
 * `ParamCollection::knobPosToParamValue`
 * (`modulation/params/param_collection.cpp`), and its half-precision override
 * for the three parameters whose menu runs over the positive half only —
 * `LOCAL_OSC_A_PHASE_WIDTH`, `LOCAL_OSC_B_PHASE_WIDTH`
 * (`PatchedParamSet::knobPosToParamValue`) and `UNPATCHED_COMPRESSOR_THRESHOLD`
 * (`UnpatchedParamSet::knobPosToParamValue`, `modulation/params/param_set.cpp`).
 * That is the same set `paramScale()` calls `half`, which is why the caller
 * passes a flag rather than a parameter id.
 */
export function knobPosToParamValue(knobPos: number, half = false): number {
  if (knobPos >= KNOB_POS_OFFSET) return INT32_MAX
  return half ? (knobPos + KNOB_POS_OFFSET) << 24 : knobPos << 25
}

/** The int32 the Deluge stores when it applies this feedback CC to itself. */
export const ccToParamValue = (cc: number, half = false): number =>
  knobPosToParamValue(ccToKnobPos(cc), half)

/**
 * `ParamCollection::paramValueToKnobPos` (`modulation/params/param_collection.cpp`)
 * and the half-precision override from `param_set.cpp` — the conversion the
 * instrument makes when it reports a value, so this is what the editor sends
 * to say "this parameter is now here".
 */
export function paramValueToKnobPos(value: number, half = false): number {
  if (half) return (value >> 24) - KNOB_POS_OFFSET
  // (int32_t)(0x80000000 - (1 << 24)) is 0x7F000000: anything above it is the top.
  if (value >= 0x7f000000) return KNOB_POS_OFFSET
  return (value + (1 << 24)) >> 25
}

/** The CC value the instrument would send for this stored value; `sendCC` clamps at 127. */
export const paramValueToCc = (value: number, half = false): number =>
  Math.max(0, Math.min(127, paramValueToKnobPos(value, half) + KNOB_POS_OFFSET))

/** A parsed MIDI control-change message; `null` for anything else. */
export interface ControlChange {
  /** 1–16, as the instrument's menus number channels. */
  channel: number
  cc: number
  value: number
}

/**
 * Decode one MIDI message. Only channel-voice control change (0xB0) counts;
 * running status does not occur in a Web MIDI event, whose `data` is always
 * one complete message.
 */
export function parseControlChange(data: Uint8Array): ControlChange | null {
  if (data.length < 3 || (data[0] & 0xf0) !== 0xb0) return null
  return { channel: (data[0] & 0x0f) + 1, cc: data[1], value: data[2] }
}

/** A control-change message on the wire. `channel` is 1–16, as the menus number them. */
export const controlChange = (channel: number, cc: number, value: number): Uint8Array =>
  new Uint8Array([0xb0 + (Math.max(1, Math.min(16, channel)) - 1), cc & 0x7f, value & 0x7f])
