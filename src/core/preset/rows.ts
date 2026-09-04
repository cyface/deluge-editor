/**
 * Which kind of preset a root element is, and a kit's rows. A leaf so that
 * both the barrel and the modules behind it (`files.ts`, `summary.ts`) can
 * ask without importing the barrel.
 */

import { child } from '../xml/element'
import type { DrumRow, KitElement, Preset, SoundElement } from './types'

export const isSound = (p: Preset): p is SoundElement => p.tag === 'sound'
export const isKit = (p: Preset): p is KitElement => p.tag === 'kit'

/** A kit's rows in pad order. Every child of `<soundSources>` is a row, whatever its tag. */
export function drumRows(kit: KitElement): DrumRow[] {
  return (child(kit, 'soundSources')?.children ?? []) as DrumRow[]
}

/** A row that is a sound (not a MIDI or gate drum). */
export const isSoundRow = (row: DrumRow): row is SoundElement => row.tag === 'sound'

/** The kit's sound rows only, in pad order. */
export const soundRows = (kit: KitElement): SoundElement[] => drumRows(kit).filter(isSoundRow)

/** Every sound in the preset: a kit's sound rows, or the synth itself. */
export const soundsOf = (preset: Preset): SoundElement[] => (isKit(preset) ? soundRows(preset) : [preset])
