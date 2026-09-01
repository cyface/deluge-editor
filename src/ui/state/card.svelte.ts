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
  /**
   * The last verified save, in words. A save closes the panel, so this line is
   * shown by the page rather than by the panel that earned it (`App.svelte`)
   * and takes itself away again — a confirmation is worth reading once, not
   * for the rest of the session.
   */
  saved = $state<string | null>(null)
  private savedTimer: ReturnType<typeof setTimeout> | null = null
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
   * Registered by the sample stash (src/ui/state/samples.svelte.ts): writes every
   * locally held sample the current preset references that the card is
   * missing, reporting progress; resolves to how many were written. Saving a
   * preset without its samples would leave silent rows on the instrument.
   */
  sampleSync: ((onStatus: (label: string, progress: number) => void) => Promise<number>) | null = null

  /**
   * Registered by the sample stash: before a save, move the preset's locally
   * sourced samples (and the references to them) under the folder matching
   * the save path, so the card's layout follows the preset.
   */
  sampleRetarget: ((savePath: string) => void) | null = null

  private client: SmsClient | null = null
  /** The in-flight `ensureConnected` attempt, so simultaneous askers share it. */
  private connecting: Promise<void> | null = null

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
   * The dialog is one browser with two intents, chosen by which top-bar
   * button opened it: in `open` mode clicking a file loads it; in `save`
   * mode clicking a file picks it as the save target (name filled,
   * overwrite armed) — the two gestures a mixed-mode panel confused.
   */
  mode = $state<'open' | 'save'>('open')
  /** Open-mode discard guard: the file whose first click is awaiting a confirming second. */
  armedLoad = $state<string | null>(null)

  /**
   * Open the browser in one intent or the other. The button that opened it
   * used to double as its close; it is a modal now, so the button is behind
   * the veil and the × and Escape do that instead.
   */
  openPanel(mode: 'open' | 'save'): void {
    this.mode = mode
    this.armedLoad = null
    this.armed = null
    this.open = true
    if (this.status === 'idle') void this.connect()
  }

  close(): void {
    this.open = false
  }

  /** How long the save confirmation stays on the page. */
  private static readonly SAVED_FOR = 8000

  private announce(message: string): void {
    this.clearSaved()
    this.saved = message
    this.savedTimer = setTimeout(() => {
      this.saved = null
      this.savedTimer = null
    }, Card.SAVED_FOR)
  }

  /** Take the confirmation down now — any new card work supersedes it. */
  private clearSaved(): void {
    if (this.savedTimer !== null) clearTimeout(this.savedTimer)
    this.savedTimer = null
    this.saved = null
  }

  /**
   * Connect for a gesture that needs the card but didn't come from the top
   * bar — the sample browsers' "From Card…", which would otherwise sit
   * disabled until the user knew to open the preset panel first. Returns
   * whether the card is usable; the reason it isn't is in `error`. Two
   * panels asking at once share the one attempt.
   */
  async ensureConnected(): Promise<boolean> {
    if (this.connected) return true
    this.connecting ??= this.connect().finally(() => (this.connecting = null))
    await this.connecting
    return this.connected
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
    this.clearSaved()
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
      // Locally sourced samples travel with the preset: retarget them to the
      // saved folder path first, so the XML below carries the new references,
      // then copy any the card is missing — samples first, preset second. The
      // Deluge loads a preset whose samples are absent without complaining
      // and plays it silently (`Source::loadAllSamples` ignores the per-range
      // error, `processing/source.cpp:105`), so the preset must never be the
      // thing that lands first. Every write is still verified by read-back;
      // the message just doesn't dwell on it.
      this.sampleRetarget?.(path)
      let copied = 0
      if (this.sampleSync) {
        copied = await this.sampleSync((label, p) => {
          if (label) this.busy = label
          this.progress = p
        })
      }
      this.busy = `Writing ${name}`
      this.progress = 0
      await this.client!.writeFile(path, new TextEncoder().encode(editor.output), (d, t) => (this.progress = d / t))
      const written = copied ? `${name} and ${copied} sample${copied === 1 ? '' : 's'} written` : `${name} written`
      // The read-back proves the card holds what we sent — but only as of
      // now. With another editor on the same Deluge, its next `open` for
      // write truncates whatever it names, so a verified save is not a
      // durable one (issue #8).
      this.announce(this.otherEditor ? `${written} — another editor is also on this Deluge and could overwrite it` : written)
      // The verified card copy is the new clean baseline: the Changes dock
      // reads 0 against the file just written, and open mode's discard
      // guard won't arm over work that is already safe.
      editor.source = editor.output
      editor.fileName = name
      await this.list()
      // The file is written and verified: the browser has done its job and
      // gets out of the way, as loading one does. The confirmation outlives
      // it on the page.
      this.open = false
    })
  }

  private join(name: string): string {
    return this.path === '/' ? `/${name}` : `${this.path}/${name}`
  }

  // ---- sample access for the builders (kit.svelte.ts, multisample.svelte.ts) ----
  // The builders browse SAMPLES/ and push sample files with the same
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

  /**
   * A WAV's frame count etc. read from just its header bytes on the card.
   * `tags` walks on past the audio for the root note and loop points, which
   * costs a few more ranged reads — the multi-sample import wants them, the
   * kit builder doesn't.
   */
  async wavInfo(path: string, opts?: { tags?: boolean }): Promise<WavInfo> {
    const handle = await this.need().openRead(path)
    try {
      return await readWavInfo((offset, length) => handle.read(offset, length), opts)
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
    this.clearSaved()
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
