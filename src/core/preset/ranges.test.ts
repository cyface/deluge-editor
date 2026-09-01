/**
 * The range list against Deluge-authored files: the modern `<sampleRanges>`
 * array, the pre-3.0 nested form of the same thing, and the flattened
 * single-sample form a one-sample oscillator is written in.
 */
import { describe, expect, it } from 'vitest'
import kitFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import rangesFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML?raw'
import nestedFixture from '../../../tests/fixtures/official-2.x-old-format/Nested Sample Ranges.XML?raw'
import velocityFixture from '../../../tests/fixtures/fork-c1.3.0-local-fixes-fbba6b4f/Kit Velocity Layers.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { generateXML, parseXML } from '../xml'
import { element } from '../xml/element'
import { drumRows, isKit, isSound } from './index'
import { osc } from './sound'
import {
  addRange,
  insertRange,
  isMultiSample,
  isVelocityKeyed,
  keySpans,
  normalizeRanges,
  rangeIndexAt,
  removeRange,
  replaceRanges,
  rootCents,
  rootName,
  rootParts,
  rootToTransposeCents,
  tuningForSamplePitch,
  sampleRanges,
  shiftRanges,
  soundingOrder,
  setRangeFileName,
  setRangeRoot,
  setRangeTopNote,
  setRangeTuning,
  wavetableRanges,
} from './ranges'
import type { OscElement, SoundElement } from './types'

const load = (text: string): SoundElement => {
  const p = parseXML(text)
  if (!isSound(p)) throw new Error('fixture is not a sound')
  return p
}

const osc1 = (text: string): OscElement => {
  const o = osc(load(text), 1)
  if (!o) throw new Error('fixture has no osc1')
  return o
}

describe('root note', () => {
  it('is 60 semitones minus the transpose, in hundredths', () => {
    expect(rootCents(0, 0)).toBe(6000)
    expect(rootCents(-12, 0)).toBe(7200)
    expect(rootCents(7, 8)).toBe(5292)
  })

  it('splits back the way the firmware splits it', () => {
    expect(rootToTransposeCents(6000)).toEqual({ transpose: 0, cents: 0 })
    expect(rootToTransposeCents(5292)).toEqual({ transpose: 7, cents: 8 })
    expect(rootToTransposeCents(7501)).toEqual({ transpose: -15, cents: -1 })
  })

  it('round-trips every transpose/cents pair the firmware can write', () => {
    for (let transpose = -96; transpose <= 96; transpose++) {
      for (let cents = -49; cents <= 49; cents++) {
        expect(rootToTransposeCents(rootCents(transpose, cents))).toEqual({ transpose, cents })
      }
    }
  })

  // roundf is half away from zero, so a root exactly between two semitones
  // spells as the firmware spells it: away from centre, cents pointing back.
  it('breaks a half-semitone tie the way roundf does', () => {
    expect(rootToTransposeCents(rootCents(0, 50))).toEqual({ transpose: 1, cents: -50 })
    expect(rootToTransposeCents(rootCents(0, -50))).toEqual({ transpose: -1, cents: 50 })
  })

  // `while (semitonesInt <= -6) semitonesInt += 12; while (semitonesInt > 6)
  // semitonesInt -= 12;` — sample_holder_for_voice.cpp:145-153.
  it('folds a lone sample into the nearest octave, as the browser does', () => {
    expect(tuningForSamplePitch(8400, true)).toEqual({ transpose: 0, cents: 0 }) // C5, two octaves up
    expect(tuningForSamplePitch(6500, true)).toEqual({ transpose: -5, cents: 0 }) // F3, close enough to stay
    // The fold leaves transpose in (-6, +6]: half an octave down folds up.
    expect(tuningForSamplePitch(6600, true)).toEqual({ transpose: 6, cents: 0 }) // F#3
    expect(tuningForSamplePitch(6700, true)).toEqual({ transpose: 5, cents: 0 }) // G3 stays
    expect(tuningForSamplePitch(5292, true)).toEqual({ transpose: -5, cents: 8 }) // cents ride along
  })

  // The fold is only for a source with one range; every other range keeps the
  // octave the sample was recorded in (`shouldMinimizeOctaves`, :1034).
  it('leaves the octave alone for a range among others', () => {
    expect(tuningForSamplePitch(8400)).toEqual({ transpose: -24, cents: 0 })
  })

  it('shows a whole note plainly and a detuned one with its offset', () => {
    expect(rootName(6000)).toBe('C3')
    expect(rootName(5292)).toBe('F2 -8¢')
    expect(rootName(7501)).toBe('D#4 +1¢')
    expect(rootParts(5292)).toEqual({ note: 53, cents: -8 })
  })
})

