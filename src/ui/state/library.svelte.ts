/**
 * The sample library on the Deluge's card: browse `SAMPLES/`, see which
 * songs, kits and synths name each sample or folder, and rename, move or
 * delete with those files kept true (`LibraryPanel.svelte`). The work is
 * `src/core/library`; this store holds the browsing state, the reference
 * index and its cache, and the one-question confirmations.
 *
 * The card can be in the Deluge (over MIDI, `smsFS`) or in a reader on this
 * computer (`localcard.ts`); the panel is the same either way and `source`
 * says which, with an index per source.
 *
 * The index is read once per session and then kept: a move updates it in
 * memory, and a rescan re-reads only files whose listing entry changed. It
 * is also cached in localStorage between sessions, so opening the panel on
 * the same card costs directory listings, not a re-read of every song.
 */

import {
  applyMove,
  applyMoveToIndex,
  baseName,
  deleteProblem,
  deleteTree,
  ensureFolder,
  indexFromJSON,
  indexToJSON,
  isRecordingFolder,
  joinPath,
  movePlan,
  moveProblem,
  nameProblem,
  parentOf,
  renamedRef,
  rootOf,
  SAMPLES_ROOT,
  smsFS,
  scanReferences,
  usageCounts,
  usagesOf,
  xmlPath,
  type CardEntry,
  type CardFS,
  type MovePlan,
  type ReferenceIndex,
  type ScanProgress,
  type TargetKind,
} from '../../core/library'
import { retargetSampleFiles } from '../../core/preset'
import { readWavInfo, type WavInfo } from '../../core/samples/wav'
import { errorText } from '../errtext'
import { localFS, pickCardRoot } from '../localcard'
import { audio } from './audio.svelte'
import { card } from './card.svelte'
import { confirm } from './confirm.svelte'
import { editor } from './editor.svelte'
import { samples } from './samples.svelte'

/** Where the card is: in the Deluge over MIDI, or in a reader on this computer. */
export type CardSource = 'deluge' | 'mounted'

const CACHE_KEY: Record<CardSource, string> = {
  deluge: 'deluge-editor.sample-index',
  mounted: 'deluge-editor.sample-index.mounted',
}

export interface LibraryEntry extends CardEntry {
  path: string
  /** Files naming this entry (a folder: anything under it). */
  used: number
  /** The Deluge records here: shown, never renamed, moved or deleted. */
  fixed: boolean
}

const isWav = (name: string): boolean => /\.wav$/i.test(name)
const kindOf = (e: { dir: boolean }): TargetKind => (e.dir ? 'folder' : 'file')

class Library {
  open = $state(false)
  source = $state<CardSource>('deluge')
  /** The mounted card's root folder name, for the header. */
  mountedName = $state<string | null>(null)
  path = $state(SAMPLES_ROOT)
  entries = $state<LibraryEntry[]>([])
  /** The reference index; null until the first scan of this session. */
  index = $state<ReferenceIndex | null>(null)
  scan = $state<ScanProgress | null>(null)
  busy = $state<string | null>(null)
  progress = $state(0)
  error = $state<string | null>(null)
  /** What the last operation did, in words — moved, updated N files, and any it could not. */
  notice = $state<string | null>(null)
  /** The entry picked out in the listing, whose usages are shown. */
  selected = $state<string | null>(null)
  /** Header facts for the selected WAV, read over SysEx. */
  info = $state<WavInfo | null>(null)
  /** The entry whose name is being edited, and the text so far. */
  renaming = $state<string | null>(null)
  renameTo = $state('')
  /** The entry a destination is being chosen for; the picker's folder and its subfolders. */
  moving = $state<string | null>(null)
  destPath = $state(SAMPLES_ROOT)
  destFolders = $state<string[]>([])
  /** New-folder editing. */
  newFolder = $state<string | null>(null)

  private cached: Record<CardSource, ReferenceIndex> = { deluge: this.loadCache('deluge'), mounted: this.loadCache('mounted') }
  /** One index per source; a card seen both ways is two different listings. */
  private indexes: Record<CardSource, ReferenceIndex | null> = { deluge: null, mounted: null }
  private mounted: CardFS | null = null
  private infoFor: string | null = null

