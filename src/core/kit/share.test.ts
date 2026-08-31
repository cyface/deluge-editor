import { describe, expect, it } from 'vitest'
import { kitReadme, kitShareZip } from './share'

const SAMPLES = [
  { fileName: 'SAMPLES/My Kit/Kick.wav', data: new Uint8Array([1, 2, 3]) },
  { fileName: 'SAMPLES/My Kit/Snare.wav', data: undefined },
]

describe('kitReadme', () => {
  it('says where to copy the folders and lists the contents', () => {
    const text = kitReadme({ kitFileName: 'My Kit.XML' }, SAMPLES)
    expect(text).toContain('# My Kit')
    expect(text).toContain('`KITS` and `SAMPLES` folders onto the root of your Deluge SD')
    expect(text).toContain('`KITS/My Kit.XML`')
    expect(text).toContain('`SAMPLES/My Kit/Kick.wav`')
  })

  it('calls out samples that are not in the zip', () => {
    const text = kitReadme({ kitFileName: 'My Kit.XML' }, SAMPLES)
    expect(text).toMatch(/not included[\s\S]*Snare\.wav/)
  })

  it('credits appear only when given', () => {
    const bare = kitReadme({ kitFileName: 'K.XML' }, [])
    expect(bare).not.toContain('## Credits')
    const full = kitReadme(
      { kitFileName: 'K.XML', author: 'Tim', license: 'CC0', source: 'https://example.com' },
      [],
    )
    expect(full).toContain('- Author: Tim')
    expect(full).toContain('- Sample licensing: CC0')
    expect(full).toContain('- Sample source: https://example.com')
  })
})

describe('kitShareZip', () => {
  it('packages README, the kit XML under KITS/, and only the samples it has bytes for', () => {
    const zip = kitShareZip('<kit/>', { kitFileName: 'My Kit.XML' }, SAMPLES)
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
})
