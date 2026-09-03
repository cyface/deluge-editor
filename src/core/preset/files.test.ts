import { describe, expect, it } from 'vitest'
import kitFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import rangesFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { generateXML, parseXML } from '../xml'
import { guessPresetName, referencedSampleFiles, retargetSampleFiles } from './files'

describe('referencedSampleFiles', () => {
  it('a subtractive synth references nothing (DX7 patches are embedded too)', () => {
    expect(referencedSampleFiles(parseXML(synthTemplate))).toEqual([])
  })

  it('collects every sample row file across a kit, empty names dropped', () => {
    expect(referencedSampleFiles(parseXML(kitFixture)).sort()).toEqual([
      'SAMPLES/Fixtures/crash.wav',
      'SAMPLES/Fixtures/hat-closed.wav',
      'SAMPLES/Fixtures/hat-open.wav',
      'SAMPLES/Fixtures/kick.wav',
      'SAMPLES/Fixtures/snare.wav',
    ])
  })

  it('collects multi-sample range files from a synth', () => {
    expect(referencedSampleFiles(parseXML(rangesFixture)).sort()).toEqual([
      'SAMPLES/Fixtures/range-high.wav',
      'SAMPLES/Fixtures/range-low.wav',
    ])
  })
})

describe('retargetSampleFiles', () => {
  it('rewrites mapped fileNames in place across a kit and reports the moves', () => {
    const kit = parseXML(kitFixture)
    const moved = retargetSampleFiles(kit, (f) =>
      f.startsWith('SAMPLES/Fixtures/') ? f.replace('SAMPLES/Fixtures/', 'SAMPLES/AudioPilz/Rumbles/') : null,
    )
    expect(moved.length).toBe(5)
    expect(moved[0].to).toBe('SAMPLES/AudioPilz/Rumbles/kick.wav')
    const xml = generateXML(kit)
    expect(xml).not.toContain('SAMPLES/Fixtures/')
    // a second save is still byte-identical after the rewrite
    expect(generateXML(parseXML(xml))).toBe(xml)
  })

  it('reaches a synth’s sample ranges, which is where a multi-sample import puts them', () => {
    const synth = parseXML(rangesFixture)
    const moved = retargetSampleFiles(synth, (f) => f.replace('SAMPLES/Fixtures/', 'SAMPLES/Piano/'))
    expect(moved.map((m) => m.to).sort()).toEqual(['SAMPLES/Piano/range-high.wav', 'SAMPLES/Piano/range-low.wav'])
    expect(referencedSampleFiles(synth).sort()).toEqual(['SAMPLES/Piano/range-high.wav', 'SAMPLES/Piano/range-low.wav'])
  })

  it('a null mapping leaves a reference untouched', () => {
    const kit = parseXML(kitFixture)
    expect(retargetSampleFiles(kit, () => null)).toEqual([])
    expect(generateXML(kit)).toContain('SAMPLES/Fixtures/kick.wav')
  })
})

describe('guessPresetName', () => {
  /** A synth whose osc1 holds the given ranges, or one plain file. */
  const synthWith = (...files: string[]) => {
    const preset = parseXML(rangesFixture)
    retargetSampleFiles(preset, (f) => (f.endsWith('range-low.wav') ? files[0] : (files[1] ?? files[0])))
    return preset
  }

  it('has nothing to say about a preset with no samples', () => {
    expect(guessPresetName(parseXML(synthTemplate))).toBeUndefined()
  })

  it('names a kit after the folder its rows share', () => {
    expect(guessPresetName(parseXML(kitFixture))).toBe('Fixtures')
  })

  it('names a multi-sample synth after its folder, however deep', () => {
    expect(guessPresetName(synthWith('SAMPLES/Pianos/Grand/C3.wav', 'SAMPLES/Pianos/Grand/C4.wav'))).toBe('Grand')
  })

  it('names samples from several folders after the folder most came from', () => {
    const kit = parseXML(kitFixture)
    retargetSampleFiles(kit, (f) => (f.includes('hat-') ? f.replace('Fixtures', 'Loops') : null))
    expect(guessPresetName(kit)).toBe('Fixtures') // 3 of 5
  })

  it('names files straight under SAMPLES/ by the stem they share, not SAMPLES', () => {
    expect(guessPresetName(synthWith('SAMPLES/Piano C3.wav', 'SAMPLES/Piano C4.wav'))).toBe('Piano')
  })

  it('names one sample by its own stem, the note dropped', () => {
    expect(guessPresetName(synthWith('SAMPLES/Keys/Rhodes A#3.wav', 'SAMPLES/Keys/Rhodes A#3.wav'))).toBe('Rhodes')
    expect(guessPresetName(synthWith('SAMPLES/Kick.wav', 'SAMPLES/Kick.wav'))).toBe('Kick')
    expect(guessPresetName(synthWith('SAMPLES/Grab2.wav', 'SAMPLES/Grab2.wav'))).toBe('Grab2')
  })

  it('falls back to the first stem when the files share nothing', () => {
    expect(guessPresetName(synthWith('SAMPLES/Kick C2.wav', 'SAMPLES/Snare.wav'))).toBe('Kick')
  })

  it('drops what a FAT name cannot carry', () => {
    expect(guessPresetName(synthWith('SAMPLES/What?/a.wav', 'SAMPLES/What?/b.wav'))).toBe('What')
  })
})
