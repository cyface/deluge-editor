import { describe, expect, it } from 'vitest'
import { buildMultisample, importZone, inferLoopMode, midpointTopNotes, LOOP_MODE } from './multisample'
import { sampleRanges, isMultiSample } from './ranges'
import { element } from '../xml/element'
import { serialize } from '../xml/generate'
import type { OscElement } from './types'

const osc = (): OscElement => element('osc1', { type: 'sample' }) as OscElement
const at = (note: number) => note * 100
/** Either side of the two seconds the length rule turns on (`inferLoopMode`: an average under 2002 ms plays once). */
const SHORT_MS = 900
const LONG_MS = 4000

describe('midpointTopNotes', () => {
  it('splits each pair of roots down the middle and leaves the top unbounded', () => {
    expect(midpointTopNotes([at(60), at(64), at(72)])).toEqual([62, 68, undefined])
  })

  it('rounds the midpoint down, as the device does', () => {
    expect(midpointTopNotes([at(60), at(63)])).toEqual([61, undefined])
  })

  it('carries a root’s cents into where the boundary lands', () => {
    expect(midpointTopNotes([at(60) + 50, at(63)])).toEqual([61, undefined])
  })

  it('gives no band to a root that cannot clear the boundary below it', () => {
    // Three samples within a semitone of each other: only the first gets a band.
    expect(midpointTopNotes([at(60), at(60) + 20, at(60) + 40, at(72)])).toEqual([60, undefined, 66, undefined])
  })

  it('leaves a lone sample unbounded', () => {
    expect(midpointTopNotes([at(60)])).toEqual([undefined])
  })
})

describe('importZone', () => {
  it('is the whole file when the WAV declares no loop', () => {
    expect(importZone({ frames: 44100 })).toEqual({ startSamplePos: 0, endSamplePos: 44100 })
  })

  it('keeps a loop that has a longer tail after it than the loop itself', () => {
    expect(importZone({ frames: 1000, loopStart: 100, loopEnd: 300 })).toEqual({
      startSamplePos: 0,
      endSamplePos: 1000,
      startLoopPos: 100,
      endLoopPos: 300,
    })
  })

  it('cuts the zone at a loop end the tail is too short to justify, and marks no loop', () => {
    const zone = importZone({ frames: 1000, loopStart: 100, loopEnd: 900 })
    expect(zone.endSamplePos).toBe(900)
    expect(zone.endLoopPos).toBeUndefined()
    expect(zone.startLoopPos).toBe(100)
  })

  it('ignores a loop end past the end of the file', () => {
    expect(importZone({ frames: 1000, loopStart: 10, loopEnd: 5000 })).toEqual({
      startSamplePos: 0,
      endSamplePos: 1000,
    })
  })

  it('leaves a zero loop start off — zero already means no loop start', () => {
    expect(importZone({ frames: 1000, loopStart: 0, loopEnd: 300 }).startLoopPos).toBeUndefined()
  })
})

describe('inferLoopMode', () => {
  const sample = (n: number, extra: object = {}) => ({ fileName: `${n}.wav`, root: at(60 + n), ...extra })

  it('loops when most files carry loop points and the loops survive but the set is long', () => {
    const samples = [0, 1, 2].map((n) => sample(n, { frames: 1000, loopStart: 100, loopEnd: 300, ms: LONG_MS }))
    expect(inferLoopMode(samples)).toBe(LOOP_MODE.loop)
  })

  it('plays once when those loops survive and the samples are short', () => {
    const samples = [0, 1, 2].map((n) => sample(n, { frames: 1000, loopStart: 100, loopEnd: 300, ms: SHORT_MS }))
    expect(inferLoopMode(samples)).toBe(LOOP_MODE.once)
  })

  it('loops when the loop points were folded into the zone instead of kept', () => {
    // A long loop with a short tail becomes the zone end, so no zone loop survives.
    const samples = [0, 1, 2].map((n) => sample(n, { frames: 1000, loopStart: 100, loopEnd: 900, ms: SHORT_MS }))
    expect(inferLoopMode(samples)).toBe(LOOP_MODE.loop)
  })

  it('plays a short unlooped set once and cuts a long one off', () => {
    expect(inferLoopMode([0, 1].map((n) => sample(n, { ms: SHORT_MS })))).toBe(LOOP_MODE.once)
    expect(inferLoopMode([0, 1].map((n) => sample(n, { ms: LONG_MS })))).toBe(LOOP_MODE.cut)
  })

  it('cuts an empty set, the oscillator’s own default', () => {
    expect(inferLoopMode([])).toBe(LOOP_MODE.cut)
  })
})