describe('sampleRanges', () => {
  it('reads the modern <sampleRanges> array, last range unbounded', () => {
    const o = osc1(rangesFixture)
    expect(isMultiSample(o)).toBe(true)
    const ranges = sampleRanges(o)
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toMatchObject({
      index: 0,
      topNote: 72,
      fileName: 'SAMPLES/Fixtures/range-low.wav',
      transpose: 0,
      cents: 0,
      rootCents: 6000,
    })
    expect(ranges[1]).toMatchObject({
      index: 1,
      topNote: undefined,
      fileName: 'SAMPLES/Fixtures/range-high.wav',
      transpose: -12,
      rootCents: 7200,
    })
    expect(ranges[0].zone?.attrs).toEqual({
      startSamplePos: '0',
      endSamplePos: '146506',
      startLoopPos: '19101',
      endLoopPos: '19603',
    })
  })

  // parseTree turns a leaf child element into an attribute, so the pre-3.0
  // nested form needs nothing of its own here.
  it('reads the pre-3.0 nested form identically', () => {
    const ranges = sampleRanges(osc1(nestedFixture))
    expect(ranges).toHaveLength(21)
    expect(ranges[0]).toMatchObject({ topNote: 53, transpose: 7, cents: 8, rootCents: 5292 })
    expect(ranges[0].fileName).toMatch(/Freeze Sitar \[2018-12-06 224345\]\.wav$/)
    expect(ranges[0].zone?.attrs).toEqual({ startSamplePos: '0', endSamplePos: '264600' })
    // An omitted transpose or cents is zero, not missing.
    expect(ranges[1]).toMatchObject({ topNote: 54, transpose: 6, cents: 0, rootCents: 5400 })
    // Adjacent ranges are allowed to share a root; two here do.
    expect([ranges[9].rootCents, ranges[10].rootCents]).toEqual([6292, 6292])
    expect(ranges[20]).toMatchObject({ topNote: undefined, transpose: -15, cents: -1, rootCents: 7501 })
  })

  it('reads a one-sample oscillator as a single unbounded range', () => {
    const kit = parseXML(kitFixture)
    if (!isKit(kit)) throw new Error('fixture is not a kit')
    const row = drumRows(kit)[0] as SoundElement
    const first = osc(row, 1)
    expect(first && isMultiSample(first)).toBe(false)
    expect(sampleRanges(first!)).toMatchObject([
      { index: 0, topNote: undefined, fileName: 'SAMPLES/Fixtures/kick.wav', transpose: 0, rootCents: 6000 },
    ])
    // The row's second oscillator is an empty slot the firmware still writes.
    expect(sampleRanges(osc(row, 2)!)).toMatchObject([{ fileName: '' }])
  })

  it('is empty for an oscillator that plays no sample', () => {
    expect(sampleRanges(osc1(synthTemplate))).toEqual([])
    expect(wavetableRanges(osc1(synthTemplate))).toEqual([])
  })
})

describe('keySpans', () => {
  it('gives the top note to its own range and the rest to the neighbours', () => {
    expect(keySpans(sampleRanges(osc1(rangesFixture)))).toEqual([
      { low: 0, high: 72 },
      { low: 73, high: 127 },
    ])
  })

  it('covers the whole keyboard across 21 ranges, with no gaps or overlaps', () => {
    const spans = keySpans(sampleRanges(osc1(nestedFixture)))
    expect(spans[0]).toEqual({ low: 0, high: 53 })
    expect(spans[1]).toEqual({ low: 54, high: 54 })
    expect(spans[19]).toEqual({ low: 75, high: 78 })
    expect(spans[20]).toEqual({ low: 79, high: 127 })
    let next = 0
    for (const span of spans) {
      expect(span).toBeDefined()
      expect(span!.low).toBe(next)
      next = span!.high + 1
    }
    expect(next).toBe(128)
  })

  it('orders by top note, not document order', () => {
    expect(keySpans([{ topNote: 80 }, { topNote: 40 }])).toEqual([
      { low: 41, high: 127 },
      { low: 0, high: 40 },
    ])
  })

  it('marks a range that can never sound', () => {
    // A duplicate top note is a file the instrument refuses to load; the
    // second one is shadowed either way.
    expect(keySpans([{ topNote: 60 }, { topNote: 60 }, {}])).toEqual([
      { low: 0, high: 60 },
      undefined,
      { low: 61, high: 127 },
    ])
  })

  it('takes a narrower keyboard when asked', () => {
    expect(keySpans([{ topNote: 60 }, {}], 36, 96)).toEqual([
      { low: 36, high: 60 },
      { low: 61, high: 96 },
    ])
  })
})

