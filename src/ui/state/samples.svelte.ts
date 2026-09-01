/**
 * The sample bytes this session is holding, and how they get to the card.
 *
 * A preset that was built from local files carries references to samples the
 * Deluge has never seen: the kit builder's dropped folder (issue #10), the
 * multi-sample import's (issue #33). Both need the same three things — keep
 * the bytes so the samples can be previewed and packaged, move them when the
 * preset is saved somewhere else, and copy the ones the card is missing
 * before (or with) the preset that names them. None of that is about kits, so
 * it lives here and both builders use it.
 *
 * Nothing here is preset-shaped: the file list is always
 * `referencedSampleFiles(editor.preset)`, so a sample-based synth and a kit
 * behave the same way.
 */

import { referencedSampleFiles, retargetSampleFiles } from '../../core/preset'
import { card } from './card.svelte'
import { editor } from './editor.svelte'

class SampleStash {
  /** The folder under `SAMPLES/` the locally sourced samples sit in, for display. */
  folder = $state<string | null>(null)
  /** XML fileName → local bytes, for preview, card push and the share zip. */
  bytes = $state<Map<string, Uint8Array>>(new Map())
  /**
   * Sample files the preset references that are NOT on the connected card —
   * the Deluge loads such a preset anyway and those rows stay silent (issue
   * #10). Empty when no card is connected: absence of evidence is not a
   * warning.
   */
  missing = $state<Set<string>>(new Set())
  /** dir → lowercase file names, cached so edits don't re-list over SysEx. */
  private cardListings = new Map<string, Set<string>>()

  /** Every sample file the current preset references (deduplicated, in file order). */
  files(): string[] {
    return editor.preset ? referencedSampleFiles(editor.preset) : []
  }

  /** Those of them whose bytes this session holds, and so could be written. */
  readonly pushable = $derived.by<string[]>(() => this.files().filter((f) => this.bytes.has(f)))

  /** Take (or replace) the bytes for a set of files, in one reactive step. */
  hold(loaded: Iterable<readonly [string, Uint8Array]>): void {
    for (const [name, data] of loaded) this.bytes.set(name, data)
    this.bytes = new Map(this.bytes)
  }

  /** A new preset from nothing: the old preset's bytes belong to nothing now. */
  reset(): void {
    this.bytes = new Map()
    this.folder = null
  }

  /**
   * Re-derive `missing` for the current preset against the connected card,
   * listing only directories not seen since the last invalidation. FAT names
   * compare case-insensitively.
   */
  async checkMissing(): Promise<void> {
    const files = this.files()
    if (!card.connected || files.length === 0) {
      if (this.missing.size) this.missing = new Set()
      return
    }
    for (const dir of new Set(files.map((f) => `/${f.slice(0, f.lastIndexOf('/'))}`))) {
      if (this.cardListings.has(dir)) continue
      try {
        this.cardListings.set(dir, new Set((await card.listPath(dir)).map((e) => e.name.toLowerCase())))
      } catch {
        this.cardListings.set(dir, new Set()) // no such folder: everything in it is missing
      }
    }
    const missing = new Set<string>()
    for (const f of files) {
      const cut = f.lastIndexOf('/')
      if (!this.cardListings.get(`/${f.slice(0, cut)}`)?.has(f.slice(cut + 1).toLowerCase())) missing.add(f)
    }
    this.missing = missing
  }

  /** The card changed under us (connect, writes): listings are stale. */
  invalidateCardListings(): void {
    this.cardListings.clear()
  }

  /**
   * Saving the preset to `savePath` moves its locally sourced samples to the
   * matching folder: `/KITS/AudioPilz/Rumbles.XML` puts them under
   * `SAMPLES/AudioPilz/Rumbles/`, `/SYNTHS/Piano.XML` under `SAMPLES/Piano/`,
   * and every reference to them follows. Only byte-backed samples move — a
   * range pointing at something already on the card (a factory sample, a
   * browsed folder) keeps its path, because the referenced file can't be
   * moved from here.
   */
  retargetToSavePath(savePath: string): void {
    const preset = editor.preset
    if (!preset) return
    const stem = savePath.replace(/^\//, '').replace(/^(KITS|SYNTHS)\//i, '').replace(/\.xml$/i, '')
    const base = `SAMPLES/${stem}`
    const claimed = new Map<string, string>()
    const moved = retargetSampleFiles(preset, (from) => {
      if (!this.bytes.has(from)) return null
      const parts = from.split('/')
      const rel = parts.slice(2).join('/') || parts[parts.length - 1]
      let to = `${base}/${rel}`
      // two source folders can carry the same file name; keep both apart
      const prior = claimed.get(to)
      if (prior !== undefined && prior !== from) to = `${base}/${parts[1]}/${rel}`
      claimed.set(to, from)
      return to === from ? null : to
    })
    if (moved.length === 0) return
    for (const { from, to } of moved) {
      const data = this.bytes.get(from)!
      this.bytes.delete(from)
      this.bytes.set(to, data)
    }
    this.bytes = new Map(this.bytes)
    this.folder = stem.split('/').pop() ?? null
  }

  /**
   * Write every locally held sample the preset references that the card is
   * missing (or holds at a different size — FAT names compare
   * case-insensitively). Returns how many were written; runs inside a caller
   * that owns the busy/progress display via `onStatus`.
   */
  async syncMissingToCard(onStatus?: (label: string, progress: number) => void): Promise<number> {
    const files = this.pushable
    if (files.length === 0) return 0
    const dirs = new Set(files.map((f) => `/${f.slice(0, f.lastIndexOf('/'))}`))
    const existing = new Map<string, number>()
    for (const dir of dirs) {
      try {
        for (const e of await card.listPath(dir)) existing.set(`${dir}/${e.name}`.toLowerCase(), e.size)
      } catch {
        // the folder does not exist yet; open-for-write creates it
      }
    }
    const want = files.filter((f) => existing.get(`/${f}`.toLowerCase()) !== this.bytes.get(f)!.length)
    let done = 0
    for (const f of want) {
      const data = this.bytes.get(f)!
      onStatus?.(`Copying ${f}`, done / want.length)
      await card.writeSampleFile(`/${f}`, data, (d, t) => onStatus?.(`Copying ${f}`, (done + (t ? d / t : 0)) / want.length))
      done++
    }
    if (want.length > 0) {
      this.invalidateCardListings()
      void this.checkMissing()
    }
    return want.length
  }
}

export const samples = new SampleStash()

// Saving from the card panel retargets locally held samples to the saved
// folder path and brings them along (card.save()).
card.sampleRetarget = (savePath) => samples.retargetToSavePath(savePath)
card.sampleSync = (onStatus) => samples.syncMissingToCard(onStatus)
