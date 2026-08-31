import { describe, expect, it } from 'vitest'
import kitFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import rangesFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { parseXML } from '../xml'
import { referencedSampleFiles } from './files'

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
