/**
 * The kit builder: samples in, kit rows out (issue #10). Dropping or picking
 * a folder of WAVs builds rows through `src/core/kit/build.ts` — each a clone
 * of the blank kit's Deluge-authored row — ordered by the file-name heuristic
 * (kick on the bottom pad, then snare, closed hat, open hat, …). The bytes of
 * locally sourced samples go to the shared stash (`samples.svelte.ts`), which
 * pushes them to the card and packages them into the share zip; samples
 * browsed on the card contribute rows and frame counts but no bytes.
 */

import initKitTemplate from '../../assets/templates/Default Kit.XML?raw'
import { addBlankRow, addSampleRows, rowNameFor, rowTemplateFrom, type SampleRowSpec } from '../../core/kit/build'
import { orderSamples } from '../../core/kit/classify'
import { shareZip, type ShareSample } from '../../core/kit/share'
import { isKit, drumRows, type KitElement, type SoundElement } from '../../core/preset'
import { bufferReader, readWavInfo } from '../../core/samples/wav'
import { isDirectory } from '../../core/sysex'
import { errorText } from '../errtext'
import { card } from './card.svelte'
import { editor } from './editor.svelte'
import { samples } from './samples.svelte'

export interface LocalSample {
  /** Path under the dropped/picked folder, e.g. `Kick.wav` or `sub/Kick.wav`. */
  relPath: string
  file: File
}

const isWav = (name: string): boolean => /\.wav$/i.test(name)

/** A folder name FAT and the firmware are happy with; keeps the user's name otherwise. */
const cleanFolder = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Kit'

class KitBuilder {
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
      samples.hold(loaded)
      this.notice = `${specs.length} row${specs.length === 1 ? '' : 's'} added from ${folder}`
    })
  }

  /**
   * Open (or navigate) the on-device folder browser, connecting first if the
   * editor isn't talking to a Deluge yet — the button is the gesture, and
   * making the user find the preset panel to enable it is a puzzle, not a
   * safeguard.
   */
  async browseCard(path = '/SAMPLES'): Promise<void> {
    if (!card.connected) {
      this.busy = 'Connecting to the Deluge'
      this.error = null
      const ok = await card.ensureConnected()
      this.busy = null
      if (!ok) {
        this.error = card.error ?? 'could not reach the Deluge'
        return
      }
    }
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
   * Build rows from the WAVs in the browsed on-device folder — this panel's
   * own browser, or the one a row's sample dialog was looking at. Frame counts
   * come from a ranged read of each header — the samples themselves stay on
   * the card and are never transferred.
   */
  async addCardFolder(path = this.cardPath, entries = this.cardEntries): Promise<void> {
    if (!path) return
    const wavs = entries.filter((e) => !e.dir && isWav(e.name))
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

  /** The builder panel's push button: the shared sync, with its own status display. */
  async pushToCard(): Promise<void> {
    if (samples.pushable.length === 0) return
    await this.run('Connecting to the Deluge', async () => {
      // Same as the browse: the click is the gesture, so connect for it.
      if (!(await card.ensureConnected())) throw new Error(card.error ?? 'could not reach the Deluge')
      this.busy = 'Checking the card'
      const n = await samples.syncMissingToCard((label, p) => {
        this.busy = label
        this.progress = p
      })
      // A push runs for as long as the samples are big; another editor on the
      // same Deluge can truncate any of them the moment it saves (issue #8).
      const risky = card.otherEditor ? ' — another editor is also on this Deluge and could overwrite them' : ''
      this.notice =
        n === 0 ? 'every sample is already on the card' : `${n} sample${n === 1 ? '' : 's'} written${risky}`
    })
  }

  /**
   * The share zip: preset XML under KITS/ or SYNTHS/, byte-backed samples
   * under SAMPLES/, README. Works for any preset that references files — a
   * sample-based synth shares the same way a kit does.
   */
  downloadZip(): void {
    const preset = editor.preset
    if (!preset) return
    const kind = isKit(preset) ? ('kit' as const) : ('synth' as const)
    const fallback = kind === 'kit' ? (samples.folder ?? 'Kit') : 'Synth'
    const presetFileName = (editor.fileName || editor.suggestedFileName || `${fallback}.XML`).replace(/\.xml$/i, '.XML')
    const files: ShareSample[] = samples.files().map((fileName) => ({
      fileName,
      data: samples.bytes.get(fileName),
    }))
    const zip = shareZip(editor.output, {
      presetFileName,
      kind,
      author: this.author.trim() || undefined,
      license: this.license.trim() || undefined,
      source: this.source.trim() || undefined,
    }, files)
    const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = presetFileName.replace(/\.XML$/, '.zip')
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Add one empty row and select it — the instrument's own gesture, which
   * makes a silent sample drum named U1, U2, … and leaves choosing the sample
   * to the next step (`addBlankRow`).
   */
  addRow(): void {
    const kit = editor.preset
    if (!kit || !isKit(kit)) return
    this.template ??= rowTemplateFrom(initKitTemplate)
    addBlankRow(kit, this.template)
    // The new row is the last one. Its identity can't be used to find it: the
    // element goes into the `$state` tree and comes back out as a proxy.
    editor.row = drumRows(kit).length - 1
  }

  /** Order the specs and add the rows, creating a kit first if needed. */
  private buildRows(specs: SampleRowSpec[], folder: string | null): void {
    if (!editor.preset || !isKit(editor.preset)) {
      editor.newKit()
      samples.reset()
      this.author = this.license = this.source = ''
    }
    const kit = editor.preset as KitElement
    // the same blank kit New Kit loads; parsed once, cloned per row
    this.template ??= rowTemplateFrom(initKitTemplate)
    const ordered = orderSamples(specs, (s) => s.fileName)
    addSampleRows(kit, this.template, ordered)
    samples.folder = folder
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
      this.error = errorText(e)
    } finally {
      this.busy = null
    }
  }
}

export const kit = new KitBuilder()
