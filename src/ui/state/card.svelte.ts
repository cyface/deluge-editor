/**
 * Card access over Web MIDI: connection to the Deluge's SysEx port, the
 * directory being browsed, and load/save. All protocol work happens in
 * `src/core/sysex`; this store only wires it to a MIDI port and to the
 * editor. One instance, like `editor`.
 */

import { supports } from '../../core/firmware/features'
import { parseVersion } from '../../core/firmware/version'
import { readWavInfo, type WavInfo } from '../../core/samples/wav'
import {
  IDENTITY_REQUEST,
  isDirectory,
  parseIdentityReply,
  SmsClient,
  type DirEntry,
} from '../../core/sysex'
import { editor } from './editor.svelte'

/** Deluge port 3 is the SysEx port; any Deluge port answers, port 3 is just quietest. */
const portScore = (name: string): number =>
  /deluge/i.test(name) ? (/(^|\D)3(\D|$)|sysex/i.test(name) ? 2 : 1) : 0

const pickPort = <T extends { name: string | null }>(ports: T[]): T | undefined =>
  ports
    .filter((p) => portScore(p.name ?? '') > 0)
    .sort((a, b) => portScore(b.name ?? '') - portScore(a.name ?? ''))[0]

/** Per-request tracing: every dev build, or `localStorage.debug = 'sysex'` on the deployed site. */
const sysexDebugWanted = (): boolean => {
  if (import.meta.env.DEV) return true
  try {
    return localStorage.getItem('debug')?.includes('sysex') ?? false
  } catch {
    return false // storage can be blocked; a missing trace beats a crash
  }
}

class Card {
  open = $state(false)
  status = $state<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  portName = $state('')
  /** Firmware version from the universal device inquiry, e.g. "1.3.0". */
  identity = $state<string | null>(null)
  path = $state('/SYNTHS')
  entries = $state<DirEntry[]>([])
  saveName = $state('')
  busy = $state<string | null>(null)
  progress = $state(0)
  saved = $state<string | null>(null)
  error = $state<string | null>(null)
  /** Path armed for overwrite: the first Save click on an existing name only arms. */
  armed = $state<string | null>(null)
  /**
   * Another editor is talking to this Deluge — a second tab, another browser,
   * or any other app (issue #8). Web MIDI is not exclusive, so the client
   * sees the stranger's replies and reports them; all we can do is say so.
   * Sticky for the life of the connection: the hazard is that the other
   * editor writes a file *after* our verified save, so "it went quiet" is no
   * reassurance. Cleared when we reconnect.
   */
  otherEditor = $state(false)

  /**
   * Registered by the kit builder (src/ui/state/kit.svelte.ts): writes every
   * locally held sample the current kit references that the card is missing,
   * reporting progress; resolves to how many were written. Saving a kit
   * without its samples would leave silent rows on the instrument.
   */
  kitSampleSync: ((onStatus: (label: string, progress: number) => void) => Promise<number>) | null = null

  /**
   * Registered by the kit builder: before a kit save, move its locally
   * sourced samples (and the rows' fileName references) under the folder
   * matching the save path, so the card's layout follows the kit.
   */
  kitRetarget: ((savePath: string) => void) | null = null

  private client: SmsClient | null = null

  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  /** null until the device answered the inquiry; then whether its firmware has smSysex. */
  readonly firmwareOk = $derived.by(() => {
    if (this.identity === null) return null
    try {
      return supports(parseVersion(`c${this.identity}`), 'smSysex')
    } catch {
      return null
    }
  })

  /**
   * The panel is one browser with two intents, chosen by which top-bar
   * button opened it: in `open` mode clicking a file loads it; in `save`
   * mode clicking a file picks it as the save target (name filled,
   * overwrite armed) — the two gestures a mixed-mode panel confused.
   */
  mode = $state<'open' | 'save'>('open')
  /** Open-mode discard guard: the file whose first click is awaiting a confirming second. */
  armedLoad = $state<string | null>(null)

  openPanel(mode: 'open' | 'save'): void {
    if (this.open && this.mode === mode) {
      this.open = false // the active mode's button doubles as its close
      return
    }
    this.mode = mode
    this.armedLoad = null
    this.armed = null
    this.open = true
    if (this.status === 'idle') void this.connect()
  }

