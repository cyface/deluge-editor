/**
 * The multi-sample range editor (issue #29): which oscillator is open, which
 * range is selected, and the picker that points a range at a sample.
 *
 * The ranges themselves are in the preset tree — every edit goes through
 * `src/core/preset/ranges.ts`, which keeps the file one the instrument will
 * load: top notes ascending and unique, one unbounded range and it last, and
 * the one-range form flattened onto the `<osc>`. Nothing here writes XML.
 */

import { isVelocityKeyed, sampleRanges, soundingOrder, type SampleRange } from '../../core/preset/ranges'
import { addRange, insertRange, setRangeFileName, setRangeZone } from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import { isDirectory } from '../../core/sysex'
import type { OscElement, Preset } from '../../core/preset/types'
import { card } from './card.svelte'
import { editor } from './editor.svelte'

/** What a picked sample is for: replacing a range's file, splitting one, or adding above them all. */
export type PickTarget =
  | { mode: 'set' | 'above' | 'below'; index: number }
  | { mode: 'add' }

/** Where the card browser starts, and the folder the firmware keeps samples in. */
const SAMPLES = '/SAMPLES'

class RangeEditor {
  /** The open oscillator (1 or 2), or null when the editor is closed. */
  which = $state<1 | 2 | null>(null)
  selected = $state(0)
  pick = $state<PickTarget | null>(null)
  /** A path typed into the picker, for a sample that isn't on a connected card. */
  typed = $state('')
  path = $state(SAMPLES)
  entries = $state<{ name: string; dir: boolean }[]>([])
  busy = $state<string | null>(null)
  error = $state<string | null>(null)
  /** The preset the open oscillator belongs to; loading another closes the editor. */
  private opened = $state<Preset | null>(null)

  /** The oscillator being edited, while it is still a sample oscillator. */
  readonly osc = $derived.by<OscElement | null>(() => {
    if (this.which === null || editor.preset !== this.opened || !editor.sound) return null
    const o = oscOf(editor.sound, this.which)
    return o?.attrs.type === 'sample' ? o : null
  })

  /** Which oscillator the editor is actually showing — `which`, unless the preset moved on. */
  readonly openOn = $derived<1 | 2 | null>(this.osc ? this.which : null)

  /** Its ranges in sounding order — the order the writers' indexes count in. */
  readonly ranges = $derived<SampleRange[]>(this.osc ? soundingOrder(sampleRanges(this.osc)) : [])

  /**
   * Velocity-keyed ranges are shown but never rewritten: they are a fork-only
   * feature this editor doesn't model, and a write would invent note bounds
   * the file never had (see `isVelocityKeyed`).
   */
  readonly editable = $derived(this.osc !== null && !isVelocityKeyed(this.osc))

  /** The selected range, clamped — the kit row underneath can change at any time. */
  readonly index = $derived(Math.max(0, Math.min(this.selected, this.ranges.length - 1)))
  readonly range = $derived<SampleRange | undefined>(this.ranges[this.index])

  open(which: 1 | 2): void {
    this.which = which
    this.opened = editor.preset
    this.selected = 0
    this.pick = null
    this.error = null
  }

  close(): void {
    this.which = null
    this.pick = null
  }

  toggle(which: 1 | 2): void {
    if (this.openOn === which) this.close()
    else this.open(which)
  }

  select(index: number): void {
    if (index >= 0) this.selected = index
  }

  /** Open the picker. On a connected card it lists `/SAMPLES`; otherwise it takes a typed path. */
  startPick(target: PickTarget): void {
    this.pick = target
    this.error = null
    this.typed = target.mode === 'set' ? (this.ranges[target.index]?.fileName ?? '') : ''
    if (card.connected && this.entries.length === 0) void this.browse(this.path)
  }

  cancelPick(): void {
    this.pick = null
  }

  async browse(path: string): Promise<void> {
    if (!card.connected) return
    await this.run(`Reading ${path}`, async () => {
      const entries = await card.listPath(path)
      this.path = path
      this.entries = entries.map((e) => ({ name: e.name, dir: isDirectory(e) }))
    })
  }

  up(): void {
    if (this.path === '/') return
    void this.browse(this.path.slice(0, this.path.lastIndexOf('/')) || '/')
  }

  /** A click in the card browser: enter a folder, or take the file. */
  async choose(entry: { name: string; dir: boolean }): Promise<void> {
    const full = `${this.path === '/' ? '' : this.path}/${entry.name}`
    if (entry.dir) {
      await this.browse(full)
      return
    }
    // The frame count comes from the WAV header over a ranged read, so the new
    // range's zone covers the whole sample; the audio itself stays on the card.
    let frames: number | undefined
    await this.run(`Reading ${entry.name}`, async () => {
      frames = (await card.wavInfo(full)).frames
    })
    this.assign(full, frames)
  }

  /** Take the typed path as it stands. Its length is unknown, and zero end means the whole file. */
  useTyped(): void {
    const path = this.typed.trim()
    if (path) this.assign(path, undefined)
  }

  /**
   * Point the target at `fileName`, as the firmware stores it: relative to the
   * card root, no leading slash. A range given a new sample gets a fresh zone
   * — the old one's end belongs to the old file's length.
   */
  private assign(fileName: string, frames: number | undefined): void {
    const osc = this.osc
    const target = this.pick
    if (!osc || !target || !this.editable) return
    const name = fileName.replace(/^\/+/, '')
    const zone = { startSamplePos: 0, endSamplePos: frames ?? 0 }
    let done = false
    if (target.mode === 'set') {
      done = setRangeFileName(osc, target.index, name) && setRangeZone(osc, target.index, zone)
      this.select(target.index)
    } else if (target.mode === 'add') {
      done = addRange(osc, { fileName: name, zone })
      this.select(this.ranges.length - 1)
    } else {
      done = insertRange(osc, target.index, target.mode, { fileName: name, zone })
      this.select(target.mode === 'above' ? target.index + 1 : target.index)
    }
    if (!done) {
      // The only refusals left are a one-note range that can't be split and an
      // oscillator that isn't a sample oscillator; say which rather than doing nothing.
      this.error =
        target.mode === 'above' || target.mode === 'below'
          ? 'that range is one note wide — move a split first to make room'
          : 'this oscillator cannot hold a sample'
      return
    }
    this.pick = null
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.error = null
    try {
      await fn()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.busy = null
    }
  }
}

export const ranges = new RangeEditor()
