/**
 * Live Edit: the Deluge's in-RAM instrument as the document (`docs/live-edit.md`).
 *
 * On entry the store asks the device what it holds, pulls that preset through
 * `/TEMP/LIVE.XML`, loads it into the editor with the card's copy of the file
 * as `source`, and subscribes to the device's own changes. From then on the
 * device's state is the truth and the editor is a view of it:
 *
 * - **Editor → device.** Change detection is the Follow pattern — it reads
 *   values, it does not hook controls. `editor.flatOutput` is diffed against
 *   a baseline (the document as the device holds it) on every change. A
 *   changed path that `classifyPath` can address goes out as a `param`,
 *   coalesced to the latest value per path so a knob drag streams without
 *   flooding; anything else (an enum, a cable added, a row) marks the whole
 *   document for a push, debounced so a burst of clicks is one push and a
 *   push in flight queues the next. Fast sends are held while a whole push
 *   is pending: the push carries the latest document anyway, and a row
 *   index the device does not have yet would land on the wrong row.
 * - **Device → editor.** `^chg` writes through the ordered accessors
 *   (`applyChange`), so an attribute the file lacked lands where the firmware
 *   writes it. Our own writes coming back are filtered by (path, value) for
 *   one second, as Follow filters CC echoes; a value that arrived from the
 *   device is written into the baseline too, so it is not re-sent. `^dirty`
 *   pulls the preset and, when it differs from the tree, adopts the pulled
 *   bytes whole (`docs/decisions/live.md`). `^inst` with a different name or
 *   folder re-opens; a different `drum` selects the row; `edited` going to
 *   0 is the device's own Save → Synth/Kit, and the file it wrote is read
 *   back silently as the new `source`; a clip that is not a synth or kit
 *   parks the mode until one comes back.
 * - **The row.** A row picked in the editor is `select`ed on the device too,
 *   so the gold knobs, the pads and MIDI Follow follow, and a row picked on
 *   the pads selects here. The device's report of its row is not taken while
 *   a pick of ours is on its way, and a whole-document load resets the
 *   device's row, so the editor's is re-asserted after every push.
 * - **The lease.** `sub` latches this cable for `LEASE_SECS`; the store
 *   renews every `RENEW_MS`, so an unplugged editor stops costing the device
 *   anything within seconds. A renewal that fails is reported and retried on
 *   the next tick; the mode does not leave on its own.
 * - **Save** is the device's own, the way Save → Synth is: whatever is still
 *   on its way to the device goes first, then `save` writes the instrument
 *   over its file, and the file is read back and diffed against the document
 *   the device was holding. The card store's save paths hand the write here
 *   through `card.liveSave` while the mode holds a preset (`save`).
 *
 * The top bar's Live button (`TopBar.svelte`) toggles the mode and
 * `LiveHeader.svelte` shows it; this file is the mode.
 */

import { untrack } from 'svelte'
import { applyChange, changePath, classifyPath, LiveTransfer, presetIdentity } from '../../core/live'
import { hexToInt, intToHex, isHexParam } from '../../core/params/hex'
import {
  LiveError,
  SmsClient,
  SysexError,
  type LiveAddress,
  type LiveChange,
  type LiveInstrument,
  type LivePush,
} from '../../core/sysex'
import { diffFlat, flattenXML, isClean, parseXML, type FlatXML } from '../../core/xml'
import { errorText } from '../errtext'
import { Activity } from './activity.svelte'
import { card } from './card.svelte'
import { editor } from './editor.svelte'

/** How long a lease is asked for, seconds; the firmware caps at 120. */
export const LEASE_SECS = 10
/** How often it is renewed, ms — well inside the lease, so one lost renewal does not lapse it. */
export const RENEW_MS = 4000
/** A structural edit waits this long for the next one before the document goes, ms. */
export const PUSH_DEBOUNCE_MS = 150
/** A push the device refused (`busy`: a menu is open) is retried after this, ms. */
export const PUSH_RETRY_MS = 2000
/** Our own value coming back within this window is an echo, not a move. `midiFollowFeedbackFilter`'s one second. */
const ECHO_FOR = 1000

/** FatFS results that mean the file simply is not there (`src/core/sysex/fatfs.ts`). */
const FR_NO_FILE = 4
const FR_NO_PATH = 5

