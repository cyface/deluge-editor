import { describe, expect, it } from 'vitest'
import { keySpans } from '../core/preset/ranges'
import { bandLabel, bands, isBlackKey, noteAtX, noteX, octaveTicks } from './keymap'

const W = 1280 // ten pixels a note, so the arithmetic reads plainly

describe('keys', () => {
  it('names the black keys of an octave', () => {
    const black = [...Array(12).keys()].filter((n) => isBlackKey(60 + n))
    expect(black).toEqual([1, 3, 6, 8, 10]) // C#, D#, F#, G#, A#
  })

  it('places note 0 at the left edge and note 127 at the last key', () => {
    expect(noteX(0, W)).toBe(0)
    expect(noteX(128, W)).toBe(W)
    expect(noteX(60, W)).toBe(600)
  })

  it('reads a note back from a point anywhere inside its key', () => {
    expect(noteAtX(600, W)).toBe(60)
    expect(noteAtX(609, W)).toBe(60)
    expect(noteAtX(610, W)).toBe(61)
  })

  it('clamps a point outside the map to the keyboard', () => {
    expect(noteAtX(-40, W)).toBe(0)
    expect(noteAtX(W + 40, W)).toBe(127)
    expect(noteAtX(10, 0)).toBe(0)
  })
})

describe('bands', () => {
  it('covers the whole keyboard with no gap between neighbours', () => {
    const drawn = bands(keySpans([{ topNote: 72 }, {}]), W)
    expect(drawn.map((b) => [b.low, b.high])).toEqual([[0, 72], [73, 127]])
    expect(drawn[0].x).toBe(0)
    expect(drawn[0].x + drawn[0].width).toBe(drawn[1].x)
    expect(drawn[1].x + drawn[1].width).toBe(W)
  })

  it('gives a one-note range a one-key band', () => {
    const drawn = bands(keySpans([{ topNote: 0 }, {}]), W)
    expect(drawn[0].width).toBe(10)
  })

  it('leaves out a range that can never sound', () => {
    // Two ranges topping out at 60: the second is shadowed, and the
    // instrument would refuse the file (`Error::FILE_CORRUPTED`).
    const drawn = bands(keySpans([{ topNote: 60 }, { topNote: 60 }, {}]), W)
    expect(drawn.map((b) => b.index)).toEqual([0, 2])
  })
})

describe('labels', () => {
  const name = 'range-low'
  const span = 'C-2–C3'

  it('says both when there is room', () => {
    expect(bandLabel(300, name, span)).toBe(`${span} · ${name}`)
  })

  it('gives up the span before the sample name', () => {
    expect(bandLabel(70, name, span)).toBe(name)
  })

  it('keeps the span when even the name will not fit', () => {
    expect(bandLabel(45, 'a-very-long-sample-name', span)).toBe(span)
  })

  it('says nothing in a sliver — 70 ranges across the map stay bands', () => {
    expect(bandLabel(1280 / 70, name, span)).toBeNull()
  })
})

describe('octave ticks', () => {
  it('labels every C when they are far apart', () => {
    expect(octaveTicks(W)).toEqual([0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120])
  })

  it('thins to whole octaves as the map narrows, always starting at C-2', () => {
    expect(octaveTicks(320)).toEqual([0, 24, 48, 72, 96, 120])
    expect(octaveTicks(160)).toEqual([0, 36, 72, 108])
    expect(octaveTicks(0)).toEqual([0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120])
  })
})
