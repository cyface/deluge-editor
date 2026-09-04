/**
 * The editor's state: the loaded file, the tree being edited, the firmware
 * the controls are gated for, and which flow blocks are pinned. One instance,
 * imported by every component. The tree is a `$state` proxy, so a write made
 * through the core accessors (`src/core/preset/sound.ts`) re-renders whatever
 * read that value, and `output`/`diff` follow along.
 */

import initKitTemplate from '../../assets/templates/Default Kit.XML?raw'
import initSynthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { supports as featureSupported } from '../../core/firmware/features'
import { parseVersion, type FirmwareVersion } from '../../core/firmware/version'
import { drumRows, isKit, isSound, type DrumRow, type Preset, type SoundElement } from '../../core/preset'
import { guessPresetName } from '../../core/preset/files'
import {
  diffFlat, element, ensureAtPath, fillFromFlat, findAtPath, findElementAtPath, flattenXML, generateXML,
  groupFlatDiff, parseXML, removeAttr, removeChild, setAttr,
  type FlatDiff, type GroupedFlatDiff,
} from '../../core/xml'

/** Firmware the user can target. The loaded file's own version is added if it isn't one of these. */
const FIRMWARE_CHOICES = ['4.1.4', 'c1.0.1', 'c1.1.1', 'c1.2.1', 'c1.3.0'] as const

/** A file without a parseable version gets the most conservative target: the last official build. */
export const FALLBACK_FIRMWARE = '4.1.4'

