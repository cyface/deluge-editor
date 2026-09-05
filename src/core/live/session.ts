/**
 * Pull and push the live preset: compositions of existing ops, not new ones
 * (`docs/live-edit.md`, "Pull and push the preset").
 *
 * - **Pull** = `save {path: /TEMP/LIVE.XML, overwrite, keep}` then `read`. The
 *   editor gets the exact bytes the device would write over the instrument's
 *   own file, which is what makes diffing it against the card copy the same
 *   round-trip check every load already runs.
 * - **Push** = `write` to the same path then `load {path, as}`. The device
 *   reloads its instrument from the file in place, keeping the name and
 *   folder so a later save still lands on the original.
 *
 * The card is the buffer. `StorageManager::createFile` does not build
 * missing folders (only the song saver calls `buildPathToFile`), so `/TEMP`
 * is created once per session and FR_EXIST is the expected answer.
 */

import { SmsClient, SysexError, type LiveInstrument } from '../sysex'

/** Where the live preset travels through the card. Never a preset the browser shows: `TEMP/` is not a preset folder. */
export const LIVE_TEMP_PATH = '/TEMP/LIVE.XML'
const LIVE_TEMP_DIR = '/TEMP'
/** `f_mkdir` on a folder that is already there (`FRESULT_NAMES`, `src/core/sysex/fatfs.ts`). */
const FR_EXIST = 8

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/**
 * The identity the device gives its instrument when it saves to `path`
 * (`SaveInstrumentPresetUI::performSave`: `name` is the file name without
 * `.XML`, `dirPath` the folder without its leading slash). `/SYNTHS/Sub/Foo.XML`
 * → `{ name: 'Foo', dir: 'SYNTHS/Sub' }`; null for a path with no folder or
 * no `.XML`, which the device refuses as `path`.
 */
export function presetIdentity(path: string): { name: string; dir: string } | null {
  if (!path.startsWith('/') || !/\.xml$/i.test(path)) return null
  const cut = path.lastIndexOf('/')
  if (cut <= 0) return null
  return { name: path.slice(cut + 1, -4), dir: path.slice(1, cut) }
}

export class LiveTransfer {
  private tempReady = false

  constructor(private readonly client: SmsClient) {}

  /** The current instrument as the device would save it, plus the instrument fields the save reported. */
  async pull(): Promise<{ xml: string; inst: LiveInstrument }> {
    await this.ensureTemp()
    const inst = await this.client.save({ path: LIVE_TEMP_PATH, overwrite: true, keep: true })
    const bytes = await this.client.readFile(LIVE_TEMP_PATH)
    return { xml: decoder.decode(bytes), inst }
  }

  /**
   * Replace the device's current instrument with `xml`, keeping `as` as its
   * name and folder so the device still saves over the original file. The
   * write is verified byte for byte before the device is asked to load it.
   */
  async push(xml: string, as: { name: string; dir: string }): Promise<LiveInstrument> {
    await this.ensureTemp()
    await this.client.writeFile(LIVE_TEMP_PATH, encoder.encode(xml), undefined, 'full')
    return this.client.load(LIVE_TEMP_PATH, as)
  }

  private async ensureTemp(): Promise<void> {
    if (this.tempReady) return
    try {
      await this.client.mkdir(LIVE_TEMP_DIR)
    } catch (e) {
      if (!(e instanceof SysexError && e.code === FR_EXIST)) throw e
    }
    this.tempReady = true
  }
}