export type LiveStatus =
  /** Not in the mode. */
  | 'off'
  /** Connecting, pulling, subscribing. */
  | 'starting'
  /** Subscribed and tracking the device's instrument. */
  | 'live'
  /** Subscribed, but the device's current clip is not a synth or kit; the editor keeps what it had. */
  | 'waiting'
  /** The lease or the connection failed; `linkError` says how. */
  | 'error'

/** The device's instrument the editor is a view of: what `load {as}` and `save` name. */
interface Identity {
  name: string
  dir: string
}

/** Why a synth or kit could not be opened from what the device reported. */
const NO_IDENTITY = 'The Deluge did not say which preset its clip holds'

/** Why the mode cannot start on this connection. */
export const NO_LIVE_EDIT =
  'This Deluge does not offer Live Edit — switch on Sysex Live Edit in its community features, or update its firmware'

/** What a save through the device came to: the device kept the file it has, or wrote and this many entries of the read-back disagree with the document. */
export type LiveSaveResult = 'exists' | { path: string; differences: number }

/** How many times `save` pushes before giving up on a device that keeps refusing the document. */
const FLUSH_TRIES = 3

class Live extends Activity {
  /** The mode is on: the store tracks the device and the page shows it. */
  on = $state(false)
  status = $state<LiveStatus>('off')
  /** Why the link is down while `status` is `'error'`. Job failures (a refused push) are in `error`. */
  linkError = $state<string | null>(null)
  /** What the device last said is current: the sub reply, the last `^inst`, the last save or load. */
  inst = $state.raw<LiveInstrument | null>(null)
  /** The lease the device granted, seconds; 0 when none holds. */
  lease = $state(0)
  /** Device moves applied to the tree since the mode was switched on. */
  received = $state(0)
  /** `param` writes sent. */
  sent = $state(0)
  /** Whole-document pushes made. */
  pushed = $state(0)
  /** Whole-document pulls that replaced the tree. */
  resynced = $state(0)

  /** Whether the connected Deluge's grant offers the mode at all. Null until a connection has been negotiated. */
  readonly available = $derived(card.liveVersion !== null)
  /**
   * Whether the top bar shows the button. Firmware-gated like every control
   * (`FEATURES.liveEdit`): a loaded file that predates the ops has no button.
   * With nothing loaded it is offered, as Follow is — the mode needs no file
   * first, it brings the device's. The gate that matters is the grant,
   * `available`, which is only known once connected: the button connects,
   * and a Deluge whose grant lacks `live` refuses the mode with `NO_LIVE_EDIT`.
   */
  readonly offered = $derived(editor.supports('liveEdit') || editor.preset === null)
  /** The connected Deluge has answered and its grant lacks `live`: the button is disabled and says why. */
  readonly refused = $derived(card.status === 'connected' && card.liveVersion === null)
  /** The mode holds a preset: the document is the device's, and a save is the device's own write. */
  readonly active = $derived(this.on && this.status === 'live')

  private client: SmsClient | null = null
  /** A client handed in by a test, used instead of the card store's connection. */
  private injected: SmsClient | null = null
  private transfer: LiveTransfer | null = null
  private identity: Identity | null = null
  /** The document as the device holds it, flattened; null while nothing is being tracked. */
  private baseline: FlatXML | null = null
  /** The device's `gen` as of the last whole-document exchange (pull or push): a `^dirty` at or below it is stale. */
  private docGen = 0
  /** The highest `gen` seen from any reply or push. */
  private gen = 0

  /** Fast-path writes waiting to go, the latest value per path. */
  private readonly pending = new Map<string, { address: LiveAddress; value: number }>()
  private draining: Promise<void> | null = null
  /**
   * The values sent per path in the last second, and when — the echo filter.
   * Every recent value, not just the last: a knob drag sends A then B, and a
   * late echo of A must not read as the device moving back to A.
   */
  private readonly echo = new Map<string, { value: number; at: number }[]>()

  private pushWanted = false
  private pushing = false
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private resyncWanted = false
  /** A save of ours is between its request and its `markSaved`: the device's `edited: 0` is that save, not one of its own. */
  private saving = false
  /** The row the device and the editor last agreed on; an offer of the same row is not a pick. */
  private rowAgreed: number | null = null
  /** A row the editor picked that the device has not been told of yet. */
  private rowWanted: number | null = null
  private selecting: Promise<void> | null = null
  /** Whole-document work runs one job at a time: open, push, resync never interleave. */
  private chain: Promise<unknown> = Promise.resolve()

