/**
 * The kit builder: samples in, kit rows out (issue #10). Dropping or picking
 * a folder of WAVs builds rows through `src/core/kit/build.ts` — each a clone
 * of the blank kit's Deluge-authored row — ordered by the file-name heuristic
 * (kick on the bottom pad, then snare, closed hat, open hat, …). The bytes of
 * locally sourced samples are kept so they can be pushed to the card
 * (`SAMPLES/<folder>/`) and packaged into the share zip; samples browsed on
 * the card contribute rows and frame counts but no bytes.
 */

import initKitTemplate from '../../assets/templates/Default Kit.XML?raw'
import { addSampleRows, retargetSampleFiles, rowNameFor, rowTemplateFrom, type SampleRowSpec } from '../../core/kit/build'
import { orderSamples } from '../../core/kit/classify'
import { kitShareZip, type KitShareSample } from '../../core/kit/share'
import { isKit, drumRows, type KitElement, type SoundElement } from '../../core/preset'
import { bufferReader, readWavInfo } from '../../core/samples/wav'
import { osc } from '../../core/preset/sound'
import { child } from '../../core/xml'
import { isDirectory } from '../../core/sysex'
import { card } from './card.svelte'
import { editor, isSoundRow } from './editor.svelte'

export interface LocalSample {
  /** Path under the dropped/picked folder, e.g. `Kick.wav` or `sub/Kick.wav`. */
  relPath: string
  file: File
}

const isWav = (name: string): boolean => /\.wav$/i.test(name)

/** A folder name FAT and the firmware are happy with; keeps the user's name otherwise. */
const cleanFolder = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Kit'

class KitBuilder {
  /** The sample folder the kit's new rows point at: `SAMPLES/<folder>`. */
  folder = $state<string | null>(null)
  /** XML fileName → local bytes, for card push and the share zip. */
  bytes = $state<Map<string, Uint8Array>>(new Map())
  busy = $state<string | null>(null)
  progress = $state(0)
  error = $state<string | null>(null)
  notice = $state<string | null>(null)
  author = $state('')
  license = $state('')
  source = $state('')
  /** On-device browse: current path, null when the browser is closed. */
  cardPath = $state<string | null>(null)
  cardEntries = $state<{ name: string; dir: boolean }[]>([])

  private template: SoundElement | null = null

  /** Rows in the current kit whose sample bytes this session holds. */
  readonly pushable = $derived.by<string[]>(() => {
    if (!editor.preset || !isKit(editor.preset)) return []
    return this.kitSampleFiles().filter((f) => this.bytes.has(f))
  })

  /** Every sample file the current kit references (deduplicated, in row order). */
  kitSampleFiles(): string[] {
    const preset = editor.preset
    if (!preset || !isKit(preset)) return []
    const files: string[] = []
    for (const row of drumRows(preset)) {
      if (!isSoundRow(row)) continue
      const o = osc(row, 1)
      const one = o?.attrs.fileName
      if (one && !files.includes(one)) files.push(one)
      const ranges = o && child(o, 'sampleRanges')
      for (const r of ranges?.children ?? []) {
        const f = r.attrs.fileName
        if (f && !files.includes(f)) files.push(f)
      }
    }
    return files
  }

  /**
   * Build (or extend) the kit from local WAV files. Creates a new kit first
   * when nothing is loaded or a synth is; the guessed order puts the kick on
   * the bottom pad. Non-WAV files are ignored, not an error — a sample folder
   * usually has strays.
   */
  async addLocalSamples(folderName: string, files: LocalSample[]): Promise<void> {
    const wavs = files.filter((f) => isWav(f.relPath) && !f.relPath.split('/').pop()!.startsWith('.'))
    if (wavs.length === 0) {
      this.error = 'no .wav files in that folder — the Deluge kit builder reads WAV samples'
      return
    }
    await this.run(`Reading ${wavs.length} WAV header${wavs.length === 1 ? '' : 's'}`, async () => {
      const folder = cleanFolder(folderName)
      const specs: SampleRowSpec[] = []
      const loaded = new Map<string, Uint8Array>()
      let done = 0
      for (const { relPath, file } of wavs) {
        const data = new Uint8Array(await file.arrayBuffer())
        const fileName = `SAMPLES/${folder}/${relPath}`
        try {
          const info = await readWavInfo(bufferReader(data))
          specs.push({ fileName, frames: info.frames, name: rowNameFor(relPath) })
          loaded.set(fileName, data)
        } catch (e) {
          // a broken WAV gets skipped, said out loud, and the rest still load
          this.notice = `${relPath}: ${e instanceof Error ? e.message : String(e)} — skipped`
        }
        this.progress = ++done / wavs.length
      }
      if (specs.length === 0) throw new Error('none of the WAV files could be read')
      this.buildRows(specs, folder)
      for (const [name, data] of loaded) this.bytes.set(name, data)
      this.bytes = new Map(this.bytes)
      this.notice = `${specs.length} row${specs.length === 1 ? '' : 's'} added from ${folder}`
    })
  }