  readonly selectedEntry = $derived(this.entries.find((e) => e.name === this.selected) ?? null)
  readonly usages = $derived.by<string[]>(() => {
    const e = this.selectedEntry
    return e && this.index ? usagesOf(this.index, e.path, kindOf(e)) : []
  })
  /** How many files the index covers, per root, for the status line. */
  readonly indexed = $derived.by(() => {
    const counts: Record<string, number> = {}
    for (const f of this.index?.values() ?? []) counts[rootOf(f.path)] = (counts[rootOf(f.path)] ?? 0) + 1
    return counts
  })

  /** Whether the chosen source can be read right now. */
  readonly ready = $derived(this.source === 'deluge' ? card.connected : this.mounted !== null)

  /** Open the panel on the Deluge: connect, and read the references if this session hasn't. */
  async openPanel(): Promise<void> {
    this.switchTo('deluge')
    this.open = true
    this.error = null
    this.notice = null
    if (!card.connected) {
      this.busy = 'Connecting to the Deluge'
      const ok = await card.ensureConnected()
      this.busy = null
      if (!ok) {
        this.error = card.error ?? 'could not reach the Deluge'
        return
      }
    }
    if (!this.index) await this.rescan()
    else await this.browse(this.path)
  }

  /**
   * Open the panel on a card in a reader: ask for its root folder (the
   * browser's own picker, which also grants the write permission), then read
   * the references — seconds from a reader where the Deluge takes minutes.
   */
  async openMounted(): Promise<void> {
    this.error = null
    this.notice = null
    let root
    try {
      root = await pickCardRoot()
    } catch (e) {
      this.switchTo('mounted')
      this.open = true
      this.error = errorText(e)
      return
    }
    if (!root) return // cancelled: nothing changes, the panel stays as it was
    this.mounted = localFS(root)
    this.mountedName = root.name
    this.indexes.mounted = null // a different folder is a different card
    this.switchTo('mounted')
    this.open = true
    this.path = SAMPLES_ROOT
    await this.rescan()
  }

  private switchTo(source: CardSource): void {
    if (this.source !== source) {
      this.cancelEdits()
      this.selected = null
      this.path = SAMPLES_ROOT
    }
    this.source = source
    this.index = this.indexes[source]
    // Card-only previews read from the mounted folder while it is the source.
    audio.mounted = source === 'mounted' && this.mounted ? (f) => this.mounted!.read(`/${f}`) : null
  }

  close(): void {
    if (this.busy) return
    this.open = false
    this.cancelEdits()
    audio.stop()
    audio.mounted = null
  }

  private fs(): CardFS {
    if (this.source === 'mounted') {
      if (!this.mounted) throw new Error('no card folder is open — choose one from the Open menu')
      return this.mounted
    }
    return smsFS(card.sms())
  }

  /**
   * Read the references again. `all` forgets the cache and reads every
   * file; otherwise only files whose size or timestamp changed are read.
   */
  async rescan(all = false): Promise<void> {
    await this.run('Reading references', async () => {
      const previous = all ? new Map() : (this.index ?? this.cached[this.source])
      const index = await scanReferences(this.fs(), previous, (p) => {
        this.scan = p
        this.progress = p.phase === 'reading' && p.total ? p.done / p.total : 0
      })
      this.index = this.indexes[this.source] = index
      this.scan = null
      this.saveCache()
      await this.list(this.path)
    })
  }

  async browse(path: string): Promise<void> {
    await this.run(`Reading ${path}`, () => this.list(path))
  }

  up(): void {
    if (this.path === SAMPLES_ROOT) return
    void this.browse(parentOf(this.path))
  }

  /** Enter a folder, or pick a file out to see its usages. */
  async choose(e: LibraryEntry): Promise<void> {
    this.cancelEdits()
    if (e.dir) {
      await this.browse(e.path)
      return
    }
    this.select(e.name)
  }

  select(name: string | null): void {
    this.selected = name
    this.info = null
    const e = this.selectedEntry
    if (e && !e.dir && isWav(e.name)) void this.readInfo(e.path)
  }