  private renewTimer: ReturnType<typeof setInterval> | null = null
  private renewing: Promise<void> | null = null

  /** True while edits flow both ways: an instrument is open and the baseline is set. */
  private get tracking(): boolean {
    return this.on && this.baseline !== null && this.identity !== null && this.client !== null
  }

  async toggle(): Promise<void> {
    if (this.on) await this.stop()
    else await this.start()
  }

  /** Enter the mode: connect, subscribe, open what the device holds. */
  async start(): Promise<void> {
    if (this.on) {
      if (this.status !== 'error') return
      this.teardown() // a link that failed: start over from the connection
    }
    this.on = true
    this.status = 'starting'
    this.linkError = null
    this.resetCounters()
    const ok = await this.serial(() =>
      this.run('Opening the Deluge’s sound', async () => {
        const client = await this.connect()
        this.client = client
        this.transfer = new LiveTransfer(client)
        const sub = await client.subscribe(LEASE_SECS)
        this.lease = sub.secs
        await this.openNow(sub)
        this.renewTimer ??= setInterval(() => void this.renew(), RENEW_MS)
        card.liveSave = (path, overwrite) => this.save({ path, overwrite })
      }),
    )
    if (!ok) {
      // The mode did not come up; `error` has the sentence. Leave the way we came.
      const why = this.error
      await this.stop()
      this.error = why
    }
  }

  /** Leave the mode. The editor keeps the preset as an ordinary loaded file with its card path. */
  async stop(): Promise<void> {
    const client = this.client
    this.teardown()
    if (client && this.lease > 0) {
      try {
        await client.subscribe(0)
      } catch {
        // Releasing early is a courtesy; the lease lapses on its own within LEASE_SECS.
      }
    }
    this.lease = 0
  }

  /** Use this client instead of the card store's connection. Tests only; pushes must reach `receive`. */
  attachTo(client: SmsClient | null): void {
    this.injected = client
  }

  /** A device-initiated message arrived (`SmsClientOptions.onPush`). */
  receive(push: LivePush): void {
    if (!this.on) return
    switch (push.kind) {
      case 'inst':
        this.handleInst(push.inst)
        return
      case 'chg':
        this.gen = Math.max(this.gen, push.gen)
        this.applyChanges(push.changes)
        return
      case 'dirty':
        this.gen = Math.max(this.gen, push.gen)
        if (push.gen > this.docGen) this.resync()
        return
    }
  }

  /**
   * The editor's document changed (`editor.flatOutput`, offered by the effect
   * below). Anything that differs from the baseline is an editor move: fast
   * paths are queued as `param`s, everything else marks the document for a
   * push. The baseline adopts the new document at once, so a knob turned
   * while a push is pending is still one path's diff and not the whole file
   * again.
   */
  offer(flat: FlatXML | null): void {
    if (!this.tracking || flat === null) return
    const baseline = this.baseline!
    let whole = false
    for (const [path, value] of flat) {
      if (baseline.get(path) === value) continue
      const address = classifyPath(path, flat)
      if (address && isHexParam(value)) this.pending.set(path, { address, value: hexToInt(value) })
      else whole = true
    }
    if (!whole) for (const path of baseline.keys()) if (!flat.has(path)) whole = true
    this.baseline = new Map(flat)
    if (whole) this.schedulePush()
    else this.drain()
  }

  /**
   * The editor's row changed (`editor.row`, offered by the effect below):
   * select it on the device too. Held while a push is pending, as the fast
   * writes are, since the row may not exist on the device yet; the latest
   * pick wins. Not a pick when it is the row the device just reported.
   */
  selectRow(row: number): void {
    if (!this.tracking || this.inst?.type !== 'kit' || row === this.rowAgreed) return
    this.rowWanted = row
    this.syncRow()
  }