  close(): void {
    this.open = false
  }

  async connect(): Promise<void> {
    if (!this.supported) {
      this.status = 'error'
      this.error = 'Web MIDI is not available here — use Chrome or Edge.'
      return
    }
    this.status = 'connecting'
    this.error = null
    this.otherEditor = false
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true })
      const output = pickPort([...access.outputs.values()])
      const input = pickPort([...access.inputs.values()])
      if (!output || !input) {
        const seen = [...access.outputs.values()].map((o) => o.name).filter(Boolean)
        throw new Error(
          `no Deluge MIDI port found${seen.length ? ` (saw: ${seen.join(', ')})` : ''} — connect the Deluge over USB`,
        )
      }
      this.portName = output.name ?? 'Deluge'
      // One debug line per request makes slow links diagnosable from the
      // console: filter on [sysex] and read the ms and attempt counts.
      // Always on in dev; on the deployed site it is opt-in, so a user can
      // still capture a trace without a rebuild:  localStorage.debug = 'sysex'
      const client = new SmsClient((bytes) => output.send(bytes), {
        onOtherClient: () => (this.otherEditor = true),
        ...(sysexDebugWanted() ? { debug: (line: string) => console.debug('[sysex]', line) } : {}),
      })
      input.onmidimessage = (e) => {
        const data = e.data
        if (!data) return
        const id = parseIdentityReply(data)
        if (id) {
          this.identity = `${id.major}.${id.minor}.${id.patch}`
          // Official firmware discards all incoming SysEx (synthstrom-official
          // src/midiengine.cpp:531), so a Deluge that answers the inquiry runs
          // community firmware: lineage `c`.
          editor.setDeviceFirmware(`c${this.identity}`)
          return
        }
        client.receive(data)
      }
      this.client = client
      access.onstatechange = (e) => {
        const port = (e as MIDIConnectionEvent).port
        if (!port || port.state !== 'disconnected') return
        if (port.id !== input.id && port.id !== output.id) return
        if (this.status !== 'connected' && this.status !== 'connecting') return
        this.client = null
        this.busy = null
        this.status = 'error'
        this.error = 'Deluge disconnected — reconnect over USB and retry.'
      }
      output.send(IDENTITY_REQUEST)
      await client.ping()
      this.status = 'connected'
      this.path = editor.preset?.tag === 'kit' ? '/KITS' : '/SYNTHS'
      this.saveName = editor.fileName || ''
      await this.refresh()
    } catch (e) {
      this.status = 'error'
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  async refresh(): Promise<void> {
    await this.run('Reading directory', () => this.list())
  }

  async enter(name: string): Promise<void> {
    this.path = this.path === '/' ? `/${name}` : `${this.path}/${name}`
    this.armedLoad = null
    this.armed = null
    await this.refresh()
  }

  async up(): Promise<void> {
    if (this.path === '/') return
    const cut = this.path.lastIndexOf('/')
    this.path = cut === 0 ? '/' : this.path.slice(0, cut)
    this.armedLoad = null
    this.armed = null
    await this.refresh()
  }

  async loadFile(name: string): Promise<void> {
    // A click must not silently discard unsaved edits: the first click arms
    // the row, the second loads — the same idiom as Save's Overwrite?.
    if (editor.preset && editor.changeCount > 0 && this.armedLoad !== name) {
      this.armedLoad = name
      return
    }
    this.armedLoad = null
    await this.run(`Reading ${name}`, async () => {
      const data = await this.client!.readFile(this.join(name), (d, t) => (this.progress = t ? d / t : 0))
      editor.load(new TextDecoder().decode(data), name)
      this.saveName = name
      if (!editor.error) this.open = false
    })
  }

  /** Save mode's file click: this row is the target — name filled, overwrite armed. */
  pickSaveTarget(name: string): void {
    this.saveName = name
    this.armed = this.join(name)
    this.saved = null
    this.error = null
  }

  async save(): Promise<void> {
    let name = this.saveName.trim()
    if (!name || !this.client || !editor.preset) return
    // A name without the extension would write fine but be invisible on the
    // instrument — the Deluge's preset browser lists only .XML files.
    if (!/\.xml$/i.test(name)) {
      name = `${name}.XML`
      this.saveName = name
    }
    const path = this.join(name)
    const exists = this.entries.some((e) => !isDirectory(e) && e.name.toUpperCase() === name.toUpperCase())
    if (exists && this.armed !== path) {
      this.armed = path // first click on an existing name arms; the second overwrites
      return
    }
    this.armed = null
    await this.run(`Writing ${name}`, async () => {
      // A kit's samples travel with it: retarget them to the saved folder
      // path first (the XML written below carries the new references), then
      // copy any the card is missing. Every write is still verified by
      // read-back; the message just doesn't dwell on it.
      if (editor.preset?.tag === 'kit') this.kitRetarget?.(path)
      await this.client!.writeFile(path, new TextEncoder().encode(editor.output), (d, t) => (this.progress = d / t))
      let copied = 0
      if (editor.preset?.tag === 'kit' && this.kitSampleSync) {
        copied = await this.kitSampleSync((label, p) => {
          if (label) this.busy = label
          this.progress = p
        })
      }
      const written = copied ? `${name} and ${copied} sample${copied === 1 ? '' : 's'} written` : `${name} written`
      // The read-back proves the card holds what we sent — but only as of
      // now. With another editor on the same Deluge, its next `open` for
      // write truncates whatever it names, so a verified save is not a
      // durable one (issue #8).
      this.saved = this.otherEditor ? `${written} — another editor is also on this Deluge and could overwrite it` : written
      // The verified card copy is the new clean baseline: the Changes dock
      // reads 0 against the file just written, and open mode's discard
      // guard won't arm over work that is already safe.
      editor.source = editor.output
      editor.fileName = name
      await this.list()
    })
  }

  private join(name: string): string {
    return this.path === '/' ? `/${name}` : `${this.path}/${name}`
  }

  // ---- sample access for the kit builder (src/ui/state/kit.svelte.ts) -----
  // The kit builder browses SAMPLES/ and pushes sample files with the same
  // client the preset panel uses; these wrappers keep the client private and
  // the connection checks in one place.

  get connected(): boolean {
    return this.status === 'connected' && this.client !== null
  }

  private need(): SmsClient {
    if (!this.client) throw new Error('not connected to a Deluge — click Connect first')
    return this.client
  }

  /** List a directory without touching the preset panel's path or entries. */
  async listPath(path: string): Promise<DirEntry[]> {
    return (await this.need().listDirectory(path))
      .filter((e) => !e.name.startsWith('.'))
      .toSorted((a, b) => Number(isDirectory(b)) - Number(isDirectory(a)) || a.name.localeCompare(b.name))
  }

  /** A WAV's frame count etc. read from just its header bytes on the card. */
  async wavInfo(path: string): Promise<WavInfo> {
    const handle = await this.need().openRead(path)
    try {
      return await readWavInfo((offset, length) => handle.read(offset, length))
    } finally {
      await handle.close()
    }
  }

  /**
   * Write one sample file. Samples get the sampled verify — size plus spot
   * ranges — because the full re-read costs ~40% of a multi-megabyte push;
   * preset XML keeps the byte-for-byte verify (save() above).
   */
  async writeSampleFile(path: string, data: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.need().writeFile(path, data, onProgress, 'sampled')
  }

  /** Read a whole sample file off the card (audio preview). */
  async readSampleFile(path: string, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    return this.need().readFile(path, onProgress)
  }

  /**
   * The listing without `saved`/`busy` bookkeeping (refresh() adds that).
   * Hidden entries are dropped here, at the store: the card is FAT32 and a
   * Mac writes its droppings straight to it — `._*` AppleDouble sidecars
   * (binary, yet ending in `.XML`), `.DS_Store`, `.Spotlight-V100` — none of
   * which are presets. `listDirectory()` stays an honest transport, and the
   * save-overwrite check above rightly no longer "sees" `._NAME.XML`.
   */
  private async list(): Promise<void> {
    this.entries = (await this.client!.listDirectory(this.path))
      .filter((e) => !e.name.startsWith('.'))
      .toSorted((a, b) => Number(isDirectory(b)) - Number(isDirectory(a)) || a.name.localeCompare(b.name))
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.progress = 0
    this.saved = null
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

export const card = new Card()
