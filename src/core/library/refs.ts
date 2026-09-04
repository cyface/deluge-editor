/**
 * Where a Deluge XML file names a sample, and how to rename it there.
 *
 * The firmware writes a sample path in exactly two attributes:
 *
 * - `fileName` — every oscillator range, a synth's or a kit row's, and a
 *   wavetable's (`Sound::writeSourceToFile`, `processing/sound/sound.cpp:3635`
 *   and `:3703`, upstream/community b6062d7);
 * - `filePath` — an audio clip in a song (`AudioClip::writeDataToFile`,
 *   `model/clip/audio_clip.cpp:1059`).
 *
 * A song embeds its instruments whole, so a song carries `fileName`s as well
 * as `filePath`s, and a reader that took only one of them would miss half a
 * song. The pre-3.0 format wrote every value as a child element with text
 * (`<fileName>SAMPLES/…</fileName>`), and the firmware still reads either
 * shape the same way (`readTagOrAttributeValue`), so both are references here.
 *
 * Rewriting is a splice of the text, not a parse and re-generate: the one
 * thing that must change is the path, and every other byte of a file the
 * instrument wrote — a song with structures this editor never models — has
 * to come back exactly as it was. A `&` in a path is literal both ways
 * (`docs/decisions.md`, "No XML escaping"), so the value between the quotes
 * IS the path.
 *
 * Paths compare the way the card compares them: FAT names are
 * case-insensitive, and the firmware itself matches folders with
 * `memcasecmp` (`gui/ui/browser/sample_browser.cpp:139`). A leading slash is
 * dropped — the XML never carries one, the SysEx protocol always does.
 */

import { xmlPath } from './fs'

export type RefAttr = 'fileName' | 'filePath'

export interface SampleRef {
  /** The path as written, e.g. `SAMPLES/Drums/Kick.wav`. */
  value: string
  /** Offsets of the value within the text, for splicing. */
  start: number
  end: number
  attr: RefAttr
}

/** The path as the card compares it: case folded, forward slashes, no leading slash. */
export const foldPath = (p: string): string => xmlPath(p).toLowerCase()

/** Two paths that name the same card entry. */
export const samePath = (a: string, b: string): boolean => foldPath(a) === foldPath(b)

/** Whether `path` is `folder` itself or lies under it. */
export const underFolder = (path: string, folder: string): boolean => {
  const p = foldPath(path)
  const f = foldPath(folder).replace(/\/+$/, '')
  return p === f || p.startsWith(`${f}/`)
}

/**
 * Attribute form: `fileName="…"` / `filePath="…"`, preceded by whitespace as
 * the serializer writes it (`XMLSerializer::writeAttribute`). Element form:
 * `<fileName>…</fileName>` from the pre-3.0 format. A value cannot contain a
 * quote or a `<` — FAT refuses both in a name — so the naive character class
 * is exact.
 */
const REF_RE = /(?<=\s)(fileName|filePath)="([^"]*)"|<(fileName|filePath)>([^<]*)<\/\3>/g

/** Every sample reference in the text, in file order; empty values (a blank kit row) are skipped. */
export function sampleRefsIn(xml: string): SampleRef[] {
  const refs: SampleRef[] = []
  for (const m of xml.matchAll(REF_RE)) {
    const attr = (m[1] ?? m[3]) as RefAttr
    const value = m[2] ?? m[4]
    if (!value) continue
    // `fileName="` and `<fileName>` are both the name plus two characters.
    const start = m.index + attr.length + 2
    refs.push({ value, start, end: start + value.length, attr })
  }
  return refs
}

/** The distinct paths the text references, first spelling wins, file order. */
export function referencedPaths(xml: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of sampleRefsIn(xml)) {
    const key = foldPath(r.value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r.value)
  }
  return out
}

export type TargetKind = 'file' | 'folder'

/** Whether a reference points at `target`: the file itself, or anything under the folder. */
export const refersTo = (value: string, target: string, kind: TargetKind): boolean =>
  kind === 'file' ? samePath(value, target) : underFolder(value, target)

/**
 * The reference as it reads after `from` becomes `to`. A file reference takes
 * the new path whole; one under a moved folder keeps its own tail, spelling
 * and all, under the new prefix. Null when the reference is not about `from`.
 */
export function renamedRef(value: string, from: string, to: string, kind: TargetKind): string | null {
  if (!refersTo(value, from, kind)) return null
  if (kind === 'file') return xmlPath(to)
  const tail = xmlPath(value).slice(foldPath(from).replace(/\/+$/, '').length)
  return `${xmlPath(to).replace(/\/+$/, '')}${tail}`
}

/**
 * The text with every reference to `from` renamed to `to`, and how many
 * were. Every byte outside those values is untouched.
 */
export function rewriteSampleRefs(
  xml: string,
  from: string,
  to: string,
  kind: TargetKind,
): { xml: string; count: number } {
  let out = ''
  let at = 0
  let count = 0
  for (const r of sampleRefsIn(xml)) {
    const next = renamedRef(r.value, from, to, kind)
    if (next === null || next === r.value) continue
    out += xml.slice(at, r.start) + next
    at = r.end
    count++
  }
  if (count === 0) return { xml, count: 0 }
  return { xml: out + xml.slice(at), count }
}
