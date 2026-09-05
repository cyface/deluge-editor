/**
 * Live Edit addresses: the bridge between a flattened preset path and the
 * `param` op's name space (`docs/live-edit.md`).
 *
 * Every editable value already has one address in this editor, its flat
 * path (`src/core/xml/flatten.ts`: `sound/defaultParams@lpfFrequency`,
 * `kit/soundSources/sound[2]/defaultParams/envelope1@attack`). The firmware
 * addresses the ~110 automatable ones by their *file name* — the string
 * `paramNameForFile` writes for a cable destination or a mod knob
 * (`src/deluge/modulation/params/param.cpp`, resolved back by
 * `fileStringToParam`) — plus, on a kit, either a row index or the bus. Names
 * on the wire, never numeric ids: the fork renumbers the unpatched range.
 *
 * Two name tables, because the firmware has two:
 *
 * - A **sound** (a synth, or a kit row) resolves `fileStringToParam(Kind::
 *   UNPATCHED_SOUND, name, allowPatched=true)`, which scans the patched ids
 *   first. So `<defaultParams volume>` (`GLOBAL_VOLUME_POST_FX`) must be sent
 *   as `volumePostFX` — plain `volume` would hit `LOCAL_VOLUME` first — and
 *   `pitchAdjust` as `pitch`. That is exactly the MIDI Follow name space, so
 *   `SOUND_FOLLOW_SLOTS` (`src/core/preset/follow.ts`) inverted is the table.
 * - The **kit bus** resolves `fileStringToParam(Kind::UNPATCHED_GLOBAL, name,
 *   allowPatched=false)`, whose table says `volume` and `pitchAdjust` (the
 *   `volumePostFX`/`pitch` spellings exist only `forMidiFollowFile`) and
 *   `compressorShape` for `<defaultParams sidechainCompressorShape>`.
 *   `KIT_FOLLOW_SLOTS` has those; the unpatched-shared names MIDI Follow
 *   never mapped on the bus (`arpGate`, the probabilities, `rhythm`…) are the
 *   same table's shared section, so they are added from `KIT_PARAM_ATTRS`.
 *   `tempo` is left out: `paramNameForFile` has no name for
 *   `UNPATCHED_TEMPO` ("nothing, really?"), so the device cannot address it.
 *
 * A patch cable's amount is addressed by its destination name plus `src`,
 * the cable's `source` string (`sourceToString`). A cable that modulates
 * another cable's depth (`<depthControlledBy>`) is not addressed by the
 * protocol at all (`smsysex_live.cpp` `writeChange`: `isJustAParam`), and
 * neither is anything that is not an `AutoParam` — an enum, a sample path, a
 * cable's existence. Those are the whole-document path, and `classifyPath`
 * answering null is what sends them there.
 */

import { PATCH_SOURCES, type PatchSource } from '../preset/enums'
import { KIT_FOLLOW_SLOTS, SOUND_FOLLOW_SLOTS, type FollowSlot } from '../preset/follow'
import { KIT_PARAM_ATTRS, PATCHED_GLOBAL_PARAMS, PATCHED_LOCAL_PARAMS, paramNameOfAttr } from '../preset/params'
import type { LiveAddress } from '../sysex/live'
import type { FlatXML } from '../xml/flatten'
import { parseSegment } from '../xml/path'

export type { LiveAddress } from '../sysex/live'

/** Where a `<defaultParams>` value sits: the attribute, and the child it hangs off. */
const slotKey = (slot: FollowSlot): string => `${slot.under ?? ''}@${slot.attr}`

/** Slot → wire name for a sound: `SOUND_FOLLOW_SLOTS` inverted. */
const SOUND_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(SOUND_FOLLOW_SLOTS).map(([name, slot]) => [slotKey(slot), name]),
)

/**
 * Name → slot for the kit bus: the follow slots plus the unpatched-shared
 * attributes MIDI Follow never mapped there, under their file names.
 */
