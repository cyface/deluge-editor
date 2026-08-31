import { describe, expect, it } from 'vitest'
import { parseXML } from '../xml'
import { isKit, isSound } from './index'
import { cablePhrase, cablePhrases, envelopeWord, summarise, summariseSound } from './summary'

const fixtures = import.meta.glob<string>('../../../tests/fixtures/**/*.XML', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const load = (part: string) => {
  const key = Object.keys(fixtures).find((k) => k.includes(part))
  if (!key) throw new Error(`no fixture matching ${part}`)
  return parseXML(fixtures[key])
}

describe('summariseSound', () => {
  it('reads the default synth', () => {
    const p = load('Default Synth')
    if (!isSound(p)) throw new Error('not a sound')
    const s = summariseSound(p)
    expect(s.sentence).toBe(
      'Saw and square, 4 voices in unison and detuned, sustained, through a half-open 24 dB ladder, ' +
        'with Note, Env 2, Velocity and MPE Y on the cutoff and Aftertouch and Velocity on the level.',
    )
    expect(s.chips.slice(0, 3)).toEqual(['SAW+SQR', 'UNI4', 'SUSTAINED'])
    expect(s.chips).toContain('LPF24')
    expect(s.chips).not.toContain('DLY')
  })
  it('names FM and ringmod modes', () => {
    const fm = load('FM Modulators')
    const rm = load('Ringmod')
    if (!isSound(fm) || !isSound(rm)) throw new Error('not sounds')
    expect(summariseSound(fm).sentence).toMatch(/^Two-carrier, two-modulator FM/)
    expect(summariseSound(fm).chips[0]).toBe('FM')
    expect(summariseSound(rm).sentence).toMatch(/ring-modulated by/)
  })
  it('names a sample by its file', () => {
    const p = load('Sample Ranges')
    if (!isSound(p)) throw new Error('not a sound')
    expect(summariseSound(p).sentence).toMatch(/^Sample range-/)
  })
  it('does not throw on any fixture, and never returns an empty sentence', () => {
    for (const [name, xml] of Object.entries(fixtures)) {
      const s = summarise(parseXML(xml))
      expect(s.sentence, name).toMatch(/\.$/)
      expect(s.chips.length, name).toBeGreaterThan(0)
    }
  })
})

describe('summariseKit', () => {
  it('counts the rows and names them', () => {
    const p = load('Kit Sample Rows')
    if (!isKit(p)) throw new Error('not a kit')
    const s = summarise(p)
    expect(s.sentence).toBe('5 rows: KICK, SNARE, HATC, HATO and CRAS.')
    expect(s.chips[0]).toBe('5 ROWS')
  })
})

describe('words', () => {
  it('envelopeWord follows the thresholds', () => {
    expect(envelopeWord(0, 10, 0, 10)).toBe('plucked')
    expect(envelopeWord(0, 30, 0, 10)).toBe('percussive')
    expect(envelopeWord(30, 20, 25, 20)).toBe('slowly swelling')
    expect(envelopeWord(15, 20, 25, 20)).toBe('soft-attacked')
    expect(envelopeWord(0, 20, 25, 40)).toBe('long-tailed')
    expect(envelopeWord()).toBe('sustained')
  })
  it('cablePhrase has idioms for the common routes', () => {
    const cable = (source: string, destination: string) =>
      ({ tag: 'patchCable', attrs: { source, destination }, children: [] }) as never
    expect(cablePhrase(cable('lfo1', 'pitch'))).toBe('vibrato from LFO 1')
    expect(cablePhrase(cable('lfo2', 'lpfFrequency'))).toBe('LFO 2 sweeping the cutoff')
    expect(cablePhrase(cable('envelope2', 'lpfFrequency'))).toBe('Env 2 opening the filter')
    expect(cablePhrase(cable('velocity', 'volume'))).toBe('velocity on the level')
    expect(cablePhrase(cable('random', 'oscAPitch'))).toBe('Random on osc a pitch')
  })
  it('a pre-3.2 "range" destination resolves to the cable it deepens', () => {
    const cable = (source: string, destination: string, extra: Record<string, string> = {}) =>
      ({ tag: 'patchCable', attrs: { source, destination, ...extra }, children: [] }) as never
    // As Dream.XML (fw 3.1.1) writes it: lfo1→range modulates the depth of
    // the rangeAdjustable lfo1→pitch cable.
    const all = [cable('lfo1', 'range'), cable('lfo1', 'pan'), cable('lfo1', 'pitch', { rangeAdjustable: '1' })]
    expect(cablePhrase(all[0], all)).toBe('LFO 1 on its own pitch depth')
    expect(cablePhrases(all)).toEqual(['LFO 1 on pan, pitch and its own pitch depth'])
    expect(cablePhrase(cable('envelope2', 'range'), [cable('lfo1', 'pitch', { rangeAdjustable: '1' })])).toBe(
      'Env 2 on the LFO 1 pitch depth',
    )
    expect(cablePhrase(cable('lfo2', 'range'))).toBe("LFO 2 on a cable's depth")
  })
})
