/**
 * Card access over Web MIDI: connection to the Deluge's SysEx port, the
 * directory being browsed, and load/save. All protocol work happens in
 * `src/core/sysex`; this store only wires it to a MIDI port and to the
 * editor. One instance, like `editor`.
 */

import { untrack } from 'svelte'
import { supports } from '../../core/firmware/features'
import { parseVersion } from '../../core/firmware/version'
import { baseName, compareNatural, joinPath, parentOf, smsFS, type CardFS } from '../../core/library'
import { readWavInfo, type WavInfo } from '../../core/samples/wav'
import {
  DEFAULT_TIMEOUTS,
  IDENTITY_REQUEST,
  isDirectory,
  parseIdentityReply,
  SmsClient,
  type DirEntry,
} from '../../core/sysex'
import { CONNECTING, NEEDS_WEB_MIDI, otherEditorCould, UNREACHABLE } from '../copy'
import { errorText } from '../errtext'
import { Activity } from './activity.svelte'
import { editor } from './editor.svelte'
import { samples } from './samples.svelte'
import { count } from './wavfiles'

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

/** A path as the protocol wants it: one leading slash, no trailing one (`CardFS` contract, `fs.ts`). */
const clean = (path: string): string => path.replace(/\/+$/, '') || '/'

class Card extends Activity {
  open = $state(false)
  status = $state<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  portName = $state('')
  /** Firmware version from the universal device inquiry, e.g. "1.3.0". */
  identity = $state<string | null>(null)
  /** The inquiry went unanswered for as long as a request gets; see `firmwareOk`. */
  identityTimedOut = $state(false)
  path = $state('/SYNTHS')
  entries = $state.raw<DirEntry[]>([])
  saveName = $state('')
  /**
   * The last verified save, in words. A save closes the panel, so this line is
   * shown by the page rather than by the panel that earned it (`App.svelte`)
   * and takes itself away again — a confirmation is worth reading once, not
   * for the rest of the session.
   */
  saved = $state<string | null>(null)
  private savedTimer: ReturnType<typeof setTimeout> | null = null
  /** Path armed for overwrite: the first Save click on an existing name only arms. */
  armed = $state<string | null>(null)

  /**
   * A card transfer some other store is running over this connection — the
   * sample library's move or scan — so the top bar's dot pulses through it
   * whether or not that panel is open. Shown while this store is idle; this
   * store's own job always wins, and the other store clearing its label
   * cannot take a job of ours off the bar.
   */
  private external = $state<string | null>(null)
  override get busy(): string | null {
    return super.busy ?? this.external
  }
  override set busy(label: string | null) {
    super.busy = label
  }
  showTransfer(label: string | null): void {
    this.external = label
  }
  /**
   * Another editor is talking to this Deluge — a second tab, another browser,
   * or any other app (issue #8). Web MIDI is not exclusive, so the client
   * sees the stranger's replies and reports them; all we can do is say so.
   * Sticky for the life of the connection: the hazard is that the other
   * editor writes a file *after* our verified save, so "it went quiet" is no
   * reassurance. Cleared when we reconnect.
   */
  otherEditor = $state(false)

