/**
 * The numbers the Deluge *shows* for a parameter, and the int32 it *stores*.
 *
 * Every conversion here is the firmware's own integer arithmetic
 * (`src/deluge/gui/menu_item/value_scaling.cpp` and the menu items that call
 * it, SynthstromAudible/DelugeFirmware upstream/main 3f898e95), so a knob at
 * "25" in the editor stores the value the instrument's own menu would store
 * for 25, and a value the instrument stored reads back as the number its OLED
 * shows. Intermediate products stay below 2^53, so plain doubles are exact;
 * the one that doesn't (`menuToCable`) uses BigInt.
 */

import { INT32_MAX, INT32_MIN } from './hex'

const TWO31 = 2147483648
const TWO32 = 4294967296

// ---- standard 0..50 ------------------------------------------------------
// computeCurrentValueForStandardMenuItem / computeFinalValueForStandardMenuItem.
// Used by every patched and unpatched param except the ones below.

/** int32 → 0..50 (`kMaxMenuValue`). */
export const standardToMenu = (v: number): number => Math.floor(((v + TWO31) * 50 + TWO31) / TWO32)

/** 0..50 → int32. 50 is INT32_MAX and 0 is INT32_MIN exactly. */
export function menuToStandard(m: number): number {
  if (m >= 50) return INT32_MAX
  if (m <= 0) return INT32_MIN
  // (uint32_t)value * 85899345 - 2147483648, where 85899345 == 2^31 / kMidMenuValue.
  return m * 85899345 - TWO31
}

// ---- half precision 0..50 over 0..INT32_MAX ------------------------------
// computeCurrentValueForHalfPrecisionMenuItem: osc pulse width
// (`gui/menu_item/osc/pulse_width.h`), compressorThreshold
// (`gui/menu_item/audio_compressor/compressor_params.h`). "comp params and
// osc pulse width aren't set up for negative inputs".

export const halfToMenu = (v: number): number => Math.max(0, Math.floor((v * 100 + TWO31) / TWO32))

export function menuToHalf(m: number): number {
  if (m >= 50) return INT32_MAX
  if (m <= 0) return 0
  return Math.floor((m * 85899345) / 2)
}

// ---- pan -25..25 ----------------------------------------------------------
// computeCurrentValueForPan / computeFinalValueForPan (`kMaxMenuRelativeValue`).

export const panToMenu = (v: number): number => Math.floor((v * 50 + TWO31) / TWO32)

export function menuToPan(m: number): number {
  if (m >= 25) return INT32_MAX
  if (m <= -25) return INT32_MIN
  return m * 42949672 * 2
}

// ---- patch cable amount -5000..5000 (shown as -50.00..50.00) --------------
// PatchCableStrength::readCurrentValue / writeCurrentValue
// (`gui/menu_item/patch_cable_strength.cpp`): "the internal values are stored
// in the range -(2^30) to 2^30. rescale them to the range -5000 to 5000".

export const cableToMenu = (v: number): number => Math.floor((v * 5000 + 2 ** 29) / 2 ** 30)

export function menuToCable(m: number): number {
  // int64 magic = ((1 << (30 + 32)) / 5000); finalValue = (magic * value) >> 32.
  const magic = 922337203685477n
  return Number((magic * BigInt(m)) >> 32n)
}

/** `cableToMenu` result as the OLED prints it: hundredths, e.g. `-12.50`. */
export const formatCable = (menu: number): string =>
  `${menu < 0 ? '-' : ''}${Math.floor(Math.abs(menu) / 100)}.${String(Math.abs(menu) % 100).padStart(2, '0')}`

// ---- sidechain attack / release -----------------------------------------
// `<sidechain attack release>` hold raw envelope rates. The menu shows the
// index 0..50 of the nearest table entry (`gui/menu_item/sidechain/attack.h`,
// `release.h`: `getLookupIndexFromValue(attack >> 2, attackRateTable, 50)` /
// `release >> 3, releaseRateTable`) and writes `table[i] << 2` / `<< 3`.
// Tables: `src/deluge/util/lookuptables/lookuptables.cpp`.

export const ATTACK_RATE_TABLE = [
  262144, 221969, 187951, 159147, 134757, 114105, 96618, 81811, 69273, 58656, 49667, 42055, 35610, 30153,
  25532, 21619, 18306, 15500, 13125, 11113, 9410, 7968, 6747, 5713, 4837, 4096, 3468, 2937, 2487, 2106,
  1783, 1510, 1278, 1082, 917, 776, 657, 556, 471, 399, 338, 286, 242, 205, 174, 147, 124, 105, 89, 76, 64,
] as const

export const RELEASE_RATE_TABLE = [
  32691, 4604, 2444, 1648, 1234, 980, 809, 685, 592, 519, 460, 412, 372, 338, 309, 283, 261, 241, 224, 208,
  194, 181, 169, 159, 149, 140, 132, 124, 117, 110, 104, 98, 93, 88, 83, 78, 74, 70, 66, 62, 59, 56, 53, 50,
  47, 44, 41, 39, 36, 34, 32,
] as const

/** `getLookupIndexFromValue` (`util/functions.cpp`): the first index at the smallest distance. */
export function nearestIndex(value: number, table: readonly number[]): number {
  let best = Infinity
  let index = 0
  table.forEach((t, i) => {
    const d = Math.abs(value - t)
    if (d < best) {
      best = d
      index = i
    }
  })
  return index
}

export const sidechainAttackToMenu = (attack: number): number => nearestIndex(attack >> 2, ATTACK_RATE_TABLE)
export const menuToSidechainAttack = (m: number): number => ATTACK_RATE_TABLE[clamp(m, 0, 50)] << 2
export const sidechainReleaseToMenu = (release: number): number => nearestIndex(release >> 3, RELEASE_RATE_TABLE)
export const menuToSidechainRelease = (m: number): number => RELEASE_RATE_TABLE[clamp(m, 0, 50)] << 3

// ---- audio compressor 0..127 --------------------------------------------
// `<audioCompressor attack release thresh ratio compHPF compBlend>` hold q31
// values; the menu works in knob positions (`CompressorValue::readCurrentValue`
// = value >> 24, `writeCurrentValue` = lshiftAndSaturate<24>(min(value, 127)),
// `gui/menu_item/audio_compressor/compressor_values.h`). Blend alone reaches
// 128, written as ONE_Q31.

export const compressorToKnob = (v: number): number => (v >>> 0) >>> 24
export const knobToCompressor = (k: number): number => Math.min(127, Math.max(0, k)) << 24
export const blendToKnob = (v: number): number => (v === INT32_MAX ? 128 : compressorToKnob(v))
export const knobToBlend = (k: number): number => (k >= 128 ? INT32_MAX : knobToCompressor(k))

// ---- oscillator retrigger phase ------------------------------------------
// `<osc retrigPhase>` is a uint32 phase written through the int32 writer, so
// `-1` (0xFFFFFFFF) means off and angles from 180° appear negative. The menu
// shows degrees: `value / 11930464` (`gui/menu_item/osc/retrigger_phase.h`).

export const RETRIG_OFF = -1
export function retrigToDegrees(v: number): number {
  const u = v >>> 0
  return u === 0xffffffff ? RETRIG_OFF : Math.floor(u / 11930464)
}
export const degreesToRetrig = (deg: number): number => (deg < 0 ? -1 : (deg * 11930464) | 0)

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
