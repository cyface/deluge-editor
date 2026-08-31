/**
 * The external files a preset depends on: sample and wavetable paths from
 * `fileName` on each oscillator and on their `sampleRanges`/`wavetableRanges`
 * children — for a kit, across every sound row. DX7 sounds are self-contained:
 * the firmware embeds the whole 156-byte patch in the preset
 * (`writeAttributeHexBytes("dx7patch", …)`, `processing/sound/sound.cpp:3712`,
 * upstream/community bef6d9df), so nothing external is referenced.
 */

import { child } from '../xml/element'
import type { KitElement, Preset, SoundElement } from './types'

export function referencedSampleFiles(preset: Preset): string[] {
  const sounds =
    preset.tag === 'kit'
      ? ((child(preset as KitElement, 'soundSources')?.children ?? []).filter(
          (r): r is SoundElement => r.tag === 'sound',
        ) as SoundElement[])
      : [preset as SoundElement]
  const files: string[] = []
  const add = (f: string | undefined) => {
    if (f && !files.includes(f)) files.push(f)
  }
  for (const sound of sounds) {
    for (const tag of ['osc1', 'osc2'] as const) {
      const o = child(sound, tag)
      if (!o) continue
      add(o.attrs.fileName)
      for (const rangesTag of ['sampleRanges', 'wavetableRanges'] as const) {
        for (const range of child(o, rangesTag)?.children ?? []) add(range.attrs.fileName)
      }
    }
  }
  return files
}
