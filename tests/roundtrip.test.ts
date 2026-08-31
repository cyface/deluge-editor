import { describe, expect, it } from 'vitest'
import { diffFlat, flattenXML, generateXML, isClean, parseXML } from '../src/core/xml'

// Every Deluge-authored file under tests/fixtures/, as raw text — plus the
// New-button templates, which are Deluge-authored under the same rules
// (issue #25; see src/assets/templates/SOURCES.md).
const fixtures = import.meta.glob<string>(
  ['./fixtures/**/*.{xml,XML}', '../src/assets/templates/*.{xml,XML}'],
  { query: '?raw', import: 'default', eager: true },
)

describe('round trip', () => {
  const names = Object.keys(fixtures).sort()
  if (names.length === 0) {
    it.todo('needs Deluge-authored fixtures in tests/fixtures/ — see the README there')
    return
  }

  for (const name of names) {
    const src = fixtures[name]
    it(`${name}: loses, changes, and adds nothing`, () => {
      const out = generateXML(parseXML(src))
      const d = diffFlat(flattenXML(src), flattenXML(out))
      expect(d, JSON.stringify(d, null, 2)).toSatisfy(isClean)
    })
    it(`${name}: second save is byte-identical to the first`, () => {
      const once = generateXML(parseXML(src))
      const twice = generateXML(parseXML(once))
      expect(twice).toBe(once)
    })
    // The pre-3.0 nested format is read but never written, so only files in
    // the attribute format can come back byte for byte.
    if (!name.includes('old-format')) {
      it(`${name}: is reproduced byte for byte`, () => {
        expect(generateXML(parseXML(src))).toBe(src)
      })
    }
  }
})