  /**
   * Save through the device: it writes its instrument over `path` (its own
   * file when omitted) exactly as Save → Synth/Kit does, and the editor is
   * marked saved against the bytes it read back. Runs on the caller's busy
   * line and throws on failure — the card store's save paths call it through
   * `card.liveSave`, so the failure reads where every save's does.
   *
   * Order: anything still on its way to the device goes first (a pending
   * push, the queued fast writes), so the file holds every edit made here;
   * then `save`; then the file is read back and diffed against the document
   * the device was holding. Zero differences is the round-trip bar, met by
   * the device itself; the caller shows anything else, because it means the
   * editor and the firmware disagree about the file and that is worth seeing.
   * A save to another path renames the device's instrument, as the device's
   * own save-as does, and the store follows the new identity; the file it
   * came from is left as it was.
   */
  async save(opts: { path?: string; overwrite?: boolean } = {}): Promise<LiveSaveResult> {
    return this.serial(async () => {
      if (!this.tracking) throw new Error('Live Edit is not holding a preset to save')
      const client = this.client!
      const target = opts.path ?? `/${this.identity!.dir}/${this.identity!.name}.XML`
      const as = presetIdentity(target)
      if (!as) throw new Error(`${target} is not a preset path`)
      await this.flush()
      const held = this.baseline!
      // The device names its instrument after the file it saves to, and its
      // `^inst` saying so can land before the reply is handled; the identity
      // is taken now so that push reads as the same preset, not a switch.
      const was = this.identity!
      this.identity = as
      this.saving = true
      try {
        let saved
        try {
          saved = await client.save({ path: target, overwrite: opts.overwrite })
        } catch (e) {
          this.identity = was
          if (e instanceof LiveError && e.why === 'exists') return 'exists'
          throw e
        }
        this.noteGen(saved)
        this.inst = saved
        const written = await this.readSource(client, saved.path || target)
        if (written === null) throw new Error(`The Deluge said it wrote ${target}, but the card has no such file`)
        const diff = diffFlat(flattenXML(written), held)
        const differences = diff.changed.length + diff.added.length + diff.missing.length
        editor.markSaved(saved.path || target, `${as.name}.XML`, written)
        return { path: saved.path || target, differences }
      } finally {
        this.saving = false
      }
    })
  }

  /** Resolves once nothing is in flight: no push, no pull, no fast writes. Tests wait on it. */
  async idle(): Promise<void> {
    for (;;) {
      await this.chain
      await this.draining
      await this.renewing
      await this.selecting
      if (
        this.draining === null &&
        this.renewing === null &&
        this.selecting === null &&
        !this.pushing &&
        this.pushTimer === null
      )
        return
      if (this.pushTimer !== null) await new Promise((r) => setTimeout(r, 0))
    }
  }

  // ---- entering ------------------------------------------------------------

  private async connect(): Promise<SmsClient> {
    if (this.injected) {
      await this.injected.ping()
      if (this.injected.live === null) throw new Error(NO_LIVE_EDIT)
      return this.injected
    }
    await card.require()
    if (card.liveVersion === null) throw new Error(NO_LIVE_EDIT)
    card.onPush = (push) => this.receive(push)
    return card.liveClient()
  }

  /**
   * Make the device's instrument the editor's document. Runs inside a job;
   * the caller owns the busy line. A clip that is not a synth or kit parks
   * the mode instead: the editor keeps what it had and nothing is tracked.
   */
  private async openNow(inst: LiveInstrument): Promise<void> {
    this.noteGen(inst)
    this.inst = inst
    if (inst.type !== 'synth' && inst.type !== 'kit') {
      this.park()
      return
    }
    if (inst.name === undefined || inst.dir === undefined) throw new Error(NO_IDENTITY)
    const client = this.client!
    const { xml, inst: saved } = await this.transfer!.pull()
    const name = `${inst.name}.XML`
    const path = `/${inst.dir}/${name}`
    editor.load(xml, name)
    if (editor.error) throw new Error(editor.error)
    editor.cardPath = path
    editor.source = await this.readSource(client, path)
    if (inst.type === 'kit' && inst.drum !== undefined && inst.drum >= 0) editor.row = inst.drum
    this.rowAgreed = editor.row
    this.rowWanted = null
    this.identity = { name: inst.name, dir: inst.dir }
    this.baseline = flattenXML(xml)
    this.pending.clear()
    this.pushWanted = false
    this.docGen = saved.gen
    this.noteGen(saved)
    this.inst = { ...inst, ...saved }
    this.status = 'live'
    // An edit that landed between the pull and here is in `gen` but not in the tree.
    if (this.gen > this.docGen) this.resync()
  }

