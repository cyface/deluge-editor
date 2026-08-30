import { describe, expect, it } from 'vitest'
import { FEATURES, LFO_SCOPE, supports, type FeatureSupport } from './features'
import { parseVersion } from './version'

const v = parseVersion
const all = Object.entries(FEATURES as Record<string, FeatureSupport>)

describe('supports', () => {
  it('is false for a feature nobody declared, without throwing', () => {
    expect(supports(v('c1.3.0'), 'no-such-feature')).toBe(false)
  })
  it('every declared feature cites a source and parses its minimums', () => {
    for (const [name, f] of all) {
      expect(f.source, `${name} has no source`).toMatch(/\S/)
      expect(f.official ?? f.community, `${name} supports no lineage`).toBeDefined()
      if (f.official) expect(parseVersion(f.official).lineage, name).toBe('official')
      if (f.community) expect(parseVersion(f.community).lineage, name).toBe('community')
    }
  })
  it('every citation names a firmware commit or a source path', () => {
    for (const [name, f] of all) {
      expect(f.source, `${name} cites neither a commit nor a path`).toMatch(/\b[0-9a-f]{8}\b|src\//)
    }
  })
})

describe('envelopes 3 and 4 (issue #2)', () => {
  it('are not on any official build', () => {
    expect(supports(v('4.1.4'), 'env3')).toBe(false)
    expect(supports(v('4.1.4'), 'env4')).toBe(false)
  })
  it('arrive in community 1.3.0', () => {
    expect(supports(v('c1.3.0'), 'env3')).toBe(true)
    expect(supports(v('c1.3.0'), 'env4')).toBe(true)
    expect(supports(v('c1.2.1'), 'env3')).toBe(false)
    expect(supports(v('c1.2.1'), 'env4')).toBe(false)
  })
})

describe('LFOs 3 and 4', () => {
  it('arrive in community 1.3.0 with lfo3 global and lfo4 per voice', () => {
    expect(supports(v('c1.2.1'), 'lfo3')).toBe(false)
    expect(supports(v('c1.3.0'), 'lfo3')).toBe(true)
    expect(supports(v('c1.3.0'), 'lfo4')).toBe(true)
    expect(LFO_SCOPE).toEqual({ lfo1: 'global', lfo2: 'voice', lfo3: 'global', lfo4: 'voice' })
  })
})

describe('release boundaries', () => {
  it('nothing in the table exists on official firmware', () => {
    for (const [name] of all) expect(supports(v('4.1.4'), name), name).toBe(false)
  })
  it('c1.0.0 has the filter additions but not the later ones', () => {
    for (const f of ['hpfMode', 'filterRoute', 'filterMorph', 'waveFold', 'unisonSpread', 'syncType'])
      expect(supports(v('c1.0.0'), f), f).toBe(true)
    for (const f of ['sidechainTag', 'audioCompressor', 'arpModes', 'maxVoices', 'dx7', 'lfo2Sync'])
      expect(supports(v('c1.0.1'), f), f).toBe(false)
  })
  it('c1.1.0 renames the sidechain tag and adds the compressor, arp modes and maxVoices', () => {
    for (const f of ['sidechainTag', 'audioCompressor', 'arpModes', 'arpRhythm', 'arpMpeVelocity', 'maxVoices'])
      expect(supports(v('c1.1.0'), f), f).toBe(true)
    for (const f of ['dx7', 'lfo2Sync', 'compressorBlend'])
      expect(supports(v('c1.1.1'), f), f).toBe(false)
  })
  it('c1.2.0 adds DX7, LFO2 sync and compressor blend', () => {
    for (const f of ['dx7', 'lfo2Sync', 'compressorBlend'])
      expect(supports(v('c1.2.0'), f), f).toBe(true)
    for (const f of ['patchCablePolarity', 'stutterConfig', 'midiOutput', 'modFxWarble', 'arp3'])
      expect(supports(v('c1.2.1'), f), f).toBe(false)
  })
  it('a pre-release of a version does not count as that version', () => {
    expect(supports(v('c1.3.0-beta'), 'env3')).toBe(false)
    expect(supports(v('c1.3.0-nightly'), 'lfo2Sync')).toBe(true)
  })
})
