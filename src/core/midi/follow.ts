/**
 * MIDI Follow: the arithmetic that turns a CC value the Deluge sent into the
 * int32 a parameter stores, and back. The CC ↔ parameter maps are
 * `followmaps.ts`, re-exported here.
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
 *   can rewrite it in `SETTINGS/MIDIFollow.XML` (`followmaps.ts`).
 */

import { INT32_MAX } from '../params/hex'
import { clamp } from '../params/scale'

export {
  FOLLOW_GLOBAL_CC_C11,
  FOLLOW_GLOBAL_CC_C13,
  FOLLOW_SOUND_CC_C11,
  FOLLOW_SOUND_CC_C13,
  followMap,
  type FollowMap,
} from './followmaps'

/** `kKnobPosOffset`, `src/definitions_cxx.hpp:364`. */
const KNOB_POS_OFFSET = 64

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
function paramValueToKnobPos(value: number, half = false): number {
  if (half) return (value >> 24) - KNOB_POS_OFFSET
  // (int32_t)(0x80000000 - (1 << 24)) is 0x7F000000: anything above it is the top.
  if (value >= 0x7f000000) return KNOB_POS_OFFSET
  return (value + (1 << 24)) >> 25
}

/** The CC value the instrument would send for this stored value; `sendCC` clamps at 127. */
export const paramValueToCc = (value: number, half = false): number =>
  clamp(paramValueToKnobPos(value, half) + KNOB_POS_OFFSET, 0, 127)

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
  new Uint8Array([0xb0 + (clamp(channel, 1, 16) - 1), cc & 0x7f, value & 0x7f])
