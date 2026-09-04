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
import { baseName, joinPath, xmlPath } from '../../core/library'
import { isKit, drumRows, type KitElement, type SoundElement } from '../../core/preset'
import { bufferReader, readWavInfo } from '../../core/samples/wav'
import { Activity } from './activity.svelte'
import { card } from './card.svelte'
import { CardBrowser, type BrowseEntry } from './cardbrowser.svelte'
import { editor } from './editor.svelte'
import { samples } from './samples.svelte'
import { cleanFolder, count, isWav, readEach, wavsOf, withSkipped, type LocalSample } from './wavfiles'

class KitBuilder extends Activity {
  /** The share README's credits. */
  author = $state('')
  license = $state('')
  sampleSource = $state('')
  /** The on-device folder browser, on this panel's busy line. */
  readonly browser = new CardBrowser(this)

  private template: SoundElement | null = null

  /**
   * Build (or extend) the kit from local WAV files. Creates a new kit first
   * when nothing is loaded or a synth is; the guessed order puts the kick on
   * the bottom pad. Non-WAV files are ignored, not an error — a sample folder
   * usually has strays.
   */
  async addLocalSamples(folderName: string, files: LocalSample[]): Promise<void> {
    const wavs = wavsOf(files)
    if (wavs.length === 0) {
      this.error = 'no .wav files in that folder — the Deluge kit builder reads WAV samples'
      return
    }
    await this.run(`Reading ${count(wavs.length, 'WAV header')}`, async () => {
      const folder = cleanFolder(folderName, 'Kit')
      const loaded = new Map<string, Uint8Array>()
      const { results: specs, skipped } = await readEach(
        wavs,
        async ({ relPath, file }): Promise<SampleRowSpec> => {
          const data = new Uint8Array(await file.arrayBuffer())
          const fileName = `SAMPLES/${folder}/${relPath}`
          const info = await readWavInfo(bufferReader(data))
          loaded.set(fileName, data)
          return { fileName, frames: info.frames, name: rowNameFor(relPath) }
        },
        (f) => f.relPath,
        (p) => (this.progress = p),
      )
      this.buildRows(specs, folder)
      samples.hold(loaded)
      this.notice = withSkipped(`${count(specs.length, 'row')} added from ${folder}`, skipped)
    })
  }

  /**
   * Build rows from the WAVs in the browsed on-device folder — this panel's
   * own browser, or the one a row's sample dialog was looking at. Frame counts
   * come from a ranged read of each header — the samples themselves stay on
   * the card and are never transferred.
   */
  async addCardFolder(path = this.browser.path, entries: readonly BrowseEntry[] = this.browser.entries): Promise<void> {
    if (!path) return
    const wavs = entries.filter((e) => !e.dir && isWav(e.name))
    if (wavs.length === 0) {
      this.error = `no .wav files in ${path}`
      return
    }
    await this.run(`Reading ${count(wavs.length, 'WAV header')} from the card`, async () => {
      const { results: specs, skipped } = await readEach(
        wavs,
        async ({ name }): Promise<SampleRowSpec> => {
          const full = joinPath(path, name)
          const info = await card.wavInfo(full)
          return { fileName: xmlPath(full), frames: info.frames, name: rowNameFor(name) }
        },
        (e) => e.name,
        (p) => (this.progress = p),
      )
      this.buildRows(specs, baseName(path) || null)
      this.browser.close()
      this.notice = withSkipped(`${count(specs.length, 'row')} added from ${path}`, skipped)
    })
  }

  /** The builder panel's push button: the shared sync, on this panel's status line. */
  pushToCard(): Promise<void> {
    return card.pushSamples(this)
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
      source: this.sampleSource.trim() || undefined,
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
      this.author = this.license = this.sampleSource = ''
    }
    const kit = editor.preset as KitElement
    // the same blank kit New Kit loads; parsed once, cloned per row
    this.template ??= rowTemplateFrom(initKitTemplate)
    const ordered = orderSamples(specs, (s) => s.fileName)
    addSampleRows(kit, this.template, ordered)
    samples.folder = folder
    editor.row = Math.max(0, drumRows(kit).length - ordered.length)
  }
}

export const kit = new KitBuilder()
