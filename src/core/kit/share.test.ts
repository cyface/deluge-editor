import { describe, expect, it } from 'vitest'
import { shareReadme, shareZip } from './share'

const SAMPLES = [
  { fileName: 'SAMPLES/My Kit/Kick.wav', data: new Uint8Array([1, 2, 3]) },
  { fileName: 'SAMPLES/My Kit/Snare.wav', data: undefined },
]

describe('shareReadme', () => {
  it('says where to copy the folders and lists the contents', () => {
    const text = shareReadme({ presetFileName: 'My Kit.XML', kind: 'kit' }, SAMPLES)
    expect(text).toContain('# My Kit')
    expect(text).toContain('A kit preset for the Synthstrom Deluge')
    expect(text).toContain('`KITS` and `SAMPLES` folders onto the root of your')
    expect(text).toContain('`KITS/My Kit.XML`')
    expect(text).toContain('`SAMPLES/My Kit/Kick.wav`')
  })

  it('a synth package goes under SYNTHS/ with synth wording', () => {
    const text = shareReadme({ presetFileName: 'Sampler.XML', kind: 'synth' }, [SAMPLES[0]])
    expect(text).toContain('A synth preset for the Synthstrom Deluge')
    expect(text).toContain('`SYNTHS` and `SAMPLES` folders onto the root of your')
    expect(text).toContain('`SYNTHS/Sampler.XML`')
  })

  it('calls out samples that are not in the zip', () => {
    const text = shareReadme({ presetFileName: 'My Kit.XML', kind: 'kit' }, SAMPLES)
    expect(text).toMatch(/not included[\s\S]*Snare\.wav/)
  })

  it('credits appear only when given', () => {
    const bare = shareReadme({ presetFileName: 'K.XML', kind: 'kit' }, [])
    expect(bare).not.toContain('## Credits')
    const full = shareReadme(
      { presetFileName: 'K.XML', kind: 'kit', author: 'Tim', license: 'CC0', source: 'https://example.com' },
      [],
    )
    expect(full).toContain('- Author: Tim')
    expect(full).toContain('- Sample licensing: CC0')
    expect(full).toContain('- Sample source: https://example.com')
  })
})

describe('shareZip', () => {
  it('packages README, the preset XML under its folder, and only the samples it has bytes for', () => {
    const zip = shareZip('<kit/>', { presetFileName: 'My Kit.XML', kind: 'kit' }, SAMPLES)
    const text = new TextDecoder('latin1').decode(zip)
    expect(text).toContain('README.md')
    expect(text).toContain('KITS/My Kit.XML')
    expect(text).toContain('SAMPLES/My Kit/Kick.wav')
    // Snare has no bytes: named in the README, but not stored as an entry.
    let localHeaders = 0
    for (let i = 0; i + 4 <= zip.length; i++) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x03 && zip[i + 3] === 0x04) localHeaders++
    }
    expect(localHeaders).toBe(3)
  })

  it('a synth zip lands the XML under SYNTHS/', () => {
    const zip = shareZip('<sound/>', { presetFileName: 'Sampler.XML', kind: 'synth' }, [])
    expect(new TextDecoder('latin1').decode(zip)).toContain('SYNTHS/Sampler.XML')
  })
})