describe('rangeIndexAt', () => {
  it('finds the range a note plays, inclusive at the top', () => {
    const ranges = sampleRanges(osc1(rangesFixture))
    expect(rangeIndexAt(ranges, 0)).toBe(0)
    expect(rangeIndexAt(ranges, 72)).toBe(0)
    expect(rangeIndexAt(ranges, 73)).toBe(1)
    expect(rangeIndexAt(ranges, 127)).toBe(1)
  })

  it('has no range to give when there are none', () => {
    expect(rangeIndexAt([], 60)).toBe(-1)
  })
})

describe('soundingOrder', () => {
  it('leaves a file the instrument wrote alone', () => {
    const ranges = sampleRanges(osc1(rangesFixture))
    expect(soundingOrder(ranges).map((r) => r.fileName)).toEqual(ranges.map((r) => r.fileName))
  })

  it('sorts a file listed out of order the way the reader loads it', () => {
    const ranges = [{ topNote: undefined }, { topNote: 80 }, { topNote: 40 }]
    expect(soundingOrder(ranges as never).map((r) => r.topNote)).toEqual([40, 80, undefined])
  })
})

/** The two fixtures, loaded fresh so a test's edits can't leak into the next. */
const sound = (text: string): { sound: SoundElement; osc: OscElement } => {
  const s = load(text)
  const o = osc(s, 1)
  if (!o) throw new Error('fixture has no osc1')
  return { sound: s, osc: o }
}

const kitRow = (): { sound: SoundElement; osc: OscElement } => {
  const kit = parseXML(kitFixture)
  if (!isKit(kit)) throw new Error('fixture is not a kit')
  const row = drumRows(kit)[0] as SoundElement
  return { sound: row, osc: osc(row, 1)! }
}

const tops = (o: OscElement): (number | undefined)[] => sampleRanges(o).map((r) => r.topNote)

describe('moving a split point', () => {
  it('changes that attribute and nothing else in the file', () => {
    const { sound: s, osc: o } = sound(rangesFixture)
    expect(setRangeTopNote(o, 0, 60)).toBe(60)
    expect(generateXML(s)).toBe(rangesFixture.replace('rangeTopNote="72"', 'rangeTopNote="60"'))
  })

  it('stays between the neighbouring ranges', () => {
    const { osc: o } = sound(nestedFixture)
    // ranges 13, 14 and 15 top out at 66, 68 and 70.
    expect(setRangeTopNote(o, 14, 1000)).toBe(69)
    expect(setRangeTopNote(o, 14, 0)).toBe(67)
    expect(tops(o)[13]).toBe(66)
    expect(tops(o)[15]).toBe(70)
  })

  it('leaves the topmost range and the one below it a note each', () => {
    const { osc: o } = sound(nestedFixture)
    // The topmost range is unbounded — it has no top note to move.
    expect(setRangeTopNote(o, 20, 100)).toBeUndefined()
    expect(setRangeTopNote(o, 19, 500)).toBe(126)
    expect(setRangeTopNote(o, 0, -5)).toBe(1)
  })

  it('has nothing to move on an oscillator with one sample', () => {
    expect(setRangeTopNote(kitRow().osc, 0, 60)).toBeUndefined()
  })
})

