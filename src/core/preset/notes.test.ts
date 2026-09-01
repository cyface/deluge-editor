import { describe, expect, it } from 'vitest'
import { noteName, noteOctave, noteWithinOctave } from './notes'

describe('note names', () => {
  // The Deluge prints octave = note/12 - 2, so its middle C is C3.
  it('names note 60 C3, the way the instrument does', () => {
    expect(noteName(60)).toBe('C3')
    expect(noteName(0)).toBe('C-2')
    expect(noteName(127)).toBe('G8')
  })

  it('spells the black keys either way', () => {
    expect(noteName(61)).toBe('C#3')
    expect(noteName(61, false)).toBe('Db3')
    expect(noteName(70)).toBe('A#3')
    expect(noteName(70, false)).toBe('Bb3')
  })

  it('walks a whole octave', () => {
    const octave = Array.from({ length: 12 }, (_, i) => noteName(60 + i))
    expect(octave).toEqual(['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3'])
  })

  it('splits a note into octave and degree', () => {
    expect(noteOctave(59)).toBe(2)
    expect(noteOctave(60)).toBe(3)
    expect(noteWithinOctave(59)).toBe(11)
    expect(noteWithinOctave(60)).toBe(0)
  })
})
