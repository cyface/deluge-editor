/**
 * How fast an LFO actually runs, and where its cycle starts.
 *
 * The Deluge's menu shows an LFO rate as 0–50 like every other patched
 * parameter, and never shows a frequency. This module is the firmware's own
 * path from that stored int32 to the LFO's phase increment, so a graph can put
 * a time axis under the shape without inventing the mapping:
 *
 *   phaseIncrement = getExp(121739, presetValue * 2^30 >> 32)          (unsynced)
 *   phase += phaseIncrement * numSamples                               (per audio sample)
 *
 * from, in SynthstromAudible/DelugeFirmware upstream/community bef6d9df:
 *
 * - `Sound::getGlobalLFOPhaseIncrement` (`processing/sound/sound.cpp`) and
 *   `Voice::getLocalLFOPhaseIncrement` (`model/voice/voice.cpp`): with no sync
 *   level, the phase increment *is* `paramFinalValues[the rate param]`.
 * - `Patcher::recalculateFinalValueForParamWithNoCables` and
 *   `combineCablesExp` (`modulation/patch/patcher.cpp`): the LFO rates are exp
 *   params, so with no cables the "cable combination" is the preset value
 *   scaled by `paramRanges[p]`, which is the 2^30 default
 *   (`getParamRange`, `util/functions.cpp`).
 * - `getFinalParameterValueExp` → `getExp` (`util/functions.cpp`) over
 *   `expTableSmall` (`util/lookuptables/lookuptables.cpp`), against the
 *   neutral value 121739 shared by all four LFO rates and the mod-FX rate
 *   (`getParamNeutralValue`).
 * - `LFO::render` (`modulation/lfo.h`) advances a uint32 phase by
 *   `phaseIncrement` per sample, so one cycle is 2^32 / phaseIncrement samples
 *   at `kSampleRate` = 44100 (`src/definitions_cxx.hpp`).
 *
 * The result is a shade under sixteen octaves: menu 0 is one cycle in 205
 * seconds, menu 25 is 1.25 Hz, menu 50 is 320 Hz. Nothing here is used to
 * write a file — the stored value is `scale.ts`'s business — so this is only
 * ever a label.
 *
 * A *synced* LFO takes a different path entirely
 * (`Sound::getSyncedLFOPhaseIncrement`): its increment comes from the song's
 * tempo, which a preset file does not contain, so there is no frequency to
 * compute and the caller shows the note length instead (`sync.ts`).
 */

import { INT32_MAX, INT32_MIN } from './hex'

/** `kSampleRate`, `src/definitions_cxx.hpp`. */
export const SAMPLE_RATE = 44100

/**
 * `getParamNeutralValue` for `GLOBAL_LFO_FREQ_1/2`, `LOCAL_LFO_LOCAL_FREQ_1/2`
 * and `GLOBAL_MOD_FX_RATE` (`util/functions.cpp`). The phase increment when
 * the exponential adjustment is zero, i.e. at menu 25.
 */
export const LFO_RATE_NEUTRAL = 121739

/** `getParamRange`'s default (`util/functions.cpp`), which the LFO rates take. */
const PARAM_RANGE = 1073741824

/** `expTableSmall` (`util/lookuptables/lookuptables.cpp`): one doubling, 2^15 → 2^16. */
export const EXP_TABLE_SMALL: readonly number[] = [
  32768, 32857, 32946, 33035, 33125, 33215, 33305, 33395, 33486, 33576, 33667, 33759, 33850, 33942,
  34034, 34126, 34219, 34312, 34405, 34498, 34591, 34685, 34779, 34874, 34968, 35063, 35158, 35253,
  35349, 35445, 35541, 35637, 35734, 35831, 35928, 36025, 36123, 36221, 36319, 36417, 36516, 36615,
  36715, 36814, 36914, 37014, 37114, 37215, 37316, 37417, 37518, 37620, 37722, 37824, 37927, 38030,
  38133, 38236, 38340, 38444, 38548, 38653, 38757, 38863, 38968, 39074, 39180, 39286, 39392, 39499,
  39606, 39714, 39821, 39929, 40037, 40146, 40255, 40364, 40473, 40583, 40693, 40804, 40914, 41025,
  41136, 41248, 41360, 41472, 41584, 41697, 41810, 41923, 42037, 42151, 42265, 42380, 42495, 42610,
  42726, 42841, 42958, 43074, 43191, 43308, 43425, 43543, 43661, 43780, 43898, 44017, 44137, 44256,
  44376, 44497, 44617, 44738, 44859, 44981, 45103, 45225, 45348, 45471, 45594, 45718, 45842, 45966,
  46091, 46216, 46341, 46467, 46593, 46719, 46846, 46973, 47100, 47228, 47356, 47484, 47613, 47742,
  47871, 48001, 48131, 48262, 48393, 48524, 48655, 48787, 48920, 49052, 49185, 49319, 49452, 49586,
  49721, 49856, 49991, 50126, 50262, 50399, 50535, 50672, 50810, 50947, 51085, 51224, 51363, 51502,
  51642, 51782, 51922, 52063, 52204, 52346, 52488, 52630, 52773, 52916, 53059, 53203, 53347, 53492,
  53637, 53782, 53928, 54074, 54221, 54368, 54515, 54663, 54811, 54960, 55109, 55258, 55408, 55558,
  55709, 55860, 56012, 56163, 56316, 56468, 56622, 56775, 56929, 57083, 57238, 57393, 57549, 57705,
  57861, 58018, 58176, 58333, 58491, 58650, 58809, 58968, 59128, 59289, 59449, 59611, 59772, 59934,
  60097, 60260, 60423, 60587, 60751, 60916, 61081, 61247, 61413, 61579, 61746, 61914, 62081, 62250,
  62419, 62588, 62757, 62928, 63098, 63269, 63441, 63613, 63785, 63958, 64132, 64306, 64480, 64655,
  64830, 65006, 65182, 65359, 65535,
]

