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
 *
 * The card is handed in rather than imported: `card.svelte.ts` imports this
 * module to bring the samples along with every save (`Card.write`), so a
 * bundle that has the card store has the stash — and the dependency points
 * one way.
 */

import { cardPath, isNotFound, joinPath, parentOf } from '../../core/library'
import { referencedSampleFiles, retargetSampleFiles } from '../../core/preset'
import type { DirEntry, Progress } from '../../core/sysex'
import { editor } from './editor.svelte'

/** What the stash needs of the card store: whether it is there, a listing, and a sample write. */
export interface CardLink {
  readonly connected: boolean
  listPath(path: string): Promise<DirEntry[]>
  writeSampleFile(path: string, data: Uint8Array, onProgress?: Progress): Promise<void>
}

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
  /**
   * Why the last missing-on-card check could not finish — a listing that
   * timed out or hit a disk error. Files in a folder that could not be
   * listed are left out of `missing`: not knowing is not the same as absent.
   */
  checkError = $state<string | null>(null)
  /** dir → lowercase file names, cached so edits don't re-list over SysEx. */
  private cardListings = new Map<string, Set<string>>()
  /** Counts checkMissing() runs, so an older run's answer never lands over a newer one's. */
  private checkGen = 0

  /** Every sample file the current preset references (deduplicated, in file order). */
  files(): string[] {
    return editor.preset ? referencedSampleFiles(editor.preset) : []
  }

  /**
   * The referenced files as one sorted string: the same string as long as
   * the preset names the same files, whatever else in it changes. Walking
   * the tree makes every attribute a dependency of this derived, but only a
   * change to the result reaches the effect below — a knob tick does not
   * re-run the card check (audit §1.11).
   */
  readonly fileKey = $derived(this.files().toSorted().join('\n'))

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
  async checkMissing(card: CardLink): Promise<void> {
    const gen = ++this.checkGen
    const files = this.files()
    if (!card.connected || files.length === 0) {
      if (this.missing.size) this.missing = new Set()
      this.checkError = null
      return
    }
    let error: string | null = null
    for (const dir of new Set(files.map((f) => parentOf(cardPath(f))))) {
      if (this.cardListings.has(dir)) continue
      try {
        this.cardListings.set(dir, new Set((await card.listPath(dir)).map((e) => e.name.toLowerCase())))
      } catch (e) {
        // Only "no such folder" means everything in it is missing. A timeout
        // or a disk error says nothing about the files, so the folder stays
        // unlisted (and will be asked about again) and the failure is shown.
        if (isNotFound(e)) this.cardListings.set(dir, new Set())
        else error ??= e instanceof Error ? e.message : String(e)
      }
      if (gen !== this.checkGen) return // a newer check owns the answer
    }
    const missing = new Set<string>()
    for (const f of files) {
      const full = cardPath(f)
      const listing = this.cardListings.get(parentOf(full))
      if (listing && !listing.has(full.slice(full.lastIndexOf('/') + 1).toLowerCase())) missing.add(f)
    }
    this.missing = missing
    this.checkError = error
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
  async syncMissingToCard(card: CardLink, onStatus?: (label: string, progress: number) => void): Promise<number> {
    const files = this.pushable
    if (files.length === 0) return 0
    const dirs = new Set(files.map((f) => parentOf(cardPath(f))))
    const existing = new Map<string, number>()
    for (const dir of dirs) {
      try {
        for (const e of await card.listPath(dir)) existing.set(joinPath(dir, e.name).toLowerCase(), e.size)
      } catch (e) {
        if (!isNotFound(e)) throw e // the folder does not exist yet; open-for-write creates it
      }
    }
    const want = files.filter((f) => existing.get(cardPath(f).toLowerCase()) !== this.bytes.get(f)!.length)
    let done = 0
    for (const f of want) {
      const data = this.bytes.get(f)!
      onStatus?.(`Copying ${f}`, done / want.length)
      await card.writeSampleFile(cardPath(f), data, (d, t) => onStatus?.(`Copying ${f}`, (done + (t ? d / t : 0)) / want.length))
      done++
    }
    if (want.length > 0) {
      this.invalidateCardListings()
      void this.checkMissing(card)
    }
    return want.length
  }
}

export const samples = new SampleStash()