  /**
   * The card's copy of the preset, for the Changes dock: `source` is the file,
   * the tree is the device, the diff is what Save would change. A preset the
   * device has never saved has no file, and then there is nothing to diff
   * against rather than a pretence that the device's bytes are on the card.
   */
  private async readSource(client: SmsClient, path: string): Promise<string | null> {
    try {
      return new TextDecoder().decode(await client.readFile(path))
    } catch (e) {
      if (e instanceof SysexError && (e.code === FR_NO_FILE || e.code === FR_NO_PATH)) return null
      throw e
    }
  }

  /** Stop tracking without leaving: the device's clip is not a synth or kit. */
  private park(): void {
    this.identity = null
    this.baseline = null
    this.pending.clear()
    this.pushWanted = false
    this.rowWanted = null
    this.rowAgreed = null
    this.clearPushTimer()
    this.status = 'waiting'
  }

  // ---- device → editor -------------------------------------------------------

  /**
   * Instrument fields from a push or a reply: a different preset re-opens,
   * a different row selects, `edited` dropping to 0 is the device's own save.
   * The row is not taken while a pick of ours is on its way or a push is in
   * flight: the report describes the row the device had before it followed.
   */
  private handleInst(inst: LiveInstrument): void {
    const was = this.inst
    this.noteGen(inst)
    this.inst = inst
    const isInstrument = inst.type === 'synth' || inst.type === 'kit'
    const sameIdentity = this.identity !== null && inst.name === this.identity.name && inst.dir === this.identity.dir
    if (!isInstrument) {
      if (this.identity !== null || this.status === 'live') this.park()
      return
    }
    if (!sameIdentity) {
      void this.serial(() => this.run('Opening the Deluge’s sound', () => this.openNow(inst)))
      return
    }
    if (was?.edited === true && inst.edited === false && !this.saving) this.adoptDeviceSave()
    if (inst.type !== 'kit' || inst.drum === undefined || inst.drum < 0) return
    if (this.pushing || this.rowWanted !== null || this.selecting !== null) return
    this.rowAgreed = inst.drum
    if (inst.drum !== editor.row) editor.row = inst.drum
  }

  /**
   * The device saved its instrument itself (Save → Synth/Kit on the panel):
   * the file it wrote is the card's copy now, so it is read back as `source`.
   * Silent, since nothing here changed: the tree is still the device's, and
   * the Changes dock simply empties.
   */
  private adoptDeviceSave(): void {
    void this.serial(async () => {
      if (!this.tracking) return
      const { name, dir } = this.identity!
      const path = `/${dir}/${name}.XML`
      await this.run('Reading the file the Deluge saved', async () => {
        const source = await this.readSource(this.client!, path)
        if (!this.tracking || this.identity!.name !== name || this.identity!.dir !== dir) return
        editor.cardPath = path
        editor.source = source
      })
    })
  }

  /** A `^chg` batch: the device moved these. Our own echoes are dropped; a change we cannot place triggers a pull. */
  private applyChanges(changes: LiveChange[]): void {
    const preset = editor.preset
    if (!this.tracking || !preset) return
    this.pruneEchoes()
    let unplaced = false
    for (const change of changes) {
      const path = changePath(preset, change)
      if (path === null) {
        unplaced = true
        continue
      }
      if (this.echo.get(path)?.some((mine) => mine.value === change.value)) continue
      const hex = intToHex(change.value)
      if (this.baseline!.get(path) === hex) continue
      // The device moved after we did: its value stands, ours is not sent.
      this.pending.delete(path)
      if (applyChange(preset, change) === null) {
        unplaced = true
        continue
      }
      this.baseline!.set(path, hex)
      this.received += 1
    }
    if (unplaced) this.resync()
  }

