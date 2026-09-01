export * from './enums'
export * from './files'
export * from './params'
export * from './order'
export * from './names'
export * from './notes'
export * from './ranges'
export * from './multisample'
export * from './describe'
export * from './stock'
export type * from './types'

import { child } from '../xml/element'
import type { DrumRow, KitElement, Preset, SoundElement } from './types'

export const isSound = (p: Preset): p is SoundElement => p.tag === 'sound'
export const isKit = (p: Preset): p is KitElement => p.tag === 'kit'

/** A kit's rows in pad order. Every child of `<soundSources>` is a row, whatever its tag. */
export function drumRows(kit: KitElement): DrumRow[] {
  return (child(kit, 'soundSources')?.children ?? []) as DrumRow[]
}