  private async readInfo(path: string): Promise<void> {
    this.infoFor = path
    try {
      const handle = await this.fs().reader(path)
      let info: WavInfo
      try {
        info = await readWavInfo((offset, length) => handle.read(offset, length))
      } finally {
        await handle.close()
      }
      if (this.infoFor === path) this.info = info
    } catch {
      // a file that isn't a readable WAV simply has no facts to show
    }
  }

  // ---- rename -------------------------------------------------------------

  startRename(name: string): void {
    this.cancelEdits()
    this.renaming = name
    this.renameTo = name
  }

  /** Enter in the name field: plan it, ask, do it. */
  commitRename(): void {
    const e = this.entries.find((x) => x.name === this.renaming)
    const to = this.renameTo.trim()
    this.renaming = null
    if (!e || !to || to === e.name) return
    if (!e.dir && isWav(e.name) && !isWav(to)) {
      this.error = 'a sample keeps its .wav extension — the Deluge lists only .wav files'
      return
    }
    this.proposeMove(e, joinPath(parentOf(e.path), to))
  }

  // ---- move ---------------------------------------------------------------

  startMove(name: string): void {
    this.cancelEdits()
    this.moving = name
    void this.browseDest(this.path)
  }

  async browseDest(path: string): Promise<void> {
    await this.run(`Reading ${path}`, async () => {
      const entries = await this.fs().list(path)
      this.destPath = path
      this.destFolders = entries
        .filter((x) => x.dir && !x.name.startsWith('.'))
        .map((x) => x.name)
        .sort((a, b) => a.localeCompare(b))
    })
  }

  destUp(): void {
    if (this.destPath === SAMPLES_ROOT) return
    void this.browseDest(parentOf(this.destPath))
  }

  /** "Move here": into the picker's folder, keeping the name. */
  commitMove(): void {
    const e = this.entries.find((x) => x.name === this.moving)
    const dest = this.destPath
    this.moving = null
    if (!e) return
    this.proposeMove(e, joinPath(dest, e.name))
  }

  /** Plan the move, say what it touches, and do it on the yes. */
  private proposeMove(e: LibraryEntry, to: string): void {
    if (!this.index) return
    const problem = moveProblem(e.path, to, kindOf(e))
    if (problem !== null) {
      this.error = problem
      return
    }
    const plan = movePlan(this.index, e.path, to, kindOf(e))
    const what = e.dir ? 'folder' : 'sample'
    const n = plan.files.length
    const rename = parentOf(plan.from) === parentOf(plan.to)
    const verb = rename ? 'Rename' : 'Move'
    const where = rename ? `to ${baseName(plan.to)}` : `to ${xmlPath(parentOf(plan.to))}/`
    const updates =
      n === 0
        ? 'Nothing on the card names it.'
        : `${n} file${n === 1 ? '' : 's'} will be rewritten to follow: ${plan.files.map(xmlPath).join(', ')}.`
    confirm.ask({
      question: `${verb} ${what} ${xmlPath(plan.from)} ${where}? ${updates}`,
      verb,
      run: () => this.doMove(plan),
    })
  }

  private async doMove(plan: MovePlan): Promise<void> {
    await this.run(`Moving ${baseName(plan.from)}`, async () => {
      const outcome = await applyMove(this.fs(), plan, (label, f) => {
        if (label) this.busy = label
        this.progress = f
      })
      this.index = this.indexes[this.source] = applyMoveToIndex(this.index!, plan, outcome)
      this.saveCache()
      // The preset open in the editor follows too, as an ordinary edit the
      // Changes dock lists — otherwise saving it would put the old path back.
      if (editor.preset) {
        const moved = retargetSampleFiles(editor.preset, (f) => renamedRef(f, plan.from, plan.to, plan.kind))
        if (moved.length && this.source === 'deluge') {
          samples.invalidateCardListings()
          void samples.checkMissing()
        }
      }
      const n = outcome.updated.length
      const parts = [`${xmlPath(plan.from)} → ${xmlPath(plan.to)}`]
      parts.push(n === 0 ? 'no files needed updating' : `${n} file${n === 1 ? '' : 's'} updated`)
      if (outcome.failed.length) {
        parts.push(
          `${outcome.failed.length} NOT updated and still name the old path: ${outcome.failed
            .map((f) => `${xmlPath(f.path)} (${f.error})`)
            .join('; ')}`,
        )
      }
      this.notice = parts.join(' · ')
      if (outcome.failed.length) this.error = 'some references could not be rewritten — see above, then Rescan and retry'
      this.selected = plan.kind === 'file' && parentOf(plan.to) === this.path ? baseName(plan.to) : null
      await this.list(this.path)
    })
  }

