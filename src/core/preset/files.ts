/**
 * The external files a preset depends on: sample and wavetable paths from
 * `fileName` on each oscillator and on their `sampleRanges`/`wavetableRanges`
 * children — for a kit, across every sound row. DX7 sounds are self-contained:
 * the firmware embeds the whole 156-byte patch in the preset
 * (`writeAttributeHexBytes("dx7patch", …)`, `processing/sound/sound.cpp:3712`,
 * upstream/community bef6d9df), so nothing external is referenced.
 *
 * Both functions here walk the same places, so a preset's references and a
 * rewrite of them can never disagree about where a `fileName` lives.
 */

import { child } from '../xml/element'
import type { KitElement, Preset, SoundElement } from './types'

/** Every sound in the preset: a kit's rows, or the synth itself. */
const soundsOf = (preset: Preset): SoundElement[] =>
  preset.tag === 'kit'
    ? ((child(preset as KitElement, 'soundSources')?.children ?? []).filter(
        (r): r is SoundElement => r.tag === 'sound',
      ) as SoundElement[])
    : [preset as SoundElement]

/** Every element that can carry a `fileName`, in file order. */
function fileHosts(preset: Preset): { attrs: { fileName?: string } }[] {
  const hosts: { attrs: { fileName?: string } }[] = []
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
      host.attrs.fileName = to // the attribute exists, so assignment keeps its place
      moved.push({ from, to })
    }
  }
  return moved
}
