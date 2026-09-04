/**
 * The Deluge-authored fixtures under `tests/fixtures/`, for any test that
 * wants one by name. One loader instead of a copy per test file: the glob is
 * evaluated once, a name is matched by substring so a test can say
 * `fixtureSound('Default Synth')`, and the `<sound>`/`<kit>` guards throw
 * with the fixture's name rather than a bare "not a sound".
 *
 * Nothing here is hand-written XML; see `tests/fixtures/README.md`.
 */

import { isKit, isSound } from '../../src/core/preset'
import type { KitElement, Preset, SoundElement } from '../../src/core/preset/types'
import { parseXML } from '../../src/core/xml'

/**
 * `tests/fixtures/<writer>/<name>.XML` → raw text, keyed by the path relative
 * to `tests/`. `fixtures/settings/` (card SETTINGS files, not presets) is left out.
 */
export const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>(['../fixtures/**/*.XML', '!../fixtures/settings/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** `<writer>/<name>.XML` for a `FIXTURES` key — the way `SOURCES.md` names it. */
export const fixtureName = (key: string): string => key.replace(/^(\.\.\/)?fixtures\//, '')

/** Every fixture as `[name, text]`, sorted by name, for sweeps. */
export const allFixtures = (): [string, string][] =>
  Object.entries(FIXTURES)
    .map(([k, v]): [string, string] => [fixtureName(k), v])
    .sort(([a], [b]) => a.localeCompare(b))

/**
 * The one fixture whose path contains `part`; when several do, the one whose
 * file name is exactly `part` (`'Sample Ranges'` over `Nested Sample Ranges`).
 * Throws when that still leaves none or several.
 */
export function fixtureText(part: string): string {
  let hits = Object.keys(FIXTURES).filter((k) => k.includes(part))
  if (hits.length > 1) {
    const exact = hits.filter((k) => k.endsWith(`/${part}.XML`) || k.endsWith(`/${part}`))
    if (exact.length) hits = exact
  }
  if (hits.length === 0) throw new Error(`no fixture matching "${part}"`)
  if (hits.length > 1) throw new Error(`"${part}" matches ${hits.length} fixtures: ${hits.map(fixtureName).join(', ')}`)
  return FIXTURES[hits[0]]
}

export const fixturePreset = (part: string): Preset => parseXML(fixtureText(part))

/** Parse text that must be a `<sound>`. `what` names it in the error. */
export function parseSound(text: string, what = 'text'): SoundElement {
  const p = parseXML(text)
  if (!isSound(p)) throw new Error(`${what} is a <${p.tag}>, not a <sound>`)
  return p
}

/** Parse text that must be a `<kit>`. */
export function parseKit(text: string, what = 'text'): KitElement {
  const p = parseXML(text)
  if (!isKit(p)) throw new Error(`${what} is a <${p.tag}>, not a <kit>`)
  return p
}

export const fixtureSound = (part: string): SoundElement => parseSound(fixtureText(part), part)
export const fixtureKit = (part: string): KitElement => parseKit(fixtureText(part), part)
