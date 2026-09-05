/**
 * Applying the device's own changes to the tree: the inverse of
 * `classifyPath`. A `^chg` entry names a parameter the way `param` does; this
 * finds the element and attribute that hold it and writes the value through
 * the ordered accessors, so an attribute the file lacked lands where the
 * firmware writes it (`docs/decisions/core.md`, "State is the file's
 * strings, in the file's order").
 *
 * `changePath` is the same resolution without the write, and creates
 * nothing: the store uses it to recognise its own write echoing back before
 * deciding whether to apply.
 */

import { intToHex } from '../params/hex'
import { SOUND_FOLLOW_SLOTS, ensureSlotElement, slotOrder, type FollowSlot } from '../preset/follow'
import { CABLE_ATTR_ORDER } from '../preset/order'
import { drumRows, isKit, isSoundRow } from '../preset/rows'
import { cables } from '../preset/sound'
import type { KitElement, PatchCableElement, Preset, SoundElement } from '../preset/types'
import type { LiveChange } from '../sysex/live'
import { setAttr } from '../xml/edit'
import type { XmlElement } from '../xml/element'
import { KIT_BUS_SLOTS } from './address'

export type { LiveChange } from '../sysex/live'

interface Owner {
  root: SoundElement | KitElement
  kit: boolean
  /** The owner's flat path prefix: `sound`, `kit`, or `kit/soundSources/sound[2]`. */
  prefix: string
}

/** The flattener's segment for one of `siblings`: indexed only when the tag repeats. */
function segmentOf(siblings: readonly XmlElement[], el: XmlElement): string {
  const same = siblings.filter((c) => c.tag === el.tag)
  return same.length > 1 ? `${el.tag}[${same.indexOf(el)}]` : el.tag
}

/** Which element of the preset the change belongs to, or null when the preset has no such owner. */
function owner(preset: Preset, change: LiveChange): Owner | null {
  if (isKit(preset)) {
    if (change.bus) return { root: preset, kit: true, prefix: 'kit' }
    if (change.drum === undefined || change.drum < 0) return null
    const rows = drumRows(preset)
    const row = rows[change.drum]
    if (!row || !isSoundRow(row)) return null
    return { root: row, kit: false, prefix: `kit/soundSources/${segmentOf(rows, row)}` }
  }
  if (change.bus || change.drum !== undefined) return null
  return { root: preset, kit: false, prefix: 'sound' }
}

const slotFor = (o: Owner, name: string): FollowSlot | undefined =>
  (o.kit ? KIT_BUS_SLOTS : SOUND_FOLLOW_SLOTS)[name]

const slotPath = (o: Owner, slot: FollowSlot): string =>
  `${o.prefix}/defaultParams${slot.under ? `/${slot.under}` : ''}@${slot.attr}`

/** The top-level cable from `src` into `name` on a sound, if the tree has one. */
function cableFor(o: Owner, change: LiveChange): { cable: PatchCableElement; path: string } | null {
  if (o.kit) return null // the kit bus has no patch cables
  const all = cables(o.root as SoundElement)
  const cable = all.find((c) => c.attrs.source === change.src && c.attrs.destination === change.name)
  if (!cable) return null
  return { cable, path: `${o.prefix}/defaultParams/patchCables/${segmentOf(all, cable)}@amount` }
}

/**
 * The flat path a change addresses in this preset, or null when it addresses
 * nothing here: a row the kit lacks, a name the table lacks, a cable the tree
 * does not have. Pure — nothing is created.
 */
export function changePath(preset: Preset, change: LiveChange): string | null {
  const o = owner(preset, change)
  if (!o) return null
  if (change.src !== undefined) return cableFor(o, change)?.path ?? null
  const slot = slotFor(o, change.name)
  return slot ? slotPath(o, slot) : null
}

/**
 * Write the change into the tree, creating `<defaultParams>` and the child
 * element at the writer's position when the file lacked them. Returns the
 * path written, or null when the change addresses nothing here — a cable the
 * device has and the tree does not is one, and the caller's answer to null is
 * to pull the whole preset.
 */
export function applyChange(preset: Preset, change: LiveChange): string | null {
  const o = owner(preset, change)
  if (!o) return null
  const hex = intToHex(change.value)
  if (change.src !== undefined) {
    const hit = cableFor(o, change)
    if (!hit) return null
    setAttr(hit.cable, 'amount', hex, CABLE_ATTR_ORDER)
    return hit.path
  }
  const slot = slotFor(o, change.name)
  if (!slot) return null
  setAttr(ensureSlotElement(o.root, slot, o.kit), slot.attr, hex, slotOrder(slot, o.kit))
  return slotPath(o, slot)
}