export const KIT_BUS_SLOTS: Readonly<Record<string, FollowSlot>> = (() => {
  const slots: Record<string, FollowSlot> = { ...KIT_FOLLOW_SLOTS }
  const covered = new Set(Object.values(KIT_FOLLOW_SLOTS).map(slotKey))
  for (const attr of KIT_PARAM_ATTRS) {
    if (attr === 'tempo' || covered.has(`@${attr}`)) continue
    slots[paramNameOfAttr(attr)] = { attr }
  }
  return slots
})()

const KIT_BUS_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(KIT_BUS_SLOTS).map(([name, slot]) => [slotKey(slot), name]),
)

/** Names a cable may point at: the patched parameters (`destination < UNPATCHED_START` in `setParam`). */
const CABLE_DESTINATIONS: ReadonlySet<string> = new Set<string>([...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS])

const isPatchSource = (s: string | undefined): s is PatchSource => (PATCH_SOURCES as readonly string[]).includes(s ?? '')

/** The tags a kit row can have; only a sound row has parameters. */
const SOUND_ROW_TAGS: ReadonlySet<string> = new Set(['sound', 'sample', 'synth'])

/**
 * The `<soundSources>` children in document order, as their path segments
 * (`sound[0]`, `midiOutput`, `sound[1]`, …). A flat map iterates in document
 * order and a row's entries are contiguous, so first appearance is position.
 * The firmware's drum index counts every row whatever its kind, which is why
 * the flattener's per-tag index cannot be used directly.
 */
export function rowSegments(flat: FlatXML): string[] {
  const prefix = 'kit/soundSources/'
  const seen: string[] = []
  for (const key of flat.keys()) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const end = Math.min(...[rest.indexOf('/'), rest.indexOf('@')].filter((i) => i >= 0))
    const seg = Number.isFinite(end) ? rest.slice(0, end) : rest
    if (seen[seen.length - 1] !== seg && !seen.includes(seg)) seen.push(seg)
  }
  return seen
}

/**
 * The fast-path address for a changed flat path, or null when the change is
 * not one the `param` op can carry and the whole document must be pushed.
 * `flat` is the document the path came from: a cable's source and
 * destination and a kit row's index are read from it.
 */
export function classifyPath(path: string, flat: FlatXML): LiveAddress | null {
  const at = path.lastIndexOf('@')
  if (at < 0) return null
  const attr = path.slice(at + 1)
  const elementPath = path.slice(0, at)
  const rawSegs = elementPath.split('/')
  const segs = rawSegs.map(parseSegment)
  if (segs.some((s) => s === null)) return null
  const tags = segs.map((s) => s!.tag)

  let owner: Pick<LiveAddress, 'drum' | 'bus'> = {}
  let i = 1
  if (tags[0] === 'kit') {
    if (tags[1] === 'soundSources') {
      const seg = rawSegs[2]
      if (seg === undefined || !SOUND_ROW_TAGS.has(tags[2])) return null
      const drum = rowSegments(flat).indexOf(seg)
      if (drum < 0) return null
      owner = { drum }
      i = 3
    } else {
      owner = { bus: true }
    }
  } else if (tags[0] !== 'sound') {
    return null
  }
  if (tags[i] !== 'defaultParams') return null
  const under = tags.slice(i + 1)
  const names = owner.bus ? KIT_BUS_NAMES : SOUND_NAMES

  if (under.length <= 1) {
    const name = names.get(`${under[0] ?? ''}@${attr}`)
    return name === undefined ? null : { ...owner, name }
  }
  if (!owner.bus && under.length === 2 && under[0] === 'patchCables' && under[1] === 'patchCable' && attr === 'amount') {
    const src = flat.get(`${elementPath}@source`)
    const destination = flat.get(`${elementPath}@destination`)
    if (!isPatchSource(src) || destination === undefined || !CABLE_DESTINATIONS.has(destination)) return null
    return { ...owner, name: destination, src }
  }
  return null
}
