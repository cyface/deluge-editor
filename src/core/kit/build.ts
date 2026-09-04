/**
 * Building kit rows from samples. Nothing here invents a sound: every new row
 * is a deep clone of the blank kit's own row — the sound the firmware itself
 * creates for the new-kit gesture (`src/assets/templates/Default Kit.XML`,
 * Deluge-authored) — with only the row name, the sample file, its zone, and
 * the loop mode set. The zone end is the WAV's exact frame count
 * (`src/core/samples/wav.ts`); loop mode 1 is ONCE
 * (`SampleRepeatMode::ONCE`, `src/definitions_cxx.hpp:519`, upstream/community
 * bef6d9df), the mode every factory drum row uses.
 */

import { stemOf } from '../library/fs'
import { KIT_CHILD_ORDER, OSC_ATTR_ORDER, SOUND_ATTR_ORDER, ZONE_ATTR_ORDER } from '../preset/order'
import { drumRows, isKit, soundRows } from '../preset/rows'
import type { DrumRow, KitElement, SoundElement } from '../preset/types'
import { parseXML } from '../xml'
import { child, cloneElement } from '../xml/element'
import { ensureChild, insertChild, moveChild, removeChild, setAttr } from '../xml/edit'

export interface SampleRowSpec {
  /** As the kit XML wants it: `SAMPLES/<folder>/<file>.wav`, no leading slash. */
  fileName: string
  /** Sample frames; becomes `endSamplePos` (see `src/core/samples/wav.ts`). */
  frames: number
  /** Row name; defaults to the file's base name. */
  name?: string
}

/** The row name a sample file suggests: its base name, extension dropped. */
export const rowNameFor = (fileName: string): string => stemOf(fileName).trim()

/**
 * A row the new-kit gesture made and nothing has touched: a sound row whose
 * sample oscillator still points at no file. Building into a fresh kit
 * replaces these instead of leaving a silent first pad.
 */
export function isBlankRow(row: DrumRow): boolean {
  if (row.tag !== 'sound') return false
  const o = child(row, 'osc1')
  return o?.attrs.type === 'sample' && !o.attrs.fileName && child(o, 'sampleRanges') === undefined
}

/**
 * Extract the row template from a kit preset (the bundled blank kit): its
 * first sound row, cloned so callers can never mutate the template document.
 */
export function rowTemplateFrom(blankKitXml: string): SoundElement {
  const kit = parseXML(blankKitXml)
  if (!isKit(kit)) throw new Error('the kit template is not a <kit>')
  const [row] = soundRows(kit)
  if (!row) throw new Error('the kit template has no sound row')
  return cloneElement(row) as SoundElement
}

/**
 * Append one row per sample, in the given order (order them first with
 * `orderSamples`). Rows still blank from the new-kit gesture are replaced.
 * Names are made unique the firmware's way of thinking — a kit addresses its
 * drums by name — by suffixing ` 2`, ` 3`, … Returns the created rows.
 */
export function addSampleRows(kit: KitElement, template: SoundElement, specs: readonly SampleRowSpec[]): SoundElement[] {
  const sources = ensureChild(kit, 'soundSources', KIT_CHILD_ORDER)
  if (specs.length > 0) {
    for (const blank of drumRows(kit).filter(isBlankRow)) removeChild(sources, blank)
  }
  const taken = new Set(drumRows(kit).map((r) => (r.attrs.name ?? '').toLowerCase()))
  const added: SoundElement[] = []
  for (const spec of specs) {
    let name = (spec.name ?? rowNameFor(spec.fileName)) || 'ROW'
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${spec.name ?? rowNameFor(spec.fileName)} ${n}`
    taken.add(name.toLowerCase())
    const row = cloneElement(template) as SoundElement
    setAttr(row, 'name', name, SOUND_ATTR_ORDER)
    const o = child(row, 'osc1')
    if (!o) throw new Error('the kit template row has no osc1')
    setAttr(o, 'type', 'sample', OSC_ATTR_ORDER)
    setAttr(o, 'loopMode', '1', OSC_ATTR_ORDER)
    setAttr(o, 'fileName', spec.fileName, OSC_ATTR_ORDER)
    const zone = ensureChild(o, 'zone')
    setAttr(zone, 'startSamplePos', '0', ZONE_ATTR_ORDER)
    setAttr(zone, 'endSamplePos', String(spec.frames), ZONE_ATTR_ORDER)
    insertChild(sources, row) // no order: rows are pads, and a new one is the last
    added.push(row)
  }
  return added
}

/**
 * Append one empty row, the way the instrument adds one: the drum creator
 * names it `U` and counts up until the name is free (`prefix = "U"` in
 * `InstrumentClipView::enterDrumCreator`, `gui/views/instrument_clip_view.cpp:5466`,
 * with `Kit::makeDrumNameUnique`, `model/instrument/kit.cpp:927`,
 * upstream/community bef6d9df), and the drum is set up as a sample. The row
 * itself is the blank kit's own, so it carries exactly what the device writes
 * for a fresh drum — including the empty `fileName`, which is what makes it a
 * blank row (`isBlankRow`) for the folder builder to replace.
 */
export function addBlankRow(kit: KitElement, template: SoundElement): SoundElement {
  const sources = ensureChild(kit, 'soundSources', KIT_CHILD_ORDER)
  const taken = new Set(drumRows(kit).map((r) => (r.attrs.name ?? '').toLowerCase()))
  let n = 1
  let name = 'U1'
  while (taken.has(name.toLowerCase())) name = `U${++n}`
  const row = cloneElement(template) as SoundElement
  setAttr(row, 'name', name, SOUND_ATTR_ORDER)
  insertChild(sources, row)
  return row
}

/** Move a row within the kit (indexes in pad order, bottom row 0). */
export function moveRow(kit: KitElement, from: number, to: number): void {
  const sources = child(kit, 'soundSources')
  if (sources) moveChild(sources, from, to)
}

export function removeRow(kit: KitElement, row: DrumRow): void {
  const sources = child(kit, 'soundSources')
  if (sources) removeChild(sources, row)
}

export function renameRow(row: DrumRow, name: string): void {
  setAttr(row, 'name', name, SOUND_ATTR_ORDER)
}