describe('buildMultisample', () => {
  it('writes a range per sample, in root order, with the boundaries between them', () => {
    const o = osc()
    const result = buildMultisample(o, [
      { fileName: 'C4.wav', root: at(72), frames: 100 },
      { fileName: 'C3.wav', root: at(60), frames: 200 },
    ])
    expect(result.written).toBe(2)
    expect(sampleRanges(o).map((r) => [r.fileName, r.topNote, r.zone?.attrs.endSamplePos])).toEqual([
      ['C3.wav', 66, '200'],
      ['C4.wav', undefined, '100'],
    ])
  })

  it('turns each root into the transpose and cents the firmware stores', () => {
    const o = osc()
    buildMultisample(o, [
      { fileName: 'low.wav', root: at(48) },
      { fileName: 'high.wav', root: at(67) + 25 },
    ])
    expect(sampleRanges(o).map((r) => [r.transpose, r.cents])).toEqual([
      [12, 0],
      [-7, -25],
    ])
  })

  it('sets the repeat mode as part of the build', () => {
    const o = osc()
    buildMultisample(o, [{ fileName: 'a.wav', root: at(60), ms: LONG_MS }])
    expect(o.attrs.loopMode).toBe(LOOP_MODE.cut)
  })

  it('writes one sample as the flattened form the firmware uses, with no sampleRanges', () => {
    const o = osc()
    buildMultisample(o, [{ fileName: 'only.wav', root: at(55), frames: 88 }])
    expect(isMultiSample(o)).toBe(false)
    expect(o.attrs.fileName).toBe('only.wav')
    expect(o.attrs.transpose).toBe('5')
  })

  it('names the samples it could not fit rather than dropping them silently', () => {
    const o = osc()
    // Three takes of the same note, a fifth of a semitone apart: there is no
    // band left for the middle one between the two boundaries either side.
    const result = buildMultisample(o, [
      { fileName: 'a.wav', root: at(60) },
      { fileName: 'b.wav', root: at(60) + 20 },
      { fileName: 'c.wav', root: at(60) + 40 },
      { fileName: 'd.wav', root: at(72) },
    ])
    expect(result.crowdedOut).toEqual(['b.wav'])
    expect(result.written).toBe(3)
    expect(sampleRanges(o).map((r) => r.fileName)).toEqual(['a.wav', 'c.wav', 'd.wav'])
  })

  it('replaces whatever the oscillator had, rather than adding to it', () => {
    const o = osc()
    buildMultisample(o, [
      { fileName: 'old1.wav', root: at(50) },
      { fileName: 'old2.wav', root: at(60) },
      { fileName: 'old3.wav', root: at(70) },
    ])
    buildMultisample(o, [{ fileName: 'new.wav', root: at(64) }])
    expect(sampleRanges(o).map((r) => r.fileName)).toEqual(['new.wav'])
  })

  it('refuses an oscillator that is not a sample', () => {
    const o = element('osc1', { type: 'square' }) as OscElement
    expect(buildMultisample(o, [{ fileName: 'a.wav', root: at(60) }]).written).toBe(0)
    expect(o.attrs.fileName).toBeUndefined()
  })

  it('writes the elements in the order the serializer does', () => {
    const o = osc()
    buildMultisample(o, [
      { fileName: 'a.wav', root: at(60), frames: 1000, loopStart: 100, loopEnd: 300 },
      { fileName: 'b.wav', root: at(72), frames: 500 },
    ])
    expect(serialize([o])).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<osc1',
        '\ttype="sample"',
        '\tloopMode="1">',
        '\t<sampleRanges>',
        '\t\t<sampleRange',
        '\t\t\trangeTopNote="66"',
        '\t\t\tfileName="a.wav">',
        '\t\t\t<zone',
        '\t\t\t\tstartSamplePos="0"',
        '\t\t\t\tendSamplePos="1000"',
        '\t\t\t\tstartLoopPos="100"',
        '\t\t\t\tendLoopPos="300" />',
        '\t\t</sampleRange>',
        '\t\t<sampleRange',
        '\t\t\tfileName="b.wav"',
        '\t\t\ttranspose="-12">',
        '\t\t\t<zone',
        '\t\t\t\tstartSamplePos="0"',
        '\t\t\t\tendSamplePos="500" />',
        '\t\t</sampleRange>',
        '\t</sampleRanges>',
        '</osc1>',
        '',
      ].join('\n'),
    )
  })
})