/**
 * `multiply_32x32_rshift32` (`util/fixedpoint.h`): the top 32 bits of a signed
 * 64-bit product. BigInt because the product reaches 2^62, as `menuToCable`
 * does in `scale.ts`.
 */
const mulRshift32 = (a: number, b: number): number => Number((BigInt(a) * BigInt(b)) >> 32n)

/** `interpolateTable` (`util/functions.cpp`) for a uint16 table of 2^8 + 1 entries. */
function interpolateTable(input: number, numBitsInInput: number, table: readonly number[]): number {
  const which = input >>> (numBitsInInput - 8)
  const rshiftAmount = numBitsInInput - 15 - 8
  const rshifted = rshiftAmount >= 0 ? input >>> rshiftAmount : input << -rshiftAmount
  const strength2 = rshifted & 32767
  return table[which] * (32768 - strength2) + table[which + 1] * strength2
}

/** `increaseMagnitudeAndSaturate` (`util/functions.h`). */
const increaseMagnitudeAndSaturate = (n: number, magnitude: number): number =>
  magnitude > 0
    ? Math.max(INT32_MIN, Math.min(INT32_MAX, n * 2 ** magnitude))
    : Math.floor(n / 2 ** -magnitude)

/**
 * `getExp` (`util/functions.cpp`): `presetValue` doubled once per 2^26 of
 * `adjustment`, the fine part read off `expTableSmall`.
 */
export function getExp(presetValue: number, adjustment: number): number {
  const magnitudeIncrease = (adjustment >> 26) + 2
  const adjusted = mulRshift32(presetValue, interpolateTable(adjustment & 67108863, 26, EXP_TABLE_SMALL))
  return increaseMagnitudeAndSaturate(adjusted, magnitudeIncrease)
}

/**
 * The phase increment an unsynced LFO runs at, for the rate parameter's stored
 * int32. Units are 1/2^32 of a cycle per audio sample.
 */
export const lfoPhaseIncrement = (paramValue: number): number =>
  getExp(LFO_RATE_NEUTRAL, mulRshift32(paramValue, PARAM_RANGE))

/** The same, in Hz: `phaseIncrement` cycles of 2^32 per second at 44.1 kHz. */
export const lfoRateHz = (paramValue: number): number =>
  (lfoPhaseIncrement(paramValue) / 4294967296) * SAMPLE_RATE

/** `menuToStandard` without importing it, so a menu number can be asked directly. */
const menuValue = (menu: number): number =>
  menu >= 50 ? INT32_MAX : menu <= 0 ? INT32_MIN : menu * 85899345 - 2147483648

/** An unsynced LFO's frequency in Hz for a 0–50 menu rate. */
export const lfoMenuRateHz = (menu: number): number => lfoRateHz(menuValue(menu))

/**
 * A rate as a line of text: fast rates in Hz, slow ones as the seconds a cycle
 * takes, since "0.005 Hz" says less than "205 s per cycle".
 */
export function formatLfoRate(menu: number): string {
  const hz = lfoMenuRateHz(menu)
  if (hz >= 1) return `${hz < 10 ? hz.toFixed(2) : Math.round(hz)} Hz`
  const period = 1 / hz
  return `${period < 10 ? period.toFixed(2) : Math.round(period)} s per cycle`
}

/**
 * Where an LFO's phase starts when it is (re)triggered — a per-voice LFO on
 * every note, a global one on a resync. `getLFOInitialPhaseForNegativeExtreme`
 * / `getLFOInitialPhaseForZero` and `LFO::setLocalInitialPhase` /
 * `setGlobalInitialPhase` (`modulation/lfo.cpp`): a voice LFO always starts at
 * its negative extreme, a global one starts sine and triangle at zero instead.
 * Returned as a fraction of a cycle, which is what a graph wants.
 *
 * The firmware's own note: phase 0 is the negative extreme for triangle but
 * the *positive* extreme for square, and it leaves it that way.
 */
export function lfoStartPhase(type: string, scope: 'global' | 'voice'): number {
  if (scope === 'global' && (type === 'sine' || type === 'triangle')) {
    return type === 'triangle' ? 1073741824 / 4294967296 : 0
  }
  if (type === 'saw') return 0.5
  if (type === 'sine') return 3221225472 / 4294967296
  return 0
}
