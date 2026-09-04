import { describe, expect, it } from 'vitest'
import kitFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import rangesFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML?raw'
import nestedFixture from '../../../tests/fixtures/official-2.x-old-format/Nested Sample Ranges.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { generateXML, parseXML } from '../xml'
import { referencedSampleFiles } from '../preset'
import { referencedPaths, renamedRef, rewriteSampleRefs, sampleRefsIn, samePath, underFolder } from './refs'

describe('sampleRefsIn', () => {
  it('finds every fileName the preset walker finds, in the same order, and skips blank rows', () => {
    const refs = sampleRefsIn(kitFixture)
    expect(refs.map((r) => r.value)).toEqual(referencedSampleFiles(parseXML(kitFixture)))
    expect(refs.every((r) => r.attr === 'fileName')).toBe(true)
    // The blank rows (`fileName=""`) are not references to anything.
    expect(kitFixture.match(/fileName=""/g)?.length).toBeGreaterThan(0)
  })

  it('offsets point exactly at the value', () => {
    for (const r of sampleRefsIn(kitFixture)) expect(kitFixture.slice(r.start, r.end)).toBe(r.value)
    for (const r of sampleRefsIn(nestedFixture)) expect(nestedFixture.slice(r.start, r.end)).toBe(r.value)
  })

  it('reads the pre-3.0 element form', () => {
    const refs = sampleRefsIn(nestedFixture)
    expect(refs.length).toBe(21)
    expect(referencedPaths(nestedFixture)).toEqual(referencedSampleFiles(parseXML(nestedFixture)))
    expect(refs[0].value).toBe('SAMPLES/Artists/Michael Bulaw/Sitar/Freeze Sitar [2018-12-06 224345].wav')
  })

  it('a subtractive synth references nothing', () => {
    expect(sampleRefsIn(synthTemplate)).toEqual([])
  })

  /*
   * No Deluge-authored song is in the fixtures yet, so the audio-clip
   * attribute is covered by a fragment shaped as `AudioClip::writeDataToFile`
   * writes it (`model/clip/audio_clip.cpp:1059`): `filePath` beside
   * `startSamplePos`. This tests our reading of that line, not the firmware;
   * a captured song should replace it.
   */
  it('reads an audio clip’s filePath as well', () => {
    const song = '<song>\n\t<audioClip\n\t\tclipName="Loop"\n\t\tfilePath="SAMPLES/CLIPS/REC00001.WAV"\n\t\tstartSamplePos="0" />\n</song>'
    const refs = sampleRefsIn(song)
    expect(refs.map((r) => [r.value, r.attr, song.slice(r.start, r.end)])).toEqual([
      ['SAMPLES/CLIPS/REC00001.WAV', 'filePath', 'SAMPLES/CLIPS/REC00001.WAV'],
    ])
  })
})

describe('referencedPaths', () => {
  it('deduplicates case-insensitively, keeping the first spelling', () => {
    const text = '<kit>\n\t<osc1 fileName="SAMPLES/A/Kick.wav" />\n\t<osc2 fileName="samples/a/KICK.WAV" />\n</kit>'
    expect(referencedPaths(text)).toEqual(['SAMPLES/A/Kick.wav'])
  })
})

describe('path comparison', () => {
  it('is FAT’s: case-insensitive, slash-agnostic at the front', () => {
    expect(samePath('SAMPLES/Drums/Kick.wav', '/samples/drums/KICK.WAV')).toBe(true)
    expect(samePath('SAMPLES/Drums/Kick.wav', 'SAMPLES/Drums/Kick2.wav')).toBe(false)
  })
  it('a folder covers itself and what is under it, never a longer sibling name', () => {
    expect(underFolder('SAMPLES/Drums/808/Kick.wav', '/SAMPLES/drums')).toBe(true)
    expect(underFolder('SAMPLES/Drums', 'SAMPLES/Drums/')).toBe(true)
    expect(underFolder('SAMPLES/Drums2/Kick.wav', 'SAMPLES/Drums')).toBe(false)
  })
})

describe('renamedRef', () => {
  it('a file takes the new path whole', () => {
    expect(renamedRef('SAMPLES/A/kick.wav', '/SAMPLES/A/KICK.WAV', '/SAMPLES/B/Kick 2.wav', 'file')).toBe('SAMPLES/B/Kick 2.wav')
    expect(renamedRef('SAMPLES/A/snare.wav', '/SAMPLES/A/KICK.WAV', '/SAMPLES/B/Kick 2.wav', 'file')).toBeNull()
  })
  it('a folder keeps each reference’s own tail, spelling included', () => {
    expect(renamedRef('SAMPLES/A/Sub/KiCk.wav', '/SAMPLES/a', '/SAMPLES/Drums/A', 'folder')).toBe('SAMPLES/Drums/A/Sub/KiCk.wav')
  })
})

describe('rewriteSampleRefs', () => {
  it('changes only the references and leaves every other byte alone', () => {
    const { xml, count } = rewriteSampleRefs(kitFixture, 'SAMPLES/Fixtures/kick.wav', 'SAMPLES/Drums/808/Kick.wav', 'file')
    expect(count).toBe(1)
    expect(xml.length).toBe(kitFixture.length + ('SAMPLES/Drums/808/Kick.wav'.length - 'SAMPLES/Fixtures/kick.wav'.length))
    expect(xml.replace('SAMPLES/Drums/808/Kick.wav', 'SAMPLES/Fixtures/kick.wav')).toBe(kitFixture)
    // and it is still a file the instrument's own layout reproduces
    expect(generateXML(parseXML(xml))).toBe(xml)
  })

  it('a folder move rewrites every reference under it, case-insensitively', () => {
    const { xml, count } = rewriteSampleRefs(kitFixture, '/samples/FIXTURES', '/SAMPLES/Kits/Fixtures', 'folder')
    expect(count).toBe(5)
    expect(xml).not.toContain('SAMPLES/Fixtures/')
    expect(referencedPaths(xml)).toEqual(referencedPaths(kitFixture).map((p) => p.replace('SAMPLES/Fixtures/', 'SAMPLES/Kits/Fixtures/')))
    expect(sampleRefsIn(rangesFixture).length).toBe(2)
  })

  it('rewrites the element form too', () => {
    const { xml, count } = rewriteSampleRefs(nestedFixture, 'SAMPLES/Artists/Michael Bulaw', 'SAMPLES/Sitar', 'folder')
    expect(count).toBe(sampleRefsIn(nestedFixture).length)
    expect(xml).toContain('<fileName>SAMPLES/Sitar/Sitar/Freeze Sitar [2018-12-06 224345].wav</fileName>')
  })

  it('an unrelated move returns the text itself', () => {
    const r = rewriteSampleRefs(kitFixture, 'SAMPLES/Elsewhere/x.wav', 'SAMPLES/Y/x.wav', 'file')
    expect(r.count).toBe(0)
    expect(r.xml).toBe(kitFixture)
  })
})
