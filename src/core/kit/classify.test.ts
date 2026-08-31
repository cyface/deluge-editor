import { describe, expect, it } from 'vitest'
import { classifyDrum, orderSamples } from './classify'

describe('classifyDrum', () => {
  const cases: [string, string][] = [
    // long names
    ['808 Kick.wav', 'kick'],
    ['BassDrum01.wav', 'kick'],
    ['Snare Tight.wav', 'snare'],
    ['Closed Hat.wav', 'closed-hat'],
    ['ClosedHat.wav', 'closed-hat'],
    ['HiHat 1.wav', 'closed-hat'],
    ['Open Hat.wav', 'open-hat'],
    ['OpenHat.wav', 'open-hat'],
    ['Open HiHat Long.wav', 'open-hat'],
    ['Hand Clap.wav', 'clap'],
    ['Rimshot.wav', 'rim'],
    ['Low Tom.wav', 'tom'],
    ['Crash Cymbal.wav', 'crash'],
    ['Ride Bell.wav', 'ride'],
    ['Shaker.wav', 'perc'],
    ['Cowbell.wav', 'perc'],
    ['Vocal Chop.wav', 'other'],
    // drum-machine abbreviations
    ['BD808.wav', 'kick'],
    ['SD-01.wav', 'snare'],
    ['CH.wav', 'closed-hat'],
    ['OH.wav', 'open-hat'],
    ['HH2.wav', 'closed-hat'],
    ['CP.wav', 'clap'],
    ['RS.wav', 'rim'],
    ['LT.wav', 'tom'],
    ['CY.wav', 'crash'],
    ['CB.wav', 'perc'],
    // the directory part never decides
    ['Kicks/Tom.wav', 'tom'],
  ]
  for (const [name, want] of cases) {
    it(`${name} → ${want}`, () => expect(classifyDrum(name)).toBe(want))
  }
})

describe('orderSamples', () => {
  it('bass drum first, then snare, closed hat, open hat, then the rest', () => {
    const files = ['Open Hat.wav', 'Shaker.wav', 'Snare.wav', 'Crash.wav', 'Kick.wav', 'Closed Hat.wav', 'Clap.wav']
    expect(orderSamples(files, (f) => f)).toEqual([
      'Kick.wav', 'Snare.wav', 'Closed Hat.wav', 'Open Hat.wav', 'Clap.wav', 'Crash.wav', 'Shaker.wav',
    ])
  })

  it('unrecognised names sort last, alphabetically and numerically aware', () => {
    const files = ['Zap 10.wav', 'Zap 2.wav', 'Kick.wav']
    expect(orderSamples(files, (f) => f)).toEqual(['Kick.wav', 'Zap 2.wav', 'Zap 10.wav'])
  })

  it('is stable within a class', () => {
    const files = ['Kick A.wav', 'Kick B.wav']
    expect(orderSamples(files, (f) => f)).toEqual(['Kick A.wav', 'Kick B.wav'])
  })
})
