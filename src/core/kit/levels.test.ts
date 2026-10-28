import { describe, expect, it } from 'vitest'
import { fixtureKit } from '../../../tests/helpers/fixtures'
import { hexToInt, INT32_MAX, INT32_MIN } from '../params/hex'
import { menuToStandard } from '../params/scale'
import { soundRows } from '../preset'
import { paramHex } from '../preset/sound'
import {
  DEFAULT_ROW_VOLUME,
  MAX_VOLUME_GAIN_DB,
  matchLevels,
  previewGainDb,
  restoreRowVolume,
  rowLevelControls,
  rowLevelDb,
  setRowVolume,
  volumeForGainDb,
  volumeGainDb,
} from './levels'

describe('volume gain (getFinalParameterValueVolume)', () => {
  it('is 0 dB at the middle of the knob, +12 dB at the top, silent at the bottom', () => {
    expect(volumeGainDb(menuToStandard(25))).toBeCloseTo(0, 5)
    expect(MAX_VOLUME_GAIN_DB).toBeCloseTo(12.04, 2)
    expect(volumeGainDb(INT32_MIN)).toBe(-Infinity)
  })

  it('is 40·log10 of the knob: 40 → 50 is under 4 dB', () => {
    expect(volumeGainDb(menuToStandard(50)) - volumeGainDb(DEFAULT_ROW_VOLUME)).toBeCloseTo(40 * Math.log10(50 / 40), 6)
  })

  it('inverts, within an int32 step', () => {
    for (const v of [menuToStandard(10), 0, DEFAULT_ROW_VOLUME, 0x3504f334]) expect(volumeForGainDb(volumeGainDb(v))).toBeCloseTo(v, -1)
    expect(volumeForGainDb(100)).toBe(INT32_MAX)
    expect(volumeForGainDb(-Infinity)).toBe(INT32_MIN)
  })
})

describe('matchLevels', () => {
  const row = (loudness: number, volume = DEFAULT_ROW_VOLUME, oscVolume = INT32_MAX) => ({ loudness, volume, oscVolume })

  it('turns the loud rows down to the quiet one when the quiet one is already as loud as it can play here', () => {
    const rows = [row(-10), row(-22, INT32_MAX), row(-16)]
    const m = matchLevels(rows)!
    expect(m.target).toBeCloseTo(rowLevelDb(rows[1]), 6)
    expect(m.volumes[1]).toBe(INT32_MAX)
    rows.forEach((r, i) => expect(rowLevelDb({ ...r, volume: m.volumes[i]! })).toBeCloseTo(m.target, 4))
  })

  it('brings a quiet row up as far as Volume allows, never past the loudest row as it plays now', () => {
    const rows = [row(-10), row(-12)]
    const m = matchLevels(rows)!
    expect(m.target).toBeCloseTo(rowLevelDb(rows[0]), 6) // the kick stays where it was
    expect(m.volumes[0]).toBeCloseTo(DEFAULT_ROW_VOLUME, -1)
    expect(m.volumes[1]!).toBeGreaterThan(DEFAULT_ROW_VOLUME)
  })

  it('counts the oscillator level, and leaves unmeasured and silent rows alone', () => {
    const rows = [row(-10, DEFAULT_ROW_VOLUME, 0), null, row(-Infinity), row(-10)]
    const m = matchLevels(rows)!
    expect(m.volumes[1]).toBeNull()
    expect(m.volumes[2]).toBeNull()
    // Osc at 25 plays the first row 12 dB under the last: it goes to the top, and the last sits 12 dB below the top.
    expect(m.volumes[0]).toBe(INT32_MAX)
    expect(volumeGainDb(m.volumes[3]!)).toBeCloseTo(0, 4)
  })

  it('needs two rows', () => {
    expect(matchLevels([row(-10), null])).toBeNull()
  })
})

describe('a row’s level controls', () => {
  it('reads what is stored, the firmware’s defaults where the file is silent, and a match puts back exactly', () => {
    const row = soundRows(fixtureKit('Kit Sample Rows'))[0]
    const before = paramHex(row, 'volume')
    expect(rowLevelControls(row).volume).toBe(hexToInt(before!))
    setRowVolume(row, 123456789)
    expect(rowLevelControls(row).volume).toBe(123456789)
    restoreRowVolume(row, before)
    expect(paramHex(row, 'volume')).toBe(before)
    restoreRowVolume(row, undefined)
    expect(paramHex(row, 'volume')).toBeUndefined()
    expect(rowLevelControls(row)).toEqual({ volume: DEFAULT_ROW_VOLUME, oscVolume: hexToInt(paramHex(row, 'oscAVolume')!) })
  })

  it('previews at the file’s own level with both controls at the top', () => {
    expect(previewGainDb({ volume: INT32_MAX, oscVolume: INT32_MAX })).toBeCloseTo(0, 6)
    expect(previewGainDb({ volume: DEFAULT_ROW_VOLUME, oscVolume: INT32_MAX })).toBeCloseTo(40 * Math.log10(40 / 50), 4)
  })
})
