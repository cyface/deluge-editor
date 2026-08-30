import { describe, expect, it } from 'vitest'
import { hexToInt, INT32_MAX, INT32_MIN, intToHex } from './hex'
import {
  blendToKnob,
  cableToMenu,
  compressorToKnob,
  degreesToRetrig,
  formatCable,
  halfToMenu,
  knobToBlend,
  knobToCompressor,
  menuToCable,
  menuToHalf,
  menuToPan,
  menuToSidechainAttack,
  menuToSidechainRelease,
  menuToStandard,
  panToMenu,
  retrigToDegrees,
  sidechainAttackToMenu,
  sidechainReleaseToMenu,
  standardToMenu,
} from './scale'
import { SYNC_LEVELS, syncLevelName } from './sync'

describe('standard 0..50', () => {
  it('reads the values the default synth fixture stores', () => {
    // <defaultParams volume="0x50000000" lpfFrequency="0x10000000" lpfResonance="0xA2000000">
    expect(standardToMenu(hexToInt('0x50000000'))).toBe(41)
    expect(standardToMenu(hexToInt('0x10000000'))).toBe(28)
    expect(standardToMenu(hexToInt('0xA2000000'))).toBe(7)
    expect(standardToMenu(INT32_MIN)).toBe(0)
    expect(standardToMenu(INT32_MAX)).toBe(50)
    // envelope1 decay="0xE6666654" sustain="0x7FFFFFFF" release="0x851EB851"
    expect(standardToMenu(hexToInt('0xE6666654'))).toBe(20)
    expect(standardToMenu(hexToInt('0x851EB851'))).toBe(1)
  })
  it('writes what the instrument writes for a menu value', () => {
    // knob(50) is 0x7FFFFFFF, knob(0) is 0x80000000; 25 is 0xFFFFFFE9 (25 * 85899345 - 2^31 = -23), the fixture's envelope2 sustain
    expect(intToHex(menuToStandard(50))).toBe('0x7FFFFFFF')
    expect(intToHex(menuToStandard(0))).toBe('0x80000000')
    expect(intToHex(menuToStandard(25))).toBe('0xFFFFFFE9')
    expect(intToHex(menuToStandard(20))).toBe('0xE6666654')
  })
  it('round-trips every menu value', () => {
    for (let m = 0; m <= 50; m++) expect(standardToMenu(menuToStandard(m))).toBe(m)
  })
})

describe('half precision and pan', () => {
  it('pulse width 0..INT32_MAX reads 0..50', () => {
    expect(halfToMenu(0)).toBe(0)
    expect(halfToMenu(INT32_MAX)).toBe(50)
    for (let m = 0; m <= 50; m++) expect(halfToMenu(menuToHalf(m))).toBe(m)
  })
  it('pan reads -25..25 and writes back exactly', () => {
    expect(panToMenu(0)).toBe(0)
    expect(panToMenu(INT32_MAX)).toBe(25)
    expect(panToMenu(INT32_MIN)).toBe(-25)
    for (let m = -25; m <= 25; m++) expect(panToMenu(menuToPan(m))).toBe(m)
  })
})

describe('patch cable amounts', () => {
  it('reads a full cable as 50.00 and a fixture cable as its hundredths', () => {
    expect(formatCable(cableToMenu(hexToInt('0x3FFFFFE8')))).toBe('50.00')
    expect(formatCable(cableToMenu(hexToInt('0x1C28F5B8')))).toBe('22.00')
    expect(formatCable(cableToMenu(-hexToInt('0x1C28F5B8')))).toBe('-22.00')
  })
  it('round-trips the whole -5000..5000 range', () => {
    for (let m = -5000; m <= 5000; m += 37) expect(cableToMenu(menuToCable(m))).toBe(m)
    expect(cableToMenu(menuToCable(5000))).toBe(5000)
  })
})

describe('sidechain rates', () => {
  it('reads the default synth fixture (attack 327244, release 936) as its menu indices', () => {
    expect(sidechainAttackToMenu(327244)).toBe(7)
    expect(sidechainReleaseToMenu(936)).toBe(28)
    expect(menuToSidechainAttack(7)).toBe(327244)
    expect(menuToSidechainRelease(28)).toBe(936)
  })
})

describe('audio compressor knobs', () => {
  it('reads q31 values as knob positions', () => {
    expect(compressorToKnob(83886080)).toBe(5)
    expect(compressorToKnob(1073741824)).toBe(64)
    expect(blendToKnob(2147483647)).toBe(128)
    expect(knobToCompressor(5)).toBe(83886080)
    expect(knobToBlend(128)).toBe(INT32_MAX)
    expect(knobToBlend(64)).toBe(1073741824)
  })
})

describe('retrigger phase', () => {
  it('-1 is off, otherwise degrees', () => {
    expect(retrigToDegrees(-1)).toBe(-1)
    expect(retrigToDegrees(0)).toBe(0)
    expect(degreesToRetrig(-1)).toBe(-1)
    expect(retrigToDegrees(degreesToRetrig(90))).toBe(90)
    expect(retrigToDegrees(degreesToRetrig(270))).toBe(270)
    expect(degreesToRetrig(270)).toBeLessThan(0)
  })
})

describe('sync levels', () => {
  it('names the fixture values: delay 7 is 16th, sidechain 6 is 8th', () => {
    expect(syncLevelName('7')).toBe('16th')
    expect(syncLevelName('6')).toBe('8th')
    expect(syncLevelName('0')).toBe('Off')
    expect(syncLevelName('3')).toBe('1-bar')
    expect(syncLevelName('1')).toBe('4-bar')
    expect(syncLevelName('4')).toBe('2nd')
    expect(syncLevelName('9')).toBe('64th')
    expect(syncLevelName(undefined)).toBe('Off')
    expect(syncLevelName('x')).toBe('x')
  })
  it('the table agrees with the function', () => {
    for (const { value, label } of SYNC_LEVELS) expect(syncLevelName(value)).toBe(label)
  })
})