describe('adding a sample', () => {
  it('turns a one-sample oscillator into the array form, split at the midpoint', () => {
    const { sound: s, osc: o } = kitRow()
    expect(addRange(o, { fileName: 'SAMPLES/Fixtures/snare.wav', zone: { endSamplePos: 100 } })).toBe(true)
    expect(isMultiSample(o)).toBe(true)
    expect(tops(o)).toEqual([63, undefined])
    expect(sampleRanges(o).map((r) => r.fileName)).toEqual([
      'SAMPLES/Fixtures/kick.wav',
      'SAMPLES/Fixtures/snare.wav',
    ])
    // The moved range keeps the zone it had; the new one gets the one it was given.
    expect(sampleRanges(o)[0].zone?.attrs).toEqual({ startSamplePos: '0', endSamplePos: '7824' })
    expect(sampleRanges(o)[1].zone?.attrs).toEqual({ startSamplePos: '0', endSamplePos: '100' })
    expect(generateXML(s)).toContain('<sampleRanges>')
    expect(o.attrs.fileName).toBeUndefined()
  })

  it('gives the first sample of an empty oscillator the flattened shape', () => {
    const { osc: o } = sound(rangesFixture)
    removeRange(o, 1)
    removeRange(o, 0)
    expect(sampleRanges(o)).toEqual([])
    expect(addRange(o, { fileName: 'a.wav', transpose: -12, cents: 8 })).toBe(true)
    expect(isMultiSample(o)).toBe(false)
    expect(o.attrs).toEqual({
      type: 'sample',
      loopMode: '0',
      reversed: '0',
      timeStretchEnable: '0',
      timeStretchAmount: '0',
      fileName: 'a.wav',
      transpose: '-12',
      cents: '8',
    })
  })

  it('leaves an oscillator that is not a sample oscillator alone', () => {
    const o = osc1(synthTemplate)
    expect(addRange(o, { fileName: 'a.wav' })).toBe(false)
    expect(o.attrs.fileName).toBeUndefined()
  })

  it('writes no transpose or cents at zero, as the firmware does', () => {
    const { osc: o } = kitRow()
    addRange(o, { fileName: 'b.wav' })
    expect(sampleRanges(o)[1].el.attrs).toEqual({ fileName: 'b.wav' })
  })
})

describe('inserting a range', () => {
  it('takes the upper half of the range it splits when inserted above', () => {
    const { osc: o } = sound(nestedFixture)
    // Range 0 runs from note 0 to note 53, so the two share it at 26.
    expect(insertRange(o, 0, 'above', { fileName: 'new.wav' })).toBe(true)
    expect(tops(o).slice(0, 3)).toEqual([26, 53, 54])
    expect(sampleRanges(o)[1].fileName).toBe('new.wav')
  })

  it('takes the lower half when inserted below', () => {
    const { osc: o } = sound(nestedFixture)
    expect(insertRange(o, 0, 'below', { fileName: 'new.wav' })).toBe(true)
    expect(tops(o).slice(0, 3)).toEqual([26, 53, 54])
    expect(sampleRanges(o)[0].fileName).toBe('new.wav')
  })

  it('refuses a range only one note wide', () => {
    const { osc: o } = sound(nestedFixture)
    // Range 1 tops out at 54 and range 0 at 53: it sounds note 54 alone.
    expect(insertRange(o, 1, 'above', { fileName: 'new.wav' })).toBe(false)
    expect(sampleRanges(o)).toHaveLength(21)
  })
})

describe('removing a range', () => {
  it('flattens the oscillator back when one range is left', () => {
    const { sound: s, osc: o } = sound(rangesFixture)
    expect(removeRange(o, 0)).toBe(true)
    expect(isMultiSample(o)).toBe(false)
    // The survivor's file, tuning and zone land where the firmware writes them
    // for a single sample: fileName before transpose, unlike every other type.
    expect(Object.keys(o.attrs)).toEqual([
      'type',
      'loopMode',
      'reversed',
      'timeStretchEnable',
      'timeStretchAmount',
      'fileName',
      'transpose',
    ])
    expect(o.attrs.fileName).toBe('SAMPLES/Fixtures/range-high.wav')
    expect(generateXML(s)).not.toContain('sampleRange')
  })

  it('leaves the oscillator with no sample when the last one goes', () => {
    const { sound: s, osc: o } = kitRow()
    expect(removeRange(o, 0)).toBe(true)
    expect(sampleRanges(o)).toEqual([])
    expect(generateXML(s)).not.toContain('kick.wav')
  })

  it('makes the range below the new unbounded top', () => {
    const { osc: o } = sound(nestedFixture)
    expect(removeRange(o, 20)).toBe(true)
    expect(sampleRanges(o)).toHaveLength(20)
    expect(tops(o)[19]).toBeUndefined()
  })

  it('splits the space with the range above when a middle one goes', () => {
    const { osc: o } = sound(nestedFixture)
    // Ranges 18, 19 and 20 top out at 74, 78 and the top of the keyboard.
    expect(removeRange(o, 19)).toBe(true)
    expect(tops(o)[18]).toBe(76)
    expect(tops(o)[19]).toBeUndefined()
  })

  it('needs no adjustment when the bottom one goes', () => {
    const { osc: o } = sound(nestedFixture)
    expect(removeRange(o, 0)).toBe(true)
    expect(tops(o)[0]).toBe(54)
    expect(keySpans(sampleRanges(o))[0]).toEqual({ low: 0, high: 54 })
  })
})