  /**
   * Pull the device's preset and, when it differs from the tree, adopt it
   * whole. Skipped while a push of ours is pending: the device is about to
   * hold our document, so what it holds now is not worth reading.
   */
  private resync(): void {
    if (this.resyncWanted) return
    this.resyncWanted = true
    void this.serial(async () => {
      this.resyncWanted = false
      if (!this.tracking || this.pushWanted) return
      await this.run('Reading the Deluge’s changes', async () => {
        const { xml, inst } = await this.transfer!.pull()
        this.docGen = inst.gen
        this.noteGen(inst)
        this.inst = inst
        const flat = flattenXML(xml)
        const current = editor.flatOutput
        if (current !== null && isClean(diffFlat(flat, current))) {
          this.baseline = flat
          return
        }
        editor.preset = parseXML(xml)
        this.baseline = flat
        this.pending.clear()
        this.resynced += 1
      })
    })
  }

  // ---- editor → device -------------------------------------------------------

  /** Send the queued fast writes, one at a time, latest value per path. Held while a whole push is pending. */
  private drain(): void {
    if (this.draining !== null || this.pushWanted || this.pushing) return
    if (this.pending.size === 0 || !this.tracking) return
    const send = async (): Promise<void> => {
      while (this.pending.size > 0 && this.tracking && !this.pushWanted && !this.pushing) {
        const [path, { address, value }] = this.pending.entries().next().value!
        this.pending.delete(path)
        const mine = { value, at: Date.now() }
        this.echo.set(path, [...(this.echo.get(path) ?? []), mine])
        try {
          await this.client!.param(address, value)
          this.sent += 1
        } catch (e) {
          // A fast write the device refused — a row it does not have yet,
          // a name it does not know — is carried by the whole document instead.
          this.echo.set(path, (this.echo.get(path) ?? []).filter((e) => e !== mine))
          this.pending.clear()
          this.notice = `${errorText(e)} — sending the whole preset`
          this.schedulePush()
        }
      }
    }
    // `.finally` runs as a microtask, so the field is set before it is cleared
    // even if the loop were to finish without awaiting.
    this.draining = send().finally(() => (this.draining = null))
  }

