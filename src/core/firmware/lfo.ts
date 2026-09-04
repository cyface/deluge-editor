/**
 * Which LFOs can follow the song's tempo on a given firmware, and so whose
 * rate parameter is a value the instrument never reads.
 *
 * The serializer settles the first half. Official 4.1.4 writes
 * `<lfo1 type syncLevel>` and a bare `<lfo2 type>`, and its `lfo2` reader has
 * no `syncLevel` branch, so a `syncLevel` on LFO 2 is skipped as an unknown
 * tag (`Sound::writeToFile`, `src/sound.cpp:3252-3254`, and the reader at
 * `:886-901`, branch `synthstrom-official`). Community 1.2.0 gave LFO 2 its
 * own sync (8ab5f9e4 #2005, `FEATURES.lfo2Sync`), and LFOs 3 and 4 arrived in
 * 1.3.0 syncable from the start (44d8e601 #3332, `FEATURES.lfo3`/`lfo4`): at
 * `beta` e7bae539 `Sound::writeToFile` writes `syncLevel` and `syncType` for
 * all four (`src/deluge/processing/sound/sound.cpp:4171-4197`).
 *
 * The phase-increment code settles the second half, with the same test for a
 * global and a per-voice LFO: `Sound::getGlobalLFOPhaseIncrement`
 * (`sound.cpp:2711`) and `Voice::getLocalLFOPhaseIncrement`
 * (`src/deluge/model/voice/voice.cpp:701`) return the rate param's final value
 * only when `config.syncLevel == SYNC_LEVEL_NONE`, and otherwise
 * `Sound::getSyncedLFOPhaseIncrement`, which reads the song's tempo and never
 * the parameter. So on a firmware that can sync LFO n, a non-zero `syncLevel`
 * makes its rate knob inert; on one that cannot, the attribute is dead weight
 * and the knob still counts.
 */

import { lfo } from '../preset/sound'
import type { SoundElement } from '../preset/types'
import { supports, type Feature } from './features'
import type { FirmwareVersion } from './version'

export type LfoNumber = 1 | 2 | 3 | 4

/** The feature an LFO's tempo sync needs; LFO 1 has always had it. */
const LFO_SYNC_FEATURE: Record<LfoNumber, Feature | null> = { 1: null, 2: 'lfo2Sync', 3: 'lfo3', 4: 'lfo4' }

/** Whether `version` writes and honours a `syncLevel` on `<lfoN>`. */
export function canLfoSync(version: FirmwareVersion, n: LfoNumber): boolean {
  const f = LFO_SYNC_FEATURE[n]
  return f === null || supports(version, f)
}

/** `SYNC_LEVEL_NONE`, what the `<lfoN>` readers preset before reading (`sound.cpp:892`). */
const SYNC_LEVEL_NONE = '0'

/**
 * Whether LFO n's rate parameter is ignored on `version`: the LFO can sync
 * there and the file says it does. A `syncLevel` on an LFO the firmware
 * cannot sync leaves the rate in charge.
 */
export function lfoRateIgnored(sound: SoundElement, n: LfoNumber, version: FirmwareVersion): boolean {
  return canLfoSync(version, n) && (lfo(sound, n)?.attrs.syncLevel ?? SYNC_LEVEL_NONE) !== SYNC_LEVEL_NONE
}
