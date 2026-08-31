/**
 * The editor's state: the loaded file, the tree being edited, the firmware
 * the controls are gated for, and which flow blocks are pinned. One instance,
 * imported by every component. The tree is a `$state` proxy, so a write made
 * through the core accessors (`src/core/preset/sound.ts`) re-renders whatever
 * read that value, and `output`/`diff` follow along.
 */

import { supports as featureSupported } from '../../core/firmware/features'
import { parseVersion, type FirmwareVersion } from '../../core/firmware/version'
import { drumRows, isKit, isSound, type DrumRow, type Preset, type SoundElement } from '../../core/preset'
import {
  diffFlat, ensureAtPath, findAtPath, flattenXML, generateXML, parseXML, removeAttr, removeChild, setAttr,
  type FlatDiff,
} from '../../core/xml'

/** Firmware the user can target. The loaded file's own version is added if it isn't one of these. */
export const FIRMWARE_CHOICES = ['4.1.4', 'c1.0.1', 'c1.1.1', 'c1.2.1', 'c1.3.0'] as const

/** A file without a parseable version gets the most conservative target: the last official build. */
export const FALLBACK_FIRMWARE = '4.1.4'

export function safeVersion(s: string): FirmwareVersion {
  try {
    return parseVersion(s)
  } catch {
    return parseVersion(FALLBACK_FIRMWARE)
  }
}

export const isSoundRow = (row: DrumRow | null): row is SoundElement =>
  row !== null && row.tag !== 'midiOutput' && row.tag !== 'gateOutput'

class Editor {
  /** The file as loaded, for the diff. */
  source = $state<string | null>(null)
  fileName = $state('')
  preset = $state<Preset | null>(null)
  firmware = $state<string>(FALLBACK_FIRMWARE)
  /** Firmware of the connected (or last-connected) Deluge; set by the card store, sticky after disconnect. */
  deviceFirmware = $state<string | null>(null)
  /** Pinned flow blocks; empty means every section is expanded. */
  focus = $state<string[]>([])
  /** Selected kit row (pad order). */
  row = $state(0)
  /** A patch source being inspected in the flow strip. */
  inspect = $state<string | null>(null)
  /** A cable the mod matrix should scroll to and highlight (issue #13). */
  reveal = $state<{ source: string; destination: string } | null>(null)
  showChanges = $state(false)
  error = $state<string | null>(null)

  readonly version = $derived(safeVersion(this.firmware))
  readonly rows = $derived<DrumRow[]>(this.preset && isKit(this.preset) ? drumRows(this.preset) : [])
  readonly selectedRow = $derived<DrumRow | null>(this.rows[this.row] ?? null)
  /** The `<sound>` the panels edit: the preset itself, or the selected kit row when it is a sound. */
  readonly sound = $derived<SoundElement | null>(
    this.preset === null
      ? null
      : isSound(this.preset)
        ? this.preset
        : isSoundRow(this.selectedRow)
          ? this.selectedRow
          : null,
  )
  readonly output = $derived(this.preset ? generateXML(this.preset) : '')
  readonly flatSource = $derived(this.source !== null ? flattenXML(this.source) : null)
  readonly flatOutput = $derived(this.preset ? flattenXML(this.output) : null)
  readonly diff = $derived<FlatDiff | null>(
    this.flatSource && this.flatOutput ? diffFlat(this.flatSource, this.flatOutput) : null,
  )
  readonly changeCount = $derived(
    this.diff ? this.diff.missing.length + this.diff.added.length + this.diff.changed.length : 0,
  )
  readonly identical = $derived(this.source !== null && this.output === this.source)
  readonly firmwareChoices = $derived.by<string[]>(() => {
    const set = new Set<string>(FIRMWARE_CHOICES)
    if (this.deviceFirmware !== null) set.add(this.deviceFirmware)
    set.add(this.firmware)
    return [...set].sort()
  })

  load(text: string, name: string): void {
    // A macOS AppleDouble sidecar (`._NAME.XML`) is the resource-fork
    // container Finder drops next to every file it touches on a FAT card.
    // It matches the file picker's `accept` and drag-and-drop bypasses
    // `accept` entirely, but it is binary — say what it is instead of
    // surfacing the XML parser's confusion (issue #24).
    if (name.startsWith('._')) {
      this.error = `${name} is a macOS metadata sidecar, not a preset — load ${name.slice(2)} instead`
      return
    }
    try {
      const preset = parseXML(text)
      this.preset = preset
      this.source = text
      this.fileName = name
      this.error = null
      this.focus = []
      this.row = 0
      this.inspect = null
      // The file's own version is only a default until a real device has been
      // seen; the device (or the user's explicit choice) outranks provenance.
      if (this.deviceFirmware === null) {
        const v = preset.attrs.firmwareVersion
        this.firmware = v !== undefined && isParseable(v) ? v : FALLBACK_FIRMWARE
      }
    } catch (e) {
      this.error = `${name}: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  supports = (feature: string): boolean => featureSupported(this.version, feature)

  /**
   * Put one diff entry back the way the file had it: a changed or lost value
   * is restored from the source, an added one is removed (and any container
   * the edit created is pruned once it is empty again).
   */
  revert(path: string): void {
    if (!this.preset) return
    const want = this.flatSource?.get(path)
    if (want !== undefined) {
      const hit = ensureAtPath(this.preset, path)
      if (hit) setAttr(hit.el, hit.attr, want)
      return
    }
    const hit = findAtPath(this.preset, path)
    if (!hit) return
    removeAttr(hit.el, hit.attr)
    for (let i = hit.lineage.length - 1; i > 0; i--) {
      const el = hit.lineage[i]
      if (Object.keys(el.attrs).length || el.children.length) break
      removeChild(hit.lineage[i - 1], el)
    }
  }

  /** A Deluge answered the identity inquiry: select its firmware. The choice sticks after disconnect. */
  setDeviceFirmware(v: string): void {
    if (!isParseable(v)) return
    this.deviceFirmware = v
    this.firmware = v
  }

  /** A flow block was clicked: filter to it, or with `additive` add it to the pinned set. */
  toggleFocus(id: string, additive = false): void {
    if (additive) {
      this.focus = this.focus.includes(id) ? this.focus.filter((f) => f !== id) : [...this.focus, id]
    } else {
      this.focus = this.focus.length === 1 && this.focus[0] === id ? [] : [id]
    }
  }
  clearFocus(): void {
    this.focus = []
  }
  isExpanded = (id: string): boolean => this.focus.length === 0 || this.focus.includes(id)
}

const isParseable = (s: string): boolean => {
  try {
    parseVersion(s)
    return true
  } catch {
    return false
  }
}

export const editor = new Editor()
