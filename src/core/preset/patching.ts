/**
 * Which patch cables the firmware will actually honour.
 *
 * A cable the Deluge refuses is not an error on load: the file keeps it, the
 * menu may still offer it, and it simply never modulates anything. That makes
 * it exactly the kind of thing a generator must not produce, so the rule is
 * modelled here rather than guessed at.
 *
 * Source: `Sound::maySourcePatchToParam`
 * (`src/deluge/processing/sound/sound.cpp:1335`, SynthstromAudible/DelugeFirmware
 * upstream/main 3f898e95). It returns ALLOWED, EDITABLE or DISALLOWED;
 * `PatchCableSet::patchCableIsUsable` (patch_cable_set.cpp:478) drops only the
 * DISALLOWED ones from the patcher, so EDITABLE — a route that is legal but
 * currently inert, such as a cable into osc B's level while osc B is silent —
 * counts as allowed here.
 */

import { child } from '../xml/element'
import { PATCHED_GLOBAL_PARAMS } from './params'
import type { PatchSource } from './enums'
import type { SoundElement } from './types'

/**
 * The patch sources that run once per sound rather than per voice: the enum
 * entries before `kFirstLocalSource = PatchSource::ENVELOPE_0`
 * (`src/definitions_cxx.hpp:298-324`) — the two global LFOs and the sidechain.
 * Everything after it is per voice.
 */
export const GLOBAL_SOURCES: readonly PatchSource[] = ['lfo1', 'lfo3', 'compressor']

/** The per-sound patched params (`params::FIRST_GLOBAL` onwards). */
const GLOBAL_PARAMS = new Set<string>(PATCHED_GLOBAL_PARAMS)

/** Cable destinations that only exist while the sound is in FM mode. */
const FM_ONLY = new Set([
  'modulator1Volume', 'modulator2Volume', 'modulator1Pitch', 'modulator2Pitch',
  'modulator1Feedback', 'modulator2Feedback', 'carrier1Feedback', 'carrier2Feedback',
])

/** Destinations FM mode has no use for. */
const NOT_IN_FM = new Set(['oscAPhaseWidth', 'oscBPhaseWidth', 'noiseVolume'])

const LPF_DESTS = new Set(['lpfFrequency', 'lpfMorph', 'lpfResonance'])
const HPF_DESTS = new Set(['hpfFrequency', 'hpfMorph', 'hpfResonance'])

const ENVELOPES = new Set(['envelope1', 'envelope2', 'envelope3', 'envelope4'])

export interface PatchContext {
  /** A kit row: the firmware refuses `note` as a source on a drum (`isDrum()`). */
  drum?: boolean
}

/**
 * Whether the firmware would patch `source` to `destination` on this sound.
 * False means the cable would load, save and do nothing.
 */
export function cableAllowed(
  sound: SoundElement,
  source: PatchSource,
  destination: string,
  ctx: PatchContext = {},
): boolean {
  // `if (s == PatchSource::NOTE && isDrum())`.
  if (source === 'note' && ctx.drum) return false

  // "Can't patch local source to global param" — the whole per-voice half of
  // the source enum is refused by every per-sound param.
  if (!GLOBAL_SOURCES.includes(source) && GLOBAL_PARAMS.has(destination)) return false

  // "Nothing may patch to post-fx volume. This is for manual control only."
  if (destination === 'volumePostFX') return false
  // "Only the sidechain can patch to here."
  if (destination === 'volumePostReverbSend') return source === 'compressor'
  // Envelopes reach the voice's volume through the hardwired amp envelope, and
  // the sidechain is routed to the post-reverb volume instead.
  if (destination === 'volume' && (ENVELOPES.has(source) || source === 'compressor')) return false
  // "No patching X to pitch. This happens automatically."
  if (destination === 'pitch' && source === 'x') return false

  const mode = sound.attrs.mode ?? 'subtractive'
  if (mode === 'fm') {
    if (NOT_IN_FM.has(destination)) return false
  } else {
    // Outside FM the modulators and carrier feedback do not exist. (Carrier
    // feedback doubles as a macro for the fork-only `OscType::DRUM`, which no
    // released firmware serialises, so it is refused here.)
    if (FM_ONLY.has(destination)) return false
  }
  // Ring mod multiplies the two oscillators, so their levels are not in play.
  if (mode === 'ringmod' && (destination === 'oscAVolume' || destination === 'oscBVolume')) return false

  // A filter that is switched off takes no modulation. The attribute defaults
  // are the `Sound` constructor's (24dB / HPLadder), never `Off`.
  if ((sound.attrs.lpfMode ?? '24dB') === 'Off' && LPF_DESTS.has(destination)) return false
  if ((sound.attrs.hpfMode ?? 'HPLadder') === 'Off' && HPF_DESTS.has(destination)) return false

  // A tempo-synced global LFO ignores its rate param, so patching to it is refused.
  if (destination === 'lfo1Rate' && synced(sound, 'lfo1')) return false
  if (destination === 'lfo3Rate' && synced(sound, 'lfo3')) return false

  return true
}

const synced = (sound: SoundElement, tag: 'lfo1' | 'lfo3'): boolean =>
  Number(child(sound, tag)?.attrs.syncLevel ?? 0) !== 0

/**
 * The firmware's hard ceiling on cables per sound: `kMaxNumPatchCables = 32`
 * (`src/definitions_cxx.hpp:276`). `PatchCableSet::readPatchCablesFromFile`
 * (patch_cable_set.cpp:817) stops its read loop there, so cable 33 onward in a
 * file is silently discarded on load.
 */
export const MAX_PATCH_CABLES = 32
