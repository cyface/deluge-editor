import { describe, expect, it } from 'vitest'
import { FEATURES, supports, type FeatureSupport } from './features'
import { parseVersion } from './version'

describe('supports', () => {
  it('is false for a feature nobody declared, without throwing', () => {
    expect(supports(parseVersion('c1.3.0'), 'no-such-feature')).toBe(false)
  })
  it('every declared feature cites a source and parses its minimums', () => {
    for (const [name, f] of Object.entries(FEATURES as Record<string, FeatureSupport>)) {
      expect(f.source, `${name} has no source`).toMatch(/\S/)
      expect(f.official ?? f.community, `${name} supports no lineage`).toBeDefined()
      if (f.official) expect(parseVersion(f.official).lineage, name).toBe('official')
      if (f.community) expect(parseVersion(f.community).lineage, name).toBe('community')
    }
  })
})
