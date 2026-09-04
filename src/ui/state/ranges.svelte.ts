/**
 * The multi-sample range editor (issue #29): which oscillator is open and
 * which range is selected.
 *
 * The ranges themselves are in the preset tree — every edit goes through
 * `src/core/preset/ranges.ts`, which keeps the file one the instrument will
 * load: top notes ascending and unique, one unbounded range and it last, and
 * the one-range form flattened onto the `<osc>`. Nothing here writes XML.
 *
 * Pointing a range at a sample is not this editor's own question: it is the
 * same one a kit row asks, so it goes to `samplepick.svelte.ts` — one dialog,
 * so a file on this computer can become a range here too.
 */

import { isVelocityKeyed, sampleRanges, soundingOrder, type SampleRange } from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import type { OscElement, Preset } from '../../core/preset/types'
import { editor } from './editor.svelte'
import { samplePick, type PickTarget } from './samplepick.svelte'

class RangeEditor {
  /** The open oscillator (1 or 2), or null when the editor is closed. */
  which = $state<1 | 2 | null>(null)
  selected = $state(0)
  /** The preset the open oscillator belongs to; loading another closes the editor. */
  private opened = $state.raw<Preset | null>(null)

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
  }

  close(): void {
    this.which = null
  }

  toggle(which: 1 | 2): void {
    if (this.openOn === which) this.close()
    else this.open(which)
  }

  select(index: number): void {
    if (index >= 0) this.selected = index
  }

  /**
   * Ask for a sample for this oscillator: the same dialog a kit row uses, told
   * where the answer goes and told to move the selection after it, so the
   * range that was just given a file is the one on screen.
   */
  startPick(target: PickTarget): void {
    const osc = this.osc
    if (!osc || !this.editable) return
    const label = `Osc ${this.which === 2 ? 'B' : 'A'}${target.mode === 'set' ? ` range ${target.index + 1}` : ''}`
    samplePick.start(osc, { label, target, onDone: (index) => this.select(index) })
  }
}

export const ranges = new RangeEditor()