  /** Open (or navigate) the on-device folder browser. */
  async browseCard(path = '/SAMPLES'): Promise<void> {
    await this.run(`Reading ${path}`, async () => {
      const entries = await card.listPath(path)
      this.cardPath = path
      this.cardEntries = entries.map((e) => ({ name: e.name, dir: isDirectory(e) }))
    })
  }

  cardUp(): void {
    if (!this.cardPath || this.cardPath === '/SAMPLES') return
    void this.browseCard(this.cardPath.slice(0, this.cardPath.lastIndexOf('/')) || '/SAMPLES')
  }

  closeCardBrowser(): void {
    this.cardPath = null
    this.cardEntries = []
  }

  /**
   * Build rows from the WAVs in the browsed on-device folder. Frame counts
   * come from a ranged read of each header — the samples themselves stay on
   * the card and are never transferred.
   */
  async addCardFolder(): Promise<void> {
    const path = this.cardPath
    if (!path) return
    const wavs = this.cardEntries.filter((e) => !e.dir && isWav(e.name))
    if (wavs.length === 0) {
      this.error = `no .wav files in ${path}`
      return
    }
    await this.run(`Reading ${wavs.length} WAV header${wavs.length === 1 ? '' : 's'} from the card`, async () => {
      const specs: SampleRowSpec[] = []
      let done = 0
      for (const { name } of wavs) {
        const full = `${path}/${name}`
        try {
          const info = await card.wavInfo(full)
          specs.push({ fileName: full.replace(/^\//, ''), frames: info.frames, name: rowNameFor(name) })
        } catch (e) {
          this.notice = `${name}: ${e instanceof Error ? e.message : String(e)} — skipped`
        }
        this.progress = ++done / wavs.length
      }
      if (specs.length === 0) throw new Error('none of the WAV files could be read')
      this.buildRows(specs, path.split('/').pop() ?? null)
      this.closeCardBrowser()
      this.notice = `${specs.length} row${specs.length === 1 ? '' : 's'} added from ${path}`
    })
  }

  /**
   * Saving the kit to `savePath` moves its locally sourced samples to the
   * matching folder: `/KITS/AudioPilz/Rumbles.XML` puts them under
   * `SAMPLES/AudioPilz/Rumbles/`, and every row's `fileName` follows. Only
   * byte-backed samples move — a row pointing at something already on the
   * card (a factory sample, a browsed folder) keeps its path, because the
   * referenced file can't be moved from here.
   */
  retargetToSavePath(savePath: string): void {
    const preset = editor.preset
    if (!preset || !isKit(preset)) return
    const stem = savePath.replace(/^\//, '').replace(/^KITS\//i, '').replace(/\.xml$/i, '')
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
   * Write every locally held sample the kit references that the card is
   * missing (or holds at a different size — FAT names compare
   * case-insensitively). Returns how many were written; runs inside either
   * the card panel's save flow or this store's push flow, which own the
   * busy/progress display via `onStatus`.
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
    return want.length
  }

  /** The builder panel's push button: same sync, with its own status display. */
  async pushToCard(): Promise<void> {
    if (this.pushable.length === 0) return
    await this.run('Checking the card', async () => {
      const n = await this.syncMissingToCard((label, p) => {
        this.busy = label
        this.progress = p
      })
      this.notice = n === 0 ? 'every sample is already on the card' : `${n} sample${n === 1 ? '' : 's'} written`
    })
  }

  /** The share zip: kit XML under KITS/, byte-backed samples under SAMPLES/, README. */
  downloadZip(): void {
    const preset = editor.preset
    if (!preset || !isKit(preset)) return
    const kitFileName = (editor.fileName || `${this.folder ?? 'Kit'}.XML`).replace(/\.xml$/i, '.XML')
    const samples: KitShareSample[] = this.kitSampleFiles().map((fileName) => ({
      fileName,
      data: this.bytes.get(fileName),
    }))
    const zip = kitShareZip(editor.output, {
      kitFileName,
      author: this.author.trim() || undefined,
      license: this.license.trim() || undefined,
      source: this.source.trim() || undefined,
    }, samples)
    const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kitFileName.replace(/\.XML$/, '.zip')
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Order the specs and add the rows, creating a kit first if needed. */
  private buildRows(specs: SampleRowSpec[], folder: string | null): void {
    if (!editor.preset || !isKit(editor.preset)) {
      editor.newKit()
      this.bytes = new Map()
      this.author = this.license = this.source = ''
    }
    const kit = editor.preset as KitElement
    // the same blank kit New Kit loads; parsed once, cloned per row
    this.template ??= rowTemplateFrom(initKitTemplate)
    const ordered = orderSamples(specs, (s) => s.fileName)
    addSampleRows(kit, this.template, ordered)
    this.folder = folder
    editor.row = Math.max(0, drumRows(kit).length - ordered.length)
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.progress = 0
    this.error = null
    this.notice = null
    try {
      await fn()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.busy = null
    }
  }
}

export const kit = new KitBuilder()

// Saving a kit from the card panel retargets its local samples to the saved
// folder path and brings them along (card.save()).
card.kitRetarget = (savePath) => kit.retargetToSavePath(savePath)
card.kitSampleSync = (onStatus) => kit.syncMissingToCard(onStatus)
