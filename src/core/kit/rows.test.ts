import { describe, expect, it } from 'vitest'
import blankKit from '../../assets/templates/Default Kit.XML?raw'
import { fixtureKit, fixtureSound, parseKit } from '../../../tests/helpers/fixtures'
import { drumRows, type DrumRow } from '../preset'
import { rowDescription, rowSampleFile, rowSampleOsc, rowSourceAction } from './rows'

const byName = (rows: DrumRow[], name: string): DrumRow => {
  const r = rows.find((row) => row.attrs.name === name)
  if (!r) throw new Error(`no row ${name}`)
  return r
}

describe('rowDescription', () => {
  it('names a sample row by its file', () => {
    const rows = drumRows(fixtureKit('Kit Sample Rows'))
    expect(rowDescription(byName(rows, 'KICK'))).toBe('SAMPLES/Fixtures/kick.wav')
    expect(rowDescription(byName(rows, 'HATO'))).toBe('SAMPLES/Fixtures/hat-open.wav')
  })
  it('reads a blank row as having no file, not as nothing', () => {
    // The blank kit's new-kit row leaves the device with `fileName=""` on a sample oscillator.
    const rows = drumRows(parseKit(blankKit, 'Default Kit'))
    expect(rows).toHaveLength(1)
    expect(rowDescription(rows[0])).toBe('(no file)')
    expect(rowSampleFile(rows[0])).toBeUndefined()
    expect(rowSourceAction(rows[0])).toBe('sample')
  })
  it('counts a multi-sample row and names its first file', () => {
    const rows = drumRows(fixtureKit('Kit Velocity Layers'))
    expect(rowDescription(byName(rows, 'KICK'))).toBe('4 samples · SAMPLES/Fixtures/vel-kick-1.wav')
    expect(rowDescription(fixtureSound('Sample Ranges'))).toBe('2 samples · SAMPLES/Fixtures/range-low.wav')
  })
  it('names a MIDI row by its one-based channel and note, a gate row by its output', () => {
    const rows = drumRows(fixtureKit('Kit MIDI CV Rows'))
    expect(rowDescription(byName(rows, 'CLAP'))).toBe('MIDI ch 10 · note 39')
    expect(rowDescription(byName(rows, 'GATE'))).toBe('Gate 3')
  })
  it('names a synth row by mode and oscillator type', () => {
    expect(rowDescription(fixtureSound('Default Synth'))).toBe('subtractive · saw')
    // The FM fixture's <osc1> carries no `type`, so the Source constructor's default shows.
    expect(rowDescription(fixtureSound('FM Modulators'))).toBe('fm · square')
  })
})

describe('rowSampleOsc and rowSampleFile', () => {
  it('are osc1 and its lowest-sounding file for a sample row', () => {
    const rows = drumRows(fixtureKit('Kit Sample Rows'))
    const kick = byName(rows, 'KICK')
    expect(rowSampleOsc(kick)?.tag).toBe('osc1')
    expect(rowSampleFile(kick)).toBe('SAMPLES/Fixtures/kick.wav')
  })
  it('are nothing for a synth row or a MIDI row', () => {
    expect(rowSampleOsc(fixtureSound('Default Synth'))).toBeUndefined()
    expect(rowSampleFile(fixtureSound('Default Synth'))).toBeUndefined()
    const rows = drumRows(fixtureKit('Kit MIDI CV Rows'))
    expect(rowSampleOsc(byName(rows, 'CLAP'))).toBeUndefined()
    expect(rowSampleFile(byName(rows, 'GATE'))).toBeUndefined()
  })
  it('pick the lowest range of a multi-sample row, whatever order the file lists', () => {
    expect(rowSampleFile(fixtureSound('Sample Ranges'))).toBe('SAMPLES/Fixtures/range-low.wav')
  })
})

describe('rowSourceAction', () => {
  it('offers to change the one sample nearly every drum has', () => {
    const rows = drumRows(fixtureKit('Kit Sample Rows'))
    expect(rowSourceAction(byName(rows, 'SNARE'))).toBe('sample')
    expect(rowSourceAction(fixtureSound('Default Synth'))).toBe('sample')
  })
  it('says "layers" for velocity-keyed ranges and "ranges" for note-keyed ones', () => {
    const rows = drumRows(fixtureKit('Kit Velocity Layers'))
    expect(rowSourceAction(byName(rows, 'KICK'))).toBe('layers')
    expect(rowSourceAction(fixtureSound('Sample Ranges'))).toBe('ranges')
  })
})