describe('tuning a range', () => {
  it('stores a root note as the transpose and cents the firmware would', () => {
    const { osc: o } = sound(rangesFixture)
    expect(setRangeRoot(o, 0, rootCents(-7, 8))).toBe(true)
    expect(sampleRanges(o)[0].el.attrs).toMatchObject({ transpose: '-7', cents: '8' })
    expect(sampleRanges(o)[0].rootCents).toBe(rootCents(-7, 8))
  })

  it('drops an attribute the firmware omits at zero', () => {
    const { osc: o } = sound(rangesFixture)
    expect(setRangeTuning(o, 1, 0, 0)).toBe(true)
    expect(sampleRanges(o)[1].el.attrs.transpose).toBeUndefined()
    expect(sampleRanges(o)[1].el.attrs.cents).toBeUndefined()
  })

  it('points a range at another file', () => {
    const { osc: o } = sound(rangesFixture)
    expect(setRangeFileName(o, 1, 'SAMPLES/Other.wav')).toBe(true)
    expect(sampleRanges(o)[1].fileName).toBe('SAMPLES/Other.wav')
  })
})

describe('the invariants a saved file has to meet', () => {
  /** The three the instrument's reader and writer between them require. */
  const check = (o: OscElement): void => {
    const ranges = sampleRanges(o)
    const stored = ranges.map((r) => r.el.attrs.rangeTopNote)
    expect(stored.slice(0, -1).every((t) => t !== undefined)).toBe(true)
    expect(stored[stored.length - 1]).toBeUndefined()
    expect(stored).not.toContain('32767')
    const bounded = ranges.slice(0, -1).map((r) => r.topNote!)
    expect(bounded).toEqual([...bounded].sort((a, b) => a - b))
    expect(new Set(bounded).size).toBe(bounded.length)
    // Every range sounds at least one note, so none is shadowed.
    expect(keySpans(ranges).every((s) => s !== undefined)).toBe(true)
  }

  it('hold after every kind of edit', () => {
    const { osc: o } = sound(nestedFixture)
    check(o)
    setRangeTopNote(o, 3, 200)
    check(o)
    insertRange(o, 0, 'above', { fileName: 'a.wav' })
    check(o)
    removeRange(o, 10)
    check(o)
    while (sampleRanges(o).length > 1) removeRange(o, 0)
    check(o)
    expect(isMultiSample(o)).toBe(false)
  })

  it('are restored on a file that breaks them', () => {
    const { osc: o } = sound(nestedFixture)
    const hosts = sampleRanges(o).map((r) => r.el)
    // Out of order, a duplicate top note, an explicit sentinel, and a second
    // unbounded range: each of these is a file the instrument refuses to load.
    hosts[0].attrs.rangeTopNote = '90'
    hosts[2].attrs.rangeTopNote = hosts[1].attrs.rangeTopNote
    hosts[20].attrs.rangeTopNote = '32767'
    delete hosts[3].attrs.rangeTopNote
    normalizeRanges(o)
    check(o)
    expect(sampleRanges(o)).toHaveLength(21)
  })

  it('survive a save and reload', () => {
    const { sound: s, osc: o } = sound(nestedFixture)
    setRangeTopNote(o, 5, 59)
    insertRange(o, 8, 'below', { fileName: 'inserted.wav', zone: { endSamplePos: 12 } })
    const saved = generateXML(s)
    const { sound: s2, osc: o2 } = sound(saved)
    check(o2)
    expect(tops(o2)).toEqual(tops(o))
    expect(sampleRanges(o2).map((r) => r.fileName)).toEqual(sampleRanges(o).map((r) => r.fileName))
    expect(generateXML(s2)).toBe(saved)
  })
})