  private schedulePush(): void {
    this.pushWanted = true
    if (this.pushTimer !== null) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      void this.pushNow()
    }, PUSH_DEBOUNCE_MS)
  }

  private clearPushTimer(): void {
    if (this.pushTimer !== null) clearTimeout(this.pushTimer)
    this.pushTimer = null
  }

  /** Push the current document. Failure keeps it wanted and retries later; the baseline already reads as pushed. */
  private pushNow(): Promise<void> {
    return this.serial(async () => {
      if (!this.pushWanted || !this.tracking) return
      const ok = await this.run('Sending the preset to the Deluge', () => this.pushOnce())
      if (!ok && this.tracking) {
        this.pushTimer ??= setTimeout(() => {
          this.pushTimer = null
          void this.pushNow()
        }, PUSH_RETRY_MS)
        return
      }
      this.drain()
      this.syncRow()
    })
  }

  /** One push of the current document, inside a serial job; a throw leaves it wanted. */
  private async pushOnce(): Promise<void> {
    this.pushWanted = false
    this.pushing = true
    try {
      const inst = await this.transfer!.push(editor.output, this.identity!)
      this.docGen = inst.gen
      this.noteGen(inst)
      this.inst = inst
      this.pushed += 1
      // The load left the device on whatever row it chose; the editor's stands.
      if (inst.type === 'kit') {
        this.rowAgreed = inst.drum ?? null
        this.rowWanted = editor.row
      }
    } catch (e) {
      this.pushWanted = true
      throw e
    } finally {
      this.pushing = false
    }
  }

  /**
   * Make the device hold everything the editor has: the pending push, if
   * any, then the queued fast writes — which can refuse and want a push in
   * turn, so a bounded loop. Inside a serial job. A device that will not
   * take the document (a menu open on it) is an error; the edit stays wanted.
   */
  private async flush(): Promise<void> {
    for (let i = 0; i < FLUSH_TRIES; i++) {
      if (this.pushWanted) {
        this.clearPushTimer()
        try {
          await this.pushOnce()
        } catch (e) {
          throw new Error(`The Deluge has not taken the latest edit: ${errorText(e)}`)
        }
      }
      this.drain()
      this.syncRow()
      await this.draining
      await this.selecting
      if (!this.pushWanted) return
    }
    throw new Error('The Deluge keeps refusing the latest edit')
  }

  /** Tell the device the row the editor picked, latest pick only, one request at a time. Held behind a push. */
  private syncRow(): void {
    if (this.selecting !== null || this.rowWanted === null) return
    if (!this.tracking || this.pushWanted || this.pushing) return
    const row = this.rowWanted
    this.rowWanted = null
    if (row === this.rowAgreed || editor.rows[row] === undefined) return
    const select = async (): Promise<void> => {
      try {
        const inst = await this.client!.select({ drum: row })
        this.rowAgreed = row
        this.noteGen(inst)
        this.inst = inst
      } catch (e) {
        this.notice = `Could not select row ${row + 1} on the Deluge: ${errorText(e)}`
      }
    }
    this.selecting = select().finally(() => {
      this.selecting = null
      this.syncRow()
    })
  }

  // ---- the lease ---------------------------------------------------------------

  /** Renew the lease. A failure is said and the next tick tries again; nothing else stops. */
  renew(): Promise<void> {
    if (this.renewing !== null) return this.renewing
    const client = this.client
    if (!client || !this.on) return Promise.resolve()
    const renew = async (): Promise<void> => {
      try {
        const sub = await client.subscribe(LEASE_SECS)
        this.lease = sub.secs
        if (this.status === 'error') {
          this.linkError = null
          this.status = this.identity ? 'live' : 'waiting'
        }
        this.handleInst(sub)
      } catch (e) {
        this.lease = 0
        this.linkError = e instanceof LiveError ? errorText(e) : `Could not renew the Deluge’s lease: ${errorText(e)}`
        this.status = 'error'
      }
    }
    this.renewing = renew().finally(() => (this.renewing = null))
    return this.renewing
  }

  /** The connection went away under the mode (the card store noticed the unplug). */
  lost(why: string): void {
    if (!this.on) return
    if (this.renewTimer !== null) clearInterval(this.renewTimer)
    this.renewTimer = null
    this.clearPushTimer()
    this.pending.clear()
    this.rowWanted = null
    this.rowAgreed = null
    this.lease = 0
    this.client = null
    this.transfer = null
    this.baseline = null
    this.identity = null
    this.linkError = why
    this.status = 'error'
  }

  // ---- plumbing ------------------------------------------------------------------

  private teardown(): void {
    this.on = false
    this.status = 'off'
    if (this.renewTimer !== null) clearInterval(this.renewTimer)
    this.renewTimer = null
    this.clearPushTimer()
    if (!this.injected && card.onPush !== null) card.onPush = null
    card.liveSave = null
    this.client = null
    this.transfer = null
    this.identity = null
    this.baseline = null
    this.inst = null
    this.pending.clear()
    this.echo.clear()
    this.pushWanted = false
    this.resyncWanted = false
    this.saving = false
    this.rowWanted = null
    this.rowAgreed = null
    this.linkError = null
    this.error = null
    this.notice = null
    this.docGen = 0
    this.gen = 0
    this.resetCounters()
  }

  private resetCounters(): void {
    this.received = 0
    this.sent = 0
    this.pushed = 0
    this.resynced = 0
  }

  private pruneEchoes(): void {
    const cutoff = Date.now() - ECHO_FOR
    for (const [path, sent] of this.echo) {
      const kept = sent.filter((e) => e.at > cutoff)
      if (kept.length === 0) this.echo.delete(path)
      else if (kept.length !== sent.length) this.echo.set(path, kept)
    }
  }

  private noteGen(inst: LiveInstrument): void {
    this.gen = Math.max(this.gen, inst.gen)
  }

  /** Run `fn` after every whole-document job before it. Its rejection is the caller's; the chain goes on. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn)
    this.chain = next.catch(() => undefined)
    return next
  }
}

export const live = new Live()

// Every way a value can change here — a knob, a curve drag, a select, the
// randomiser — ends in `editor.flatOutput`, so one effect on it is the whole
// outgoing side. The offer runs untracked: it writes the baseline and queues
// sends, none of which the effect should depend on. And the mode cannot
// outlive the connection: when the card store loses the port, the lease is
// gone with it.
$effect.root(() => {
  $effect(() => {
    const flat = editor.flatOutput
    untrack(() => live.offer(flat))
  })
  $effect(() => {
    const row = editor.row
    untrack(() => live.selectRow(row))
  })
  $effect(() => {
    if (live.on && live.status !== 'starting' && card.status === 'error') {
      untrack(() => live.lost(card.error ?? 'The Deluge disconnected'))
    }
  })
})
