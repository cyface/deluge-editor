import { describe, expect, it } from 'vitest'
import { atLeast, compareVersions, formatVersion, parseVersion } from './version'

describe('parseVersion', () => {
  it('reads the strings the Deluge writes into presets', () => {
    expect(parseVersion('4.1.4')).toEqual({ lineage: 'official', major: 4, minor: 1, patch: 4 })
    expect(parseVersion('c1.3.0')).toEqual({ lineage: 'community', major: 1, minor: 3, patch: 0 })
    expect(parseVersion('4.1.0-alpha')).toEqual({ lineage: 'official', major: 4, minor: 1, patch: 0, tag: 'alpha' })
    expect(parseVersion('c1.4.0-beta')).toMatchObject({ lineage: 'community', tag: 'beta' })
  })
  it('rejects anything else', () => {
    for (const bad of ['', '4.1', 'v4.1.4', 'C1.3.0', '4.1.4.2', 'community', '4.1.4 '])
      expect(() => parseVersion(bad), bad).toThrow(RangeError)
  })
  it('round-trips through formatVersion', () => {
    for (const s of ['4.1.4', 'c1.3.0', '4.1.0-alpha', 'c1.2.1-nightly'])
      expect(formatVersion(parseVersion(s))).toBe(s)
  })
})

describe('compareVersions', () => {
  const v = parseVersion
  it('orders numerically, not lexically', () => {
    expect(compareVersions(v('c1.10.0'), v('c1.9.0'))).toBeGreaterThan(0)
    expect(compareVersions(v('4.1.4'), v('4.1.4'))).toBe(0)
    expect(compareVersions(v('4.0.9'), v('4.1.0'))).toBeLessThan(0)
  })
  it('sorts a pre-release before its release', () => {
    expect(compareVersions(v('4.1.0-alpha'), v('4.1.0'))).toBeLessThan(0)
    expect(compareVersions(v('4.1.0-alpha'), v('4.1.0-beta'))).toBeLessThan(0)
    expect(compareVersions(v('4.1.0-beta'), v('4.0.9'))).toBeGreaterThan(0)
  })
  it('refuses to compare across lineages', () => {
    expect(() => compareVersions(v('4.1.4'), v('c1.3.0'))).toThrow(RangeError)
  })
  it('atLeast is inclusive', () => {
    expect(atLeast(v('c1.3.0'), v('c1.3.0'))).toBe(true)
    expect(atLeast(v('c1.3.0'), v('c1.3.1'))).toBe(false)
    expect(atLeast(v('c1.3.0-beta'), v('c1.3.0'))).toBe(false)
  })
})
