/**
 * Evening out a kit's rows: what a row's level controls do to its sample in
 * dB, and the Volume each row needs for the rows to sound alike.
 *
 * The firmware's gain arithmetic, `beta` e7bae5393:
 *
 * - A row's `volume` attribute is `GLOBAL_VOLUME_POST_FX` — the Deluge's
 *   Volume menu (`gui/ui/menus.cpp:1424`; written as "volume",
 *   `processing/sound/sound.cpp:4051`). `oscAVolume` is `LOCAL_OSC_A_VOLUME`,
 *   the sample oscillator's level. Both are volume params.
 * - With no cables, the patcher's combination is `v · range / 2^32` with the
 *   default range 2^30 (`Patcher::cableToLinearParamWithoutRangeAdjustment`,
 *   `modulation/patch/patcher.cpp:143`; `getParamRange`,
 *   `util/functions.cpp:57`), and a volume param squares it after shifting
 *   it positive (`getFinalParameterValueVolume`, `util/functions.cpp:192`).
 *   So the gain is `((v + 2^31) / 2^31)^2`: 0 dB at the knob's middle (25),
 *   +12 dB at the top (50), silence at 0 — `40·log10` of the knob position,
 *   in effect.
 * - A row that omits `volume` plays at 40, and one that omits `oscAVolume`
 *   at the top (`Sound::initParams`, `processing/sound/sound.cpp:141-145`).
 *
 * Volume above 40 is worth under 4 dB more, so a quiet sample can rarely
 * be brought up to a loud one: matching mostly turns loud rows down.
 * Cables into the volumes (velocity, envelope) are left out — they play the
 * same on every row of a stock kit.
 */

import { TWO31 } from '../params/fixedpoint'
import { hexToInt, INT32_MAX, INT32_MIN, intToHex, type HexParam } from '../params/hex'
import { menuToStandard } from '../params/scale'
import { paramHex, params, setParamHex } from '../preset/sound'
import type { SoundElement } from '../preset/types'
import { removeAttr } from '../xml/edit'

/** `volume` when the file leaves it out: 40 on the menu. */
export const DEFAULT_ROW_VOLUME = menuToStandard(40)
/** `oscAVolume` when the file leaves it out. */
export const DEFAULT_OSC_VOLUME = INT32_MAX

/** The gain, in dB, a volume param stored as `v` applies; `-Infinity` at the bottom. */
export function volumeGainDb(v: number): number {
  const x = (v + TWO31) / TWO31
  return x > 0 ? 40 * Math.log10(x) : -Infinity
}

/** The stored value whose gain is `db` — `volumeGainDb`'s inverse, clamped to what an int32 holds. */
export function volumeForGainDb(db: number): number {
  if (db === -Infinity) return INT32_MIN
  const v = Math.round(TWO31 * 10 ** (db / 40) - TWO31)
  return Math.max(INT32_MIN, Math.min(INT32_MAX, v))
}

/** The most a `volume` can add. */
export const MAX_VOLUME_GAIN_DB = volumeGainDb(INT32_MAX)

/** A row's two level controls as stored, the firmware's defaults standing in for what the file leaves out. */
export function rowLevelControls(r: SoundElement): { volume: number; oscVolume: number } {
  const read = (hex: string | undefined, fallback: number) => (hex === undefined ? fallback : hexToInt(hex))
  return { volume: read(paramHex(r, 'volume'), DEFAULT_ROW_VOLUME), oscVolume: read(paramHex(r, 'oscAVolume'), DEFAULT_OSC_VOLUME) }
}

/** Set a row's Volume to a stored value — a match writes the exact value, not the nearest menu step. */
export function setRowVolume(r: SoundElement, volume: number): void {
  setParamHex(r, 'volume', intToHex(volume))
}

/** Put a row's `volume` back as it was stored — absent included — undoing a match. */
export function restoreRowVolume(r: SoundElement, hex: HexParam | undefined): void {
  if (hex !== undefined) setParamHex(r, 'volume', hex)
  else {
    const p = params(r)
    if (p) removeAttr(p, 'volume')
  }
}

/**
 * The gain a preview plays a row's sample at, dB: its two level controls,
 * measured from both at the top. So rows compare in preview as they will on
 * the Deluge, and the loudest a preview gets is the file as it is.
 */
export function previewGainDb(c: { volume: number; oscVolume: number }): number {
  return volumeGainDb(c.volume) + volumeGainDb(c.oscVolume) - 2 * MAX_VOLUME_GAIN_DB
}

/** One measured row: its sample's loudness at unity, and the row's current level controls. */
export interface RowLevel {
  /** `hitLoudness` of the played part of the sample, dB. */
  loudness: number
  /** The row's `volume`, as stored. */
  volume: number
  /** The row's `oscAVolume`, as stored. */
  oscVolume: number
}

/** How loud a row plays now: its sample, through both level controls. */
export const rowLevelDb = (r: RowLevel): number => r.loudness + volumeGainDb(r.volume) + volumeGainDb(r.oscVolume)

export interface LevelMatch {
  /** The level every row is set to, dB. */
  target: number
  /** Each row's new `volume`, in the order given; null for a row left alone (unmeasured or silent). */
  volumes: (number | null)[]
}

/**
 * The Volumes that put every measured row at one level. The level is the
 * highest one every row can reach with Volume at most at the top, and never
 * above the loudest row as it plays now — matching evens a kit out, it
 * doesn't make it louder. Null rows, and silent samples, are left alone.
 * Null when fewer than two rows can take part.
 */
export function matchLevels(rows: readonly (RowLevel | null)[]): LevelMatch | null {
  const live = rows.filter((r): r is RowLevel => r !== null && Number.isFinite(r.loudness) && Number.isFinite(volumeGainDb(r.oscVolume)))
  if (live.length < 2) return null
  const reach = Math.min(...live.map((r) => r.loudness + volumeGainDb(r.oscVolume) + MAX_VOLUME_GAIN_DB))
  const loudest = Math.max(...live.map(rowLevelDb))
  const target = Math.min(reach, loudest)
  const volumes = rows.map((r) =>
    r && live.includes(r) ? volumeForGainDb(target - r.loudness - volumeGainDb(r.oscVolume)) : null,
  )
  return { target, volumes }
}