describe('ranges keyed by velocity', () => {
  /**
   * A kit row from the one fixture no stock firmware could have written: a
   * fork build with Drum Velocity Layers on writes `rangeTopVelocity` where
   * the serializer normally writes `rangeTopNote` (`Sound::writeSourceToFile`,
   * sound.cpp:3618 on `local-fixes`). Files like it are on real cards, and the
   * editor's job is to hand them back unchanged.
   */
  const velocityRow = (index: number): { sound: SoundElement; osc: OscElement } => {
    const kit = parseXML(velocityFixture)
    if (!isKit(kit)) throw new Error('fixture is not a kit')
    const row = drumRows(kit)[index] as SoundElement
    return { sound: row, osc: osc(row, 1)! }
  }

  it('reads every layer, none of which has a top note', () => {
    const { osc: o } = velocityRow(0)
    const list = sampleRanges(o)
    expect(list).toHaveLength(4)
    expect(list.map((r) => r.topNote)).toEqual([undefined, undefined, undefined, undefined])
    expect(list.map((r) => r.fileName)).toEqual([
      'SAMPLES/Fixtures/vel-kick-1.wav',
      'SAMPLES/Fixtures/vel-kick-2.wav',
      'SAMPLES/Fixtures/vel-kick-3.wav',
      'SAMPLES/Fixtures/vel-kick-4.wav',
    ])
    expect(isVelocityKeyed(o)).toBe(true)
    // The row below it keys eight layers the same way.
    expect(sampleRanges(velocityRow(1).osc)).toHaveLength(8)
  })

  it('are passed through, never reordered, repaired or edited', () => {
    const { sound: s, osc: o } = velocityRow(0)
    const before = generateXML(s)
    normalizeRanges(o)
    expect(setRangeTopNote(o, 0, 60)).toBeUndefined()
    expect(setRangeFileName(o, 0, 'x.wav')).toBe(false)
    expect(setRangeTuning(o, 0, 3, 0)).toBe(false)
    expect(insertRange(o, 0, 'above', { fileName: 'x.wav' })).toBe(false)
    expect(addRange(o, { fileName: 'x.wav' })).toBe(false)
    expect(removeRange(o, 0)).toBe(false)
    expect(generateXML(s)).toBe(before)
  })

  it('leaves the whole kit byte-identical after a refused edit', () => {
    const kit = parseXML(velocityFixture)
    if (!isKit(kit)) throw new Error('fixture is not a kit')
    for (const row of drumRows(kit)) {
      const o = osc(row as SoundElement, 1)
      if (o) {
        normalizeRanges(o)
        removeRange(o, 0)
      }
    }
    expect(generateXML(kit)).toBe(velocityFixture)
  })
})

describe('shiftRanges', () => {
  const built = (osc: OscElement) =>
    sampleRanges(osc).map((r) => [r.fileName, r.rootCents / 100, r.topNote])

  const threeRanges = (): OscElement => {
    const osc = element('osc1', { type: 'sample' }) as OscElement
    replaceRanges(osc, [
      { fileName: 'a.wav', topNote: 66, ...rootToTransposeCents(6000) },
      { fileName: 'b.wav', topNote: 78, ...rootToTransposeCents(7200) },
      { fileName: 'c.wav', ...rootToTransposeCents(8400) },
    ])
    return osc
  }

  it('moves the roots and the boundaries by the same semitones', () => {
    const osc = threeRanges()
    expect(shiftRanges(osc, -12)).toBe(-12)
    expect(built(osc)).toEqual([
      ['a.wav', 48, 54],
      ['b.wav', 60, 66],
      ['c.wav', 72, undefined],
    ])
  })

  it('keeps a boundary that was moved by hand where it sits between its samples', () => {
    const osc = threeRanges()
    setRangeTopNote(osc, 0, 62) // a person dragged this split down
    shiftRanges(osc, 12)
    expect(built(osc)).toEqual([
      ['a.wav', 72, 74],
      ['b.wav', 84, 90],
      ['c.wav', 96, undefined],
    ])
  })

  it('carries the cents of a detuned range', () => {
    const osc = element('osc1', { type: 'sample' }) as OscElement
    replaceRanges(osc, [
      { fileName: 'a.wav', topNote: 66, ...rootToTransposeCents(6025) },
      { fileName: 'b.wav', ...rootToTransposeCents(7200) },
    ])
    shiftRanges(osc, 1)
    expect(sampleRanges(osc)[0].rootCents).toBe(6125)
  })

  it('stops at the end of the keyboard rather than pushing a root off it', () => {
    const osc = threeRanges()
    expect(shiftRanges(osc, 96)).toBe(127 - 84)
    expect(sampleRanges(osc).at(-1)?.rootCents).toBe(12700)
    expect(shiftRanges(osc, 96)).toBe(0)
  })

  it('is nothing to do on an oscillator with no ranges', () => {
    expect(shiftRanges(element('osc1', { type: 'sample' }) as OscElement, 12)).toBe(0)
  })
})
