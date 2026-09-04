/**
 * The external files a preset depends on: sample and wavetable paths from
 * `fileName` on each oscillator and on their `sampleRanges`/`wavetableRanges`
 * children — for a kit, across every sound row. DX7 sounds are self-contained:
 * the firmware embeds the whole 156-byte patch in the preset
 * (`writeAttributeHexBytes("dx7patch", …)`, `processing/sound/sound.cpp:3712`,
 * upstream/community bef6d9df), so nothing external is referenced.
 *
 * Both walkers here go to the same places, so a preset's references and a
 * rewrite of them can never disagree about where a `fileName` lives. The name
 * guesser reads the same list, so a preset built from samples is named after
 * the samples it actually holds.
 */

import { stemOf } from '../library/fs'
import { setAttr } from '../xml/edit'
import { child, type XmlElement } from '../xml/element'
import { soundsOf } from './rows'
import type { Preset } from './types'

/** Every element that can carry a `fileName`, in file order. */
function fileHosts(preset: Preset): XmlElement[] {
  const hosts: XmlElement[] = []
  for (const sound of soundsOf(preset)) {
    for (const tag of ['osc1', 'osc2'] as const) {
      const o = child(sound, tag)
      if (!o) continue
      hosts.push(o)
      for (const rangesTag of ['sampleRanges', 'wavetableRanges'] as const) {
        hosts.push(...(child(o, rangesTag)?.children ?? []))
      }
    }
  }
  return hosts
}

export function referencedSampleFiles(preset: Preset): string[] {
  const files: string[] = []
  for (const host of fileHosts(preset)) {
    const f = host.attrs.fileName
    if (f && !files.includes(f)) files.push(f)
  }
  return files
}

/**
 * Rewrite the preset's sample references through `map`. `map` returns the new
 * path, or null to leave one untouched. Returns the changed pairs, in file
 * order.
 */
export function retargetSampleFiles(
  preset: Preset,
  map: (fileName: string) => string | null,
): { from: string; to: string }[] {
  const moved: { from: string; to: string }[] = []
  for (const host of fileHosts(preset)) {
    const from = host.attrs.fileName
    if (!from) continue
    const to = map(from)
    if (to !== null && to !== from) {
      setAttr(host, 'fileName', to) // the attribute exists, so it keeps its place
      moved.push({ from, to })
    }
  }
  return moved
}

/**
 * A trailing note token — `Piano C3` → `Piano`, `Kick` untouched. The token
 * has to be its own word, as `parseNoteName` requires, so `Grab2` keeps its
 * 2 and a `Bass` keeps its B.
 */
const withoutNote = (stem: string): string => stem.replace(/[\s_-]+[A-Ga-g][#sb]?-?\d{1,2}$/, '')

/** Characters FAT and the firmware refuse in a name, dropped; the ends trimmed. */
const cleanName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '').replace(/[\s_.-]+$/, '').trim()

/**
 * A name for a preset that has none, read off the samples it references —
 * for the kit dropped in as a folder, or the synth built from one, that is
 * about to be saved. No samples means no guess.
 *
 * Several samples are named after the folder they share — `SAMPLES/808 Kit/`
 * is what the person called the set. Samples from more than one folder take
 * the folder most of them came from. Files straight under `SAMPLES/` (or in
 * no folder at all) have no folder to be named after, so the stem they share
 * stands in: `Piano C3` and `Piano C4` are a `Piano`. One sample is its own
 * stem, note dropped. The result carries no extension.
 */
export function guessPresetName(preset: Preset): string | undefined {
  const files = referencedSampleFiles(preset)
  if (files.length === 0) return undefined
  const stems = files.map(stemOf)
  if (files.length === 1) return cleanName(withoutNote(stems[0])) || undefined

  const dirs = files.map((f) => f.split('/').slice(0, -1))
  const shared: string[] = []
  for (let i = 0; i < dirs[0].length; i++) {
    const seg = dirs[0][i]
    if (!dirs.every((d) => d[i]?.toLowerCase() === seg.toLowerCase())) break
    shared.push(seg)
  }
  const folder = shared[shared.length - 1]
  if (folder && folder.toUpperCase() !== 'SAMPLES') return cleanName(folder) || undefined

  const tally = new Map<string, number>()
  for (const d of dirs) {
    const parent = d[d.length - 1]
    if (parent && parent.toUpperCase() !== 'SAMPLES') tally.set(parent, (tally.get(parent) ?? 0) + 1)
  }
  const most = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (most) return cleanName(most) || undefined

  // Notes first, so `Piano C3` / `Piano C4` share `Piano`, not `Piano C`.
  const named = stems.map(withoutNote)
  let prefix = named[0]
  for (const stem of named) {
    let n = 0
    while (n < prefix.length && n < stem.length && prefix[n].toLowerCase() === stem[n].toLowerCase()) n++
    prefix = prefix.slice(0, n)
  }
  return cleanName(prefix) || cleanName(named[0]) || undefined
}