function safeVersion(s: string): FirmwareVersion {
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
  /**
   * The name to save under when the preset has none of its own: the samples'
   * folder or shared stem, `.XML` added — a kit dropped in as a folder, or a
   * synth built from one, is named after what it holds (`guessPresetName`).
   * Empty when nothing suggests a name. Every save reads `fileName` first.
   */
  readonly suggestedFileName = $derived.by(() => {
    const guess = this.preset ? guessPresetName(this.preset) : undefined
    return guess ? `${guess}.XML` : ''
  })
  /**
   * Where on the Deluge's card this preset lives: the full path it was opened
   * from or last written to, set by the card store and null for anything
   * that came from this computer or from a template. Save › To Deluge ›
   * Overwrite writes back here without the browser. Load clears it: a file
   * of the same name from disk is not the card's copy.
   */
  cardPath = $state<string | null>(null)
  preset = $state<Preset | null>(null)
  /**
   * Firmware the controls are gated for. It gates *only* that: a save keeps
   * whatever `firmwareVersion` / `earliestCompatibleFirmware` the file
   * carried, because the instrument reads those to decide which legacy
   * conversions to run on the values (issue #28, decisions.md — "A save never
   * restamps the file's firmware attributes").
   */
  firmware = $state<string>(FALLBACK_FIRMWARE)
  /** Firmware of the connected (or last-connected) Deluge; set by the card store, sticky after disconnect. */
  deviceFirmware = $state<string | null>(null)
  /** Pinned flow blocks; empty means every section is expanded. Always replaced, never pushed to. */
  focus = $state.raw<string[]>([])
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
  /** The diff with wholly-new/wholly-gone elements collapsed to one entry each — what the dock shows. */
  readonly grouped = $derived<GroupedFlatDiff | null>(
    this.diff && this.flatSource && this.flatOutput
      ? groupFlatDiff(this.diff, this.flatSource, this.flatOutput)
      : null,
  )
  /** Counted as displayed: a built kit reads "17 changes", not 2340. */
  readonly changeCount = $derived(
    this.grouped
      ? this.grouped.changed.length + this.grouped.added.length + this.grouped.missing.length +
        this.grouped.addedGroups.length + this.grouped.missingGroups.length
      : 0,
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
      this.cardPath = null
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
      // The parser's own words stay off screen: what a person needs is which
      // file, and whether it is XML at all or XML of something else.
      const msg = e instanceof Error ? e.message : String(e)
      const root = /^not a Deluge preset: <(.+)>$/.exec(msg)
      this.error = root
        ? `${name} is not a Deluge preset — its root element is <${root[1]}>, not <sound> or <kit>`
        : `${name} could not be read as a Deluge preset — it is not a single well-formed XML document`
    }
  }

  /**
   * Start a preset from nothing (issue #25). The template is the firmware's
   * own blank synth — the bytes real c1.3.0 hardware saved for the synth the
   * new-synth gesture builds (see `src/assets/templates/SOURCES.md`) — loaded
   * exactly as if the user had opened that file, so the round-trip baseline
   * and the changes dock work from the first click. The empty name keeps the
   * card panel's save flow from offering a name to overwrite.
   */
  newSynth(): void {
    this.load(initSynthTemplate, '')
  }

  /**
   * Start a kit from the blank kit the firmware's new-kit gesture creates
   * (issue #10), captured the same way as the synth template. Its one blank
   * row is replaced by the first samples added (`src/core/kit/build.ts`).
   */
  newKit(): void {
    this.load(initKitTemplate, '')
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

  /**
   * A removed element comes back by *appending* a rebuilt copy under its
   * parent — but sibling indexes are positional, so the copy only lands back
   * on the group's own paths when it would be the sole child of its tag, or
   * when the index it carries is exactly the next free slot. Anywhere else
   * the append would read as a brand-new element while the group stayed
   * missing, so the dock offers no restore there (reload the file instead).
   */
  canRestoreGroup(prefix: string): boolean {
    const hit = this.preset ? restoreTarget(this.preset, prefix) : null
    return hit !== null && (hit.index === undefined ? hit.count === 0 : hit.index === hit.count)
  }

  /** Put one collapsed group back: see `groupFlatDiff` and `canRestoreGroup`. */
  revertGroup(prefix: string, kind: 'added' | 'missing'): void {
    if (!this.preset) return
    if (kind === 'added') {
      const hit = findElementAtPath(this.preset, prefix)
      if (!hit || hit.lineage.length < 2) return
      removeChild(hit.lineage[hit.lineage.length - 2], hit.el)
      for (let i = hit.lineage.length - 2; i > 0; i--) {
        const el = hit.lineage[i]
        if (Object.keys(el.attrs).length || el.children.length) break
        removeChild(hit.lineage[i - 1], el)
      }
      return
    }
    if (!this.flatSource || !this.canRestoreGroup(prefix)) return
    const hit = restoreTarget(this.preset, prefix)!
    const restored = element(hit.tag)
    fillFromFlat(restored, prefix, this.flatSource) // filled before it joins the reactive tree
    hit.parent.children.push(restored)
  }

  /**
   * A verified copy of `output` is on the card at `path`, under `name`: that
   * copy is the new clean baseline. The Changes dock reads 0 against the file
   * just written, open mode's discard guard won't arm over work that is
   * already safe, and Save › To Deluge › Overwrite writes back to `path`.
   */
  markSaved(path: string, name: string): void {
    this.source = this.output
    this.fileName = name
    this.cardPath = path
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
  /**
   * A modulator in the flow strip was clicked: inspect it, or stop. Its
   * cables are what there is to see, and they live in the Mod Matrix — so if
   * a focus has that panel collapsed to a chip, the panel is pinned alongside
   * rather than the click lighting up nothing on the page.
   */
  inspectSource(s: string): void {
    const on = this.inspect !== s
    this.inspect = on ? s : null
    if (on && this.focus.length && !this.focus.includes('cables')) this.focus = [...this.focus, 'cables']
  }
  isExpanded = (id: string): boolean => this.focus.length === 0 || this.focus.includes(id)
}

/** A group prefix resolved against the tree: parent element, tag, the index the prefix carries, and how many same-tag siblings exist now. */
function restoreTarget(root: Preset, prefix: string) {
  const cut = prefix.lastIndexOf('/')
  if (cut < 0) return null
  const m = /^([^[\]]+)(?:\[(\d+)\])?$/.exec(prefix.slice(cut + 1))
  if (!m) return null
  const parent = findElementAtPath(root, prefix.slice(0, cut))
  if (!parent) return null
  const tag = m[1]
  return {
    parent: parent.el,
    tag,
    index: m[2] === undefined ? undefined : Number(m[2]),
    count: parent.el.children.filter((c) => c.tag === tag).length,
  }
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
