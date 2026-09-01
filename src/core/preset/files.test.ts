import { describe, expect, it } from 'vitest'
import kitFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import rangesFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { generateXML, parseXML } from '../xml'
import { referencedSampleFiles, retargetSampleFiles } from './files'

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