  // ---- delete -------------------------------------------------------------

  remove(name: string): void {
    const e = this.entries.find((x) => x.name === name)
    if (!e || !this.index) return
    const problem = deleteProblem(this.index, e.path, kindOf(e))
    if (problem) {
      this.error = problem
      return
    }
    this.cancelEdits()
    confirm.ask({
      question: e.dir
        ? `Delete folder ${xmlPath(e.path)} and everything in it? Nothing on the card names it. This cannot be undone.`
        : `Delete ${xmlPath(e.path)}? Nothing on the card names it. This cannot be undone.`,
      verb: 'Delete',
      run: () =>
        this.run(`Deleting ${e.name}`, async () => {
          const n = await deleteTree(this.fs(), e.path, kindOf(e), (label) => (this.busy = label))
          this.notice = e.dir ? `${xmlPath(e.path)}/ deleted (${n} file${n === 1 ? '' : 's'})` : `${xmlPath(e.path)} deleted`
          if (this.selected === e.name) this.selected = null
          await this.list(this.path)
        }),
    })
  }

  // ---- new folder ---------------------------------------------------------

  startNewFolder(): void {
    this.cancelEdits()
    this.newFolder = ''
  }

  async commitNewFolder(): Promise<void> {
    const name = (this.newFolder ?? '').trim()
    this.newFolder = null
    if (!name) return
    const problem = nameProblem(name)
    if (problem) {
      this.error = problem
      return
    }
    await this.run(`Creating ${name}`, async () => {
      await ensureFolder(this.fs(), joinPath(this.path, name))
      await this.list(this.path)
    })
  }

  cancelEdits(): void {
    this.renaming = null
    this.moving = null
    this.newFolder = null
  }

  // ---- plumbing -----------------------------------------------------------

  private async list(path: string): Promise<void> {
    const raw = (await this.fs().list(path)).filter((e) => !e.name.startsWith('.') && (e.dir || isWav(e.name)))
    const withPath = raw.map((e) => ({ ...e, path: joinPath(path, e.name) }))
    const counts = this.index
      ? usageCounts(
          this.index,
          withPath.map((e) => ({ path: e.path, kind: kindOf(e) })),
        )
      : new Map<string, number>()
    this.path = path
    this.entries = withPath
      .map((e) => ({ ...e, used: counts.get(e.path) ?? 0, fixed: isRecordingFolder(e.path) }))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    if (this.selected && !this.entries.some((e) => e.name === this.selected)) this.selected = null
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.progress = 0
    this.error = null
    this.notice = null // a new action supersedes the last one's report
    // The bar's dot pulses through a card transfer whether or not a dialog is open.
    const viaDeluge = this.source === 'deluge'
    if (viaDeluge) card.busy = label
    try {
      await fn()
    } catch (e) {
      this.error = errorText(e)
    } finally {
      this.busy = null
      this.scan = null
      if (viaDeluge) card.busy = null
    }
  }

  private loadCache(source: CardSource): ReferenceIndex {
    try {
      return indexFromJSON(JSON.parse(localStorage.getItem(CACHE_KEY[source]) ?? 'null'))
    } catch {
      return new Map() // storage can be blocked or hold junk; a cold scan is the fallback
    }
  }

  private saveCache(): void {
    if (!this.index) return
    try {
      localStorage.setItem(CACHE_KEY[this.source], JSON.stringify(indexToJSON(this.index)))
    } catch {
      // nothing lost but the shortcut next time
    }
  }
}

export const library = new Library()