  private client: SmsClient | null = null
  /** The in-flight `ensureConnected` attempt, so simultaneous askers share it. */
  private connecting: Promise<void> | null = null

  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  /**
   * null while the inquiry is unanswered; whether the firmware has smSysex
   * once it answers; `'unknown'` when it has been silent for one request's
   * worth of time, or answered with a version that doesn't parse. The panel
   * says so in the unknown case, because a connected Deluge whose firmware
   * can't be seen must not look like one whose firmware can: the controls
   * then follow the file's version, not the instrument's (see
   * `docs/decisions.md`, "The connected Deluge outranks the file's firmware
   * attribute"). A late answer still wins — this is derived from `identity`.
   */
  readonly firmwareOk = $derived.by((): boolean | 'unknown' | null => {
    if (this.identity === null) return this.identityTimedOut ? 'unknown' : null
    try {
      return supports(parseVersion(`c${this.identity}`), 'smSysex')
    } catch {
      return 'unknown'
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
    // The name offered is the preset's name as of now, not as of the last
    // card operation: the generator names a synth with every roll, and a
    // file opened from disk has a name of its own. An unnamed preset is
    // offered the name its samples suggest, or nothing — and a name that is
    // already on the card only arms on the first click (`save`), so neither
    // is one click from overwriting a file.
    if (mode === 'save') this.saveName = editor.fileName || editor.suggestedFileName
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

  protected override onStart(): void {
    this.clearSaved()
  }

  /** The raw error — FatFS name and all — goes to the trace; the panel gets the sentence (`Activity`). */
  protected override onFail(label: string, e: unknown): void {
    if (sysexDebugWanted()) console.debug('[sysex]', `${label} failed:`, e)
  }

  /**
   * Connect for a gesture that needs the card but didn't come from the top
   * bar — the sample browsers' "From Deluge…", which would otherwise sit
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

  /** `ensureConnected` for a job that cannot go on without the card: connected, or the reason as an error. */
  async require(): Promise<void> {
    if (!(await this.ensureConnected())) throw new Error(this.error ?? UNREACHABLE)
  }

  async connect(): Promise<void> {
    if (!this.supported) {
      this.status = 'error'
      this.error = NEEDS_WEB_MIDI
      return
    }
    this.status = 'connecting'
    this.error = null
    this.otherEditor = false
    this.identityTimedOut = false
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true })
      const output = pickPort([...access.outputs.values()])
      const input = pickPort([...access.inputs.values()])
      if (!output || !input) {
        const seen = [...access.outputs.values()].map((o) => o.name).filter(Boolean)
        throw new Error(
          `No Deluge MIDI port found${seen.length ? ` (saw: ${seen.join(', ')})` : ''} — connect the Deluge over USB`,
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
        this.error = 'Deluge disconnected — reconnect over USB and retry'
      }
      output.send(IDENTITY_REQUEST)
      // The inquiry is one frame with no retry ladder of its own; after one
      // attempt's worth of silence the firmware is unknown and the panel
      // says so, rather than letting the connection look fully read.
      setTimeout(() => {
        if (this.identity === null) this.identityTimedOut = true
      }, DEFAULT_TIMEOUTS[0])
      await client.ping()
      this.status = 'connected'
      this.path = editor.preset?.tag === 'kit' ? '/KITS' : '/SYNTHS'
      this.saveName = editor.fileName || editor.suggestedFileName
      await this.refresh()
    } catch (e) {
      if (sysexDebugWanted()) console.debug('[sysex]', 'connect failed:', e)
      this.status = 'error'
      this.error = errorText(e)
    }
  }

  async refresh(): Promise<void> {
    await this.run(`Reading ${this.path}`, () => this.list())
  }

  async enter(name: string): Promise<void> {
    this.path = joinPath(this.path, name)
    this.armedLoad = null
    this.armed = null
    await this.refresh()
  }

  async up(): Promise<void> {
    if (this.path === '/') return
    this.path = parentOf(this.path)
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
      const data = await this.need().readFile(this.join(name), (d, t) => (this.progress = t ? d / t : 0))
      const path = this.join(name)
      editor.load(new TextDecoder().decode(data), name)
      this.saveName = name
      if (!editor.error) {
        editor.cardPath = path
        this.open = false
      }
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
    if (!name || !this.connected || !editor.preset) return
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
      await this.write(path, name)
      await this.list()
      // The file is written and verified: the browser has done its job and
      // gets out of the way, as loading one does. The confirmation outlives
      // it on the page.
      this.open = false
    })
  }

  /**
   * Write the preset back to where it lives on the card — the file it was
   * opened from, or the last one it was saved as — with no browser and no
   * arming: the item is named Overwrite, and the path is on it. The panel's
   * folder and name follow, so the next Save › To Deluge starts there too.
   * The one way to see a failure with the panel closed is to open it, so a
   * failed write opens it in save mode on that folder with the error showing.
   */
  async overwrite(): Promise<void> {
    const path = editor.cardPath
    if (!path || !editor.preset || this.busy) return
    if (!(await this.ensureConnected())) {
      this.openPanel('save')
      return
    }
    const name = baseName(path)
    this.path = parentOf(path)
    this.saveName = name
    this.armed = null
    await this.run(`Writing ${name}`, async () => {
      await this.write(path, name)
      await this.list()
    })
    if (this.error) {
      const failed = this.error
      this.openPanel('save')
      // A listing needs a connection; after a mid-write unplug the panel's
      // error branch already says what happened.
      if (this.connected) await this.refresh()
      this.error ??= failed
    }
  }

  /** The write itself, shared by the panel's Save and the menu's Overwrite; runs inside `run()`. */
  private async write(path: string, name: string): Promise<void> {
    // Locally sourced samples travel with the preset: retarget them to the
    // saved folder path first, so the XML below carries the new references,
    // then copy any the card is missing — samples first, preset second. The
    // Deluge loads a preset whose samples are absent without complaining
    // and plays it silently (`Source::loadAllSamples` ignores the per-range
    // error, `processing/source.cpp:105`), so the preset must never be the
    // thing that lands first. Every write is still verified by read-back;
    // the message just doesn't dwell on it.
    // The client is taken before the sample copy and the connection checked
    // again after it: a Deluge unplugged mid-copy nulls `this.client` from
    // `onstatechange`, and a bare `this.client!` past that await surfaced
    // as a property-of-null crash instead of a sentence.
    const client = this.need()
    samples.retargetToSavePath(path)
    const copied = await samples.syncMissingToCard(this, (label, p) => this.step(label, p))
    if (!this.connected) throw new Error('The Deluge disconnected during the save')
    this.step(`Writing ${name}`, 0)
    await client.writeFile(path, new TextEncoder().encode(editor.output), (d, t) => (this.progress = d / t))
    const written = copied ? `${name} and ${count(copied, 'sample')} written` : `${name} written`
    // The read-back proves the card holds what we sent — but only as of
    // now. With another editor on the same Deluge, its next `open` for
    // write truncates whatever it names, so a verified save is not a
    // durable one (issue #8).
    this.announce(this.otherEditor ? `${written} — ${otherEditorCould('it')}` : written)
    editor.markSaved(path, name)
  }

  /**
   * The builders' push button (`kit`, `multisample`): copy every locally held
   * sample the preset references that the card is missing, on the caller's
   * own busy line. The click is the gesture, so it connects for it.
   */
  async pushSamples(activity: Activity): Promise<void> {
    if (samples.pushable.length === 0) return
    await activity.run(CONNECTING, async () => {
      await this.require()
      activity.step('Checking the card')
      const n = await samples.syncMissingToCard(this, (label, p) => activity.step(label, p))
      // A push runs for as long as the samples are big; another editor on the
      // same Deluge can truncate any of them the moment it saves (issue #8).
      const risky = this.otherEditor ? ` — ${otherEditorCould('them')}` : ''
      activity.notice = n === 0 ? 'Every sample is already on the card' : `${count(n, 'sample')} written${risky}`
    })
  }

  private join(name: string): string {
    return joinPath(this.path, name)
  }

  // ---- sample access for the builders (kit.svelte.ts, multisample.svelte.ts) ----
  // The builders browse SAMPLES/ and push sample files with the same
  // client the preset panel uses; these wrappers keep the client private and
  // the connection checks in one place.

  get connected(): boolean {
    return this.status === 'connected' && this.client !== null
  }

  /**
   * The client, only while the connection is good. `connect()` has a client
   * before its ping has answered, and a failed ping leaves one behind with
   * `status = 'error'`; a client alone would let every panel keep issuing
   * requests through the whole retry ladder at a Deluge that isn't there.
   */
  private need(): SmsClient {
    if (this.status !== 'connected' || !this.client) throw new Error('Not connected to the Deluge')
    return this.client
  }

  /**
   * List a directory without touching the preset panel's path or entries:
   * folders first, then names in natural order (`compareNatural`, as the
   * sample library sorts), so one folder reads the same in every panel.
   * Hidden entries are dropped here, at the store: the card is FAT32 and a
   * Mac writes its droppings straight to it — `._*` AppleDouble sidecars
   * (binary, yet ending in `.XML`), `.DS_Store`, `.Spotlight-V100` — none of
   * which are presets. `listDirectory()` stays an honest transport, and the
   * save-overwrite check rightly no longer "sees" `._NAME.XML`.
   */
  async listPath(path: string): Promise<DirEntry[]> {
    return (await this.need().listDirectory(clean(path)))
      .filter((e) => !e.name.startsWith('.'))
      .toSorted((a, b) => Number(isDirectory(b)) - Number(isDirectory(a)) || compareNatural(a.name, b.name))
  }

  /**
   * A WAV's frame count etc. read from just its header bytes on the card.
   * `tags` walks on past the audio for the root note and loop points, which
   * costs a few more ranged reads — the multi-sample import wants them, the
   * kit builder doesn't.
   */
  async wavInfo(path: string, opts?: { tags?: boolean }): Promise<WavInfo> {
    const handle = await this.need().openRead(clean(path))
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
    await this.need().writeFile(clean(path), data, onProgress, 'sampled')
  }

  /**
   * The card as a `CardFS`, for the sample library (`state/library.svelte.ts`):
   * the SysEx backend behind the contract in `fs.ts`, with a trailing slash
   * dropped before the protocol sees it, as the reader backend drops it.
   */
  fs(): CardFS {
    const raw = smsFS(this.need())
    return {
      list: (p) => raw.list(clean(p)),
      read: (p, onProgress) => raw.read(clean(p), onProgress),
      reader: (p) => raw.reader(clean(p)),
      write: (p, data, onProgress) => raw.write(clean(p), data, onProgress),
      rename: (from, to) => raw.rename(clean(from), clean(to)),
      remove: (p) => raw.remove(clean(p)),
      mkdir: (p) => raw.mkdir(clean(p)),
    }
  }

  /** Read a whole file off the card — a sample for preview, a `SETTINGS/*.XML`. */
  async readFile(path: string, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    return this.need().readFile(clean(path), onProgress)
  }

  /** The panel's listing: `refresh()` adds the busy line. */
  private async list(): Promise<void> {
    this.entries = await this.listPath(this.path)
  }
}

export const card = new Card()

// The one place the missing-on-card check is kept current: when the
// connection comes or goes, or the preset names a different set of files
// (`samples.fileKey`). A fresh connection drops the listing cache — the card
// may have changed while we weren't looking. The check itself walks the
// tree again, so it runs untracked or every attribute would be a dependency.
$effect.root(() => {
  let wasConnected = false
  $effect(() => {
    const connected = card.status === 'connected'
    void samples.fileKey
    if (connected && !wasConnected) samples.invalidateCardListings()
    wasConnected = connected
    untrack(() => void samples.checkMissing(card))
  })
})
