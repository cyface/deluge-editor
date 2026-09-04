import { describe, expect, it } from 'vitest'
import { fixtureSound } from '../../../tests/helpers/fixtures'
import { baseName, loopPointText, loopText, tuningText, zoneOf, zoneText } from './rangeformat'
import { sampleRanges } from './rangemodel'
import { osc } from './sound'

/** `Sample Ranges.XML`: range-low with a loop, range-high a semitone-transposed one. */
const ranges = () => sampleRanges(osc(fixtureSound('Sample Ranges'), 1)!)

describe('baseName', () => {
  it('is the last path segment, or nothing', () => {
    expect(baseName('SAMPLES/Fixtures/kick.wav')).toBe('kick.wav')
    expect(baseName('kick.wav')).toBe('kick.wav')
    expect(baseName('')).toBe('')
    expect(baseName(undefined)).toBe('')
  })
})

describe('tuningText', () => {
  it('is a dash for an untuned range and signed semitones and cents otherwise', () => {
    expect(tuningText({ transpose: 0, cents: 0 })).toBe('—')
    expect(tuningText({ transpose: 3, cents: 0 })).toBe('+3 st')
    expect(tuningText({ transpose: -12, cents: -8 })).toBe('-12 st -8 ¢')
    expect(tuningText({ transpose: 0, cents: 15 })).toBe('+15 ¢')
  })
  it('reads the fixture: range-high is a twelfth down', () => {
    const [low, high] = ranges()
    expect(tuningText(low)).toBe('—')
    expect(tuningText(high)).toBe('-12 st')
  })
})

describe('zoneOf', () => {
  it('is four numbers, zero for anything absent', () => {
    expect(zoneOf(undefined)).toEqual({ startSamplePos: 0, endSamplePos: 0, startLoopPos: 0, endLoopPos: 0 })
    expect(zoneOf(ranges()[0])).toEqual({ startSamplePos: 0, endSamplePos: 146506, startLoopPos: 19101, endLoopPos: 19603 })
  })
})

describe('zoneText', () => {
  it('prints the fixture zones with their loops', () => {
    const [low, high] = ranges()
    expect(zoneText(low)).toBe('0–146506 · loop 19101–19603')
    expect(zoneText(high)).toBe('0–137227 · loop 8089–8256')
  })
  it('is a dash with no zone, "end" for an open end, and names an unset loop marker', () => {
    expect(zoneText({ zone: undefined })).toBe('—')
    const [low] = ranges()
    const z = low.zone!
    expect(zoneText({ zone: { ...z, attrs: { startSamplePos: '100' } } })).toBe('100–end')
    expect(zoneText({ zone: { ...z, attrs: { startSamplePos: '0', endSamplePos: '48000', startLoopPos: '100' } } })).toBe(
      '0–48000 · loop 100–zone end',
    )
    expect(zoneText({ zone: { ...z, attrs: { endSamplePos: '48000', endLoopPos: '200' } } })).toBe('0–48000 · loop zone start–200')
  })
})

describe('loopText and loopPointText', () => {
  it('say where an unset marker actually falls', () => {
    expect(loopText(0, 0)).toBe('loop zone start–zone end')
    expect(loopText(19101, 19603)).toBe('loop 19101–19603')
    expect(loopPointText(0)).toBe('off')
    expect(loopPointText(19101)).toBe('19101')
  })
})
