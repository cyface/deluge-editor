/**
 * A test double of the FIRMWARE side of smSysex, transcribed from
 * `src/deluge/storage/smsysex.cpp` (upstream/main 3f898e95) — not from any
 * other editor. It exists so the client's tests exercise the behaviours that
 * bite in the field:
 *
 * - requests over 1024 bytes are dropped with no reply (`incomingSysexBuffer[1024]`)
 * - a short write replies err=0 with the real count in `size`
 * - `dir` caps at 25 lines per request and pages by `offset`
 * - `^open` on a missing file is a normal reply with a FatFS code
 * - replies are the JsonSerializer's actual shape (newlines, no indents)
 * - the `^session` grant echoes the tag it was asked for, and every client on
 *   the port sees it (`otherSession`/`otherClientReply` play a second editor)
 * - the Live Edit ops (`smsysex_live.cpp` on the fork's
 *   `feature/live-edit-sysex`; `docs/live-edit.md`), when `liveEdit` is set:
 *   an in-RAM instrument whose parameters `param` reads and writes, `save`
 *   that serialises it, `load` that replaces it, `select`, and a `sub` lease
 *   behind which the device pushes `^chg`/`^dirty`/`^inst` on msgId 0
 *
 * Used by unit tests only; nothing in the app imports it.
 */

import { applyChange, changePath, KIT_BUS_SLOTS } from '../live'
import { PATCH_SOURCES } from '../preset/enums'
import {
  PATCHED_GLOBAL_PARAMS,
  PATCHED_LOCAL_PARAMS,
  UNPATCHED_SHARED_PARAMS,
  UNPATCHED_SOUND_PARAMS,
} from '../preset/params'
import { drumRows, isKit } from '../preset/rows'
import type { Preset } from '../preset/types'
import { flattenXML, generateXML, parseXML } from '../xml'
import { CMD_JSON, CMD_JSON_REPLY, DELUGE_ID, SYSEX_END, SYSEX_START } from './frame'
import type { LiveChange, LiveDrumKind, LiveOutputType } from './live'
import { pack8to7, unpack7to8 } from './pack'

export interface FakeOptions {
  /** Drop this many JSON requests before answering (lost-request simulation). */
  dropRequests?: number
  /** Never answer `session` requests (forces the client's fallback range). */
  dropSession?: boolean
  /** Next write commits only this many bytes, err 0 — once. */
  shortWriteOnce?: number
  /**
   * Every write commits at most this many bytes, err 0 — the macOS 752-byte
   * cliff, where the host drops a byte from each frame and no rewrite helps.
   */
  shortWriteAlways?: number
  /** Every `open` fails with this FRESULT. */
  failOpen?: number
  /** Every `dir` fails with this FRESULT (a listing that dies, as opposed to a folder that isn't there). */
  failDir?: number
  /** Corrupt the first byte of every file after it is written (verify must catch it). */
  corruptWrites?: boolean
  /**
   * Queue write replies instead of sending them (the write itself still
   * commits, like a slow card); `releaseWrite()` sends the oldest. Lets a
   * test observe how many requests the client keeps in flight.
   */
  holdWrites?: boolean
  /**
   * Answer `session` without echoing the tag, as a firmware predating the
   * echo would (`assignSession` writes it on upstream `beta`).
   */
  omitSessionTag?: boolean
  /**
   * Before the first real grant, send the grant of another client's session
   * — another tab negotiating at the same moment. It carries that client's
   * tag and a different sid, and lands on msgId 0 like every grant does.
   */
  otherSessionFirst?: boolean
  /**
   * Advertise this in-flight request count as `pipe` in the session grant,
   * as a firmware with the #43 send-ring fix does. Absent means an older
   * firmware whose grant has no such field — the client must stay serial.
   */
  sessionPipe?: number
  /** Like `holdWrites`, for read replies; `releaseRead()` sends the oldest. */
  holdReads?: boolean
  /**
   * The Live Edit ops. `'on'`: the grant carries `live: 1` and the ops work.
   * `'off'`: the firmware has them but the **Sysex Live Edit** toggle is off —
   * the grant lacks `live` and every op answers `why: "off"` (`liveOp`,
   * smsysex.cpp). Absent: a firmware without the ops, which ignores them
   * (no reply, like any unknown command).
   */
  liveEdit?: 'on' | 'off'
  /** Every `load` answers `busy`: a menu or browser is stacked on the device's root view. */
  liveBusy?: boolean
  /**
   * What `save` writes to a preset path, given what it would write: a stand-in
   * for a firmware whose file disagrees with the editor's document, which the
   * editor's read-back after a save is there to catch. The `/TEMP` pull is
   * not touched.
   */
  saveWrites?: (xml: string) => string
}

/**
 * The device's current instrument, as the live ops see it. `preset` is the
 * XML it was loaded from and `overrides` the parameter values set since —
 * `save` serialises the two together, the way `writeToFile` snapshots the
 * `AutoParam`s. `drum` is the selected row's index in the drum list.
 */
export interface FakeInstrument {
  type: LiveOutputType
  name: string
  dir: string
  edited: boolean
  drum: number
  entire: boolean
  gen: number
  preset: string
  overrides: Map<string, number>
}

/** Firmware `Error` values the live ops answer with (`src/definitions_cxx.hpp`). */
const ERR_FILE_ALREADY_EXISTS = 17
const ERR_FILE_NOT_FOUND = 18

/**
 * What `fileStringToParam(Kind::UNPATCHED_SOUND, name, allowPatched=true)` finds: every patched and
 * sound-unpatched name, minus the two patched params no `<defaultParams>` attribute holds. Plain
 * `volume` is `LOCAL_VOLUME`, a real AutoParam that is only ever a cable destination, so `setParam`
 * refuses it as a plain param — which is why the editor sends `volumePostFX` for
 * `<defaultParams volume>` (`docs/decisions/live.md`).
 */
const ATTRIBUTE_LESS = new Set(['volume', 'volumePostReverbSend'])
const SOUND_NAMES: ReadonlySet<string> = new Set<string>(
  [...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS, ...UNPATCHED_SHARED_PARAMS, ...UNPATCHED_SOUND_PARAMS].filter(
    (name) => !ATTRIBUTE_LESS.has(name),
  ),
)
/** `fileStringToParam(Kind::UNPATCHED_GLOBAL, name, allowPatched=false)`: the bus table's own spellings. */
const BUS_NAMES: ReadonlySet<string> = new Set(Object.keys(KIT_BUS_SLOTS))
const CABLE_DESTINATIONS: ReadonlySet<string> = new Set<string>([...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS])

/** `/SYNTHS/Sub/Foo.XML` → dir `SYNTHS/Sub`, name `Foo`; null when there is no folder or no `.XML` (`splitPresetPath`). */
function splitPresetPath(path: string): { dir: string; name: string } | null {
  if (!path.startsWith('/') || !path.endsWith('.XML')) return null
  const cut = path.lastIndexOf('/')
  if (cut <= 0) return null
  return { dir: path.slice(1, cut), name: path.slice(cut + 1, -4) }
}

/** The tag the second client in `otherSessionFirst` asked for. */
export const OTHER_CLIENT_TAG = 'deluge-editor-beef'

interface OpenFile {
  path: string
  write: boolean
}

const enc = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))

const parentOf = (path: string): string => {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

export class FakeDeluge {
  files = new Map<string, Uint8Array>()
  dirs = new Set<string>(['/', '/SYNTHS', '/KITS'])
  /** Every JSON request seen, for assertions. */
  requests: Array<Record<string, unknown>> = []
  /** The msgId of every request seen, in order — asserts which block is in use. */
  msgIds: number[] = []
  /** Largest frame received, to assert the client stays under the buffer. */
  maxFrameSeen = 0
  private fidCounter = 1
  private open = new Map<number, OpenFile>()
  private dropLeft: number
  private held: Uint8Array[] = []
  private holding = false
  private otherSessionSent = false
  /** The live ops' instrument; `type: 'none'` until `loadInstrument` or a `load`. */
  live: FakeInstrument = { type: 'none', name: '', dir: '', edited: false, drum: -1, entire: false, gen: 0, preset: '', overrides: new Map() }
  /** Whether a `sub` lease is held (the fake has no clock; `expireLease()` ends it). */
  subscribed = false
  /** What the last `^inst` push or `sub` reply said, so a push goes out only on a difference (the drain's snapshot). */
  private snapshot = ''

  constructor(
    private readonly reply: (bytes: Uint8Array) => void,
    private readonly opts: FakeOptions = {},
  ) {
    this.dropLeft = opts.dropRequests ?? 0
  }

  putFile(path: string, data: Uint8Array | string): void {
    this.files.set(path, typeof data === 'string' ? enc(data) : data)
    let dir = path
    while (dir.includes('/')) {
      dir = dir.slice(0, dir.lastIndexOf('/'))
      this.dirs.add(dir === '' ? '/' : dir)
    }
  }

  receive(frame: Uint8Array): void {
    this.maxFrameSeen = Math.max(this.maxFrameSeen, frame.length)
    if (frame.length > 1024) return // dropped silently, like incomingSysexBuffer[1024]
    if (frame[0] !== SYSEX_START) return
    if (
      frame[1] !== DELUGE_ID[0] ||
      frame[2] !== DELUGE_ID[1] ||
      frame[3] !== DELUGE_ID[2] ||
      frame[4] !== DELUGE_ID[3] ||
      frame[5] !== CMD_JSON
    )
      return
    const msgId = frame[6]
    const end = frame.lastIndexOf(SYSEX_END)
    let sep = -1
    for (let i = 7; i < end; i++)
      if (frame[i] === 0) {
        sep = i
        break
      }
    let json: Record<string, Record<string, unknown>>
    try {
      json = JSON.parse(String.fromCharCode(...frame.subarray(7, sep === -1 ? end : sep)))
    } catch {
      return
    }
    this.requests.push(json)
    this.msgIds.push(msgId)
    if (this.dropLeft > 0) {
      this.dropLeft--
      return
    }
    const binary = sep === -1 ? new Uint8Array(0) : unpack7to8(frame.subarray(sep + 1, end))

    if (json.session) {
      if (this.opts.dropSession) return
      if (this.opts.otherSessionFirst && !this.otherSessionSent) {
        this.otherSessionSent = true
        this.otherSession()
      }
      // assignSession: sid 1 free → midBase 8, midMin 9, midMax 15; replied via startDirect (cmd Json, msgId 0).
      const grant: Record<string, unknown> = { sid: 1, midBase: 8, midMin: 9, midMax: 15 }
      if (!this.opts.omitSessionTag) grant.tag = json.session.tag
      if (this.opts.sessionPipe !== undefined) grant.pipe = this.opts.sessionPipe
      if (this.opts.liveEdit === 'on') grant.live = 1
      this.answer(0, '^session', grant, undefined, CMD_JSON)
    } else if (json.ping) {
      this.answer(msgId, '^ping', {})
    } else if (json.open) {
      this.doOpen(msgId, json.open)
    } else if (json.close) {
      const fid = json.close.fid as number
      this.open.delete(fid)
      this.answer(msgId, '^close', { fid, err: 0 })
    } else if (json.read) {
      this.doRead(msgId, json.read)
    } else if (json.write) {
      this.doWrite(msgId, json.write, binary)
    } else if (json.dir) {
      this.doDir(msgId, json.dir)
    } else if (json.delete) {
      this.answer(msgId, '^delete', { err: this.unlink(json.delete.path as string) })
    } else if (json.mkdir) {
      const path = json.mkdir.path as string
      // f_mkdir: FR_EXIST on a name in use, FR_NO_PATH when the parent is missing (ff.c:5086).
      const err = this.dirs.has(path) || this.files.has(path) ? 8 : !this.dirs.has(parentOf(path)) ? 5 : 0
      if (err === 0) this.dirs.add(path)
      this.answer(msgId, '^mkdir', { path, err })
    } else if (json.rename) {
      const from = json.rename.from as string
      const to = json.rename.to as string
      this.answer(msgId, '^rename', { from, to, err: this.rename(from, to) })
    } else {
      for (const op of ['inst', 'save', 'load', 'select', 'param', 'sub'] as const) {
        if (json[op]) this.liveOp(msgId, op, json[op])
      }
    }
  }

  // ---- Live Edit ------------------------------------------------------------

  /**
   * Put an instrument in the device's current clip, as a preset load on the
   * device (or the KIT/SYNTH button) would. `xml` is Deluge-authored text;
   * `dir` has no leading slash. A subscriber hears the switch as `^inst`.
   */
  loadInstrument(xml: string, name: string, dir: string): void {
    this.setInstrument(xml, name, dir, false)
    this.pushInstrumentIfChanged()
  }

  /** The device's own knob move: the parameter changes and a subscriber hears `^chg`. */
  deviceChange(change: LiveChange): void {
    this.live.overrides.set(this.paramKey(change), change.value)
    this.live.gen++
    this.live.edited = true
    if (!this.subscribed) return
    const parts = [`"n": "${change.name}"`]
    if (change.src !== undefined) parts.push(`"s": "${change.src}"`)
    if (change.bus) parts.push(`"b": 1`)
    else if (change.drum !== undefined) parts.push(`"d": ${change.drum}`)
    parts.push(`"v": ${change.value}`)
    this.answerRaw(0, `{"^chg": {\n"gen": ${this.live.gen},\n"p": [{\n${parts.join(',\n')}}]}}`, undefined, CMD_JSON)
    this.pushInstrumentIfChanged()
  }

  /** The device's own Save → Synth/Kit over its file: the card copy is what it holds, `edited` drops, a subscriber hears `^inst`. */
  deviceSave(): void {
    if (!this.hasInstrument) throw new Error('nothing to save')
    this.putFile(`/${this.live.dir}/${this.live.name}.XML`, this.currentPreset())
    this.live.edited = false
    this.pushInstrumentIfChanged()
  }

  /** A non-parameter edit on the device (a menu, the sample browser): `^dirty` to a subscriber. */
  deviceEdit(): void {
    this.live.gen++
    this.live.edited = true
    if (!this.subscribed) return
    this.answerRaw(0, `{"^dirty": {\n"gen": ${this.live.gen}}}`, undefined, CMD_JSON)
    this.pushInstrumentIfChanged()
  }

  /** The `sub` lease lapses without a renewal. */
  expireLease(): void {
    this.subscribed = false
  }

  /**
   * The XML the device would write for its instrument right now: the loaded
   * preset with every override applied. Untouched, it is the loaded bytes
   * verbatim — the device serialises what it holds, and what it holds came
   * from a file it wrote.
   */
  currentPreset(): string {
    if (this.live.overrides.size === 0) return this.live.preset
    const tree = parseXML(this.live.preset)
    for (const [key, value] of this.live.overrides) applyChange(tree, { ...this.parseKey(key), value })
    return generateXML(tree)
  }

  private setInstrument(xml: string, name: string, dir: string, edited: boolean): void {
    const tree = parseXML(xml)
    this.live = {
      type: isKit(tree) ? 'kit' : 'synth',
      name,
      dir,
      edited,
      drum: isKit(tree) && drumRows(tree).length > 0 ? 0 : -1,
      entire: false,
      gen: this.live.gen + 1,
      preset: xml,
      overrides: new Map(),
    }
  }

  private liveOp(msgId: number, op: string, args: Record<string, unknown>): void {
    if (this.opts.liveEdit === undefined) return // a firmware without the ops: silence
    if (this.opts.liveEdit === 'off') {
      this.answer(msgId, `^${op}`, { err: 1, why: 'off' })
      return
    }
    switch (op) {
      case 'inst':
        return this.answerRaw(msgId, `{"^inst": {${this.instrumentFields()},\n"err": 0}}`)
      case 'save':
        return this.doSave(msgId, args)
      case 'load':
        return this.doLoad(msgId, args)
      case 'select':
        return this.doSelect(msgId, args)
      case 'param':
        return this.doParam(msgId, args)
      case 'sub':
        return this.doSub(msgId, args)
    }
  }

  private get hasInstrument(): boolean {
    return this.live.type === 'synth' || this.live.type === 'kit'
  }

  private tree(): Preset {
    return parseXML(this.live.preset)
  }

  /** The kit's rows in drum-list order; none for a synth. */
  private rows(): ReturnType<typeof drumRows> {
    const t = this.tree()
    return isKit(t) ? drumRows(t) : []
  }

  /** `writeInstrumentFields`, as the JsonSerializer lays it out. */
  private instrumentFields(): string {
    const f: string[] = [`"type": "${this.live.type}"`]
    if (this.hasInstrument) {
      f.push(`"name": "${this.live.name}"`, `"dir": "${this.live.dir}"`, `"edited": ${this.live.edited ? 1 : 0}`)
      if (this.live.type === 'kit') {
        const rows = this.rows()
        const row = rows[this.live.drum]
        const kind: LiveDrumKind = !row ? 'none' : row.tag === 'midiOutput' ? 'midi' : row.tag === 'gateOutput' ? 'gate' : 'sound'
        f.push(`"drum": ${this.live.drum}`, `"drumKind": "${kind}"`)
      }
      f.push(`"entire": ${this.live.entire ? 1 : 0}`)
    }
    f.push(`"gen": ${this.live.gen}`)
    return `\n${f.join(',\n')}`
  }

  /** `replyStatus`: the instrument fields when asked for, then `err` and `why`. */
  private replyStatus(msgId: number, tag: string, err: number, why: string | null, withInstrument: boolean): void {
    const fields = withInstrument ? `${this.instrumentFields()},` : ''
    const tail = why === null ? `\n"err": 0` : `\n"err": ${err === 0 ? 1 : err},\n"why": "${why}"`
    this.answerRaw(msgId, `{"${tag}": {${fields}${tail}}}`)
  }

  /** What the drain task's snapshot compares: the output, the selected row, AFFECT ENTIRE and the edited flag — not `gen`. */
  private snapshotKey(): string {
    const l = this.live
    return `${l.type}|${l.name}|${l.dir}|${l.edited}|${l.drum}|${l.entire}`
  }

  /** The drain task's `^inst` push: only when the snapshot differs from the last one taken. */
  private pushInstrumentIfChanged(): void {
    const now = this.snapshotKey()
    if (!this.subscribed || now === this.snapshot) return
    this.snapshot = now
    this.answerRaw(0, `{"^inst": {${this.instrumentFields()}}}`, undefined, CMD_JSON)
  }

  private doSave(msgId: number, args: Record<string, unknown>): void {
    if (!this.hasInstrument) return this.replyStatus(msgId, '^save', 0, 'noInst', true)
    const path = typeof args.path === 'string' ? args.path : `/${this.live.dir}/${this.live.name}.XML`
    const split = splitPresetPath(path)
    if (!split) return this.replyStatus(msgId, '^save', 0, 'path', false)
    const overwrite = args.overwrite === 1
    const keep = args.keep === 1
    if (this.files.has(path) && !overwrite) return this.replyStatus(msgId, '^save', ERR_FILE_ALREADY_EXISTS, 'exists', false)
    if (!this.dirs.has(parentOf(path))) return this.replyStatus(msgId, '^save', 5 /* FR_NO_PATH, through createFile */, 'save', false)
    const xml = this.currentPreset()
    this.putFile(path, keep || !this.opts.saveWrites ? xml : this.opts.saveWrites(xml))
    if (!keep) {
      this.live.name = split.name
      this.live.dir = split.dir
      this.live.edited = false
      this.live.gen++
    }
    this.answerRaw(msgId, `{"^save": {\n"path": "${path}",${this.instrumentFields()},\n"err": 0}}`)
    this.pushInstrumentIfChanged()
  }

  private doLoad(msgId: number, args: Record<string, unknown>): void {
    if (!this.hasInstrument) return this.replyStatus(msgId, '^load', 0, 'noInst', true)
    if (this.opts.liveBusy) return this.replyStatus(msgId, '^load', 0, 'busy', false)
    const path = typeof args.path === 'string' ? args.path : ''
    const split = splitPresetPath(path)
    if (!split) return this.replyStatus(msgId, '^load', 0, 'path', false)
    const bytes = this.files.get(path)
    if (!bytes) return this.replyStatus(msgId, '^load', ERR_FILE_NOT_FOUND, 'notFound', false)
    const xml = String.fromCharCode(...bytes)
    const as = typeof args.name === 'string'
    this.setInstrument(xml, as ? (args.name as string) : split.name, as && typeof args.dir === 'string' ? args.dir : split.dir, as)
    this.replyStatus(msgId, '^load', 0, null, true)
    this.pushInstrumentIfChanged()
  }

  private doSelect(msgId: number, args: Record<string, unknown>): void {
    if (this.live.type !== 'kit') return this.replyStatus(msgId, '^select', 0, 'noKit', true)
    if (typeof args.drum === 'number') {
      const rows = this.rows()
      if (args.drum < -1 || args.drum >= rows.length) return this.replyStatus(msgId, '^select', 0, 'noDrum', true)
      this.live.drum = args.drum
    }
    if (typeof args.entire === 'number') this.live.entire = args.entire !== 0
    this.replyStatus(msgId, '^select', 0, null, true)
    this.pushInstrumentIfChanged()
  }

  /** `(owner, name, src)` as one string, the dedup key `noteParamChanged` uses. */
  private paramKey(c: LiveChange): string {
    const owner = c.bus ? 'b' : c.drum !== undefined && c.drum >= 0 ? `d${c.drum}` : 's'
    return `${owner}|${c.name}|${c.src ?? ''}`
  }

  private parseKey(key: string): Omit<LiveChange, 'value'> {
    const [owner, name, src] = key.split('|')
    const out: Omit<LiveChange, 'value'> = { name }
    if (src) out.src = src
    if (owner === 'b') out.bus = true
    else if (owner.startsWith('d')) out.drum = Number(owner.slice(1))
    return out
  }

  private doParam(msgId: number, args: Record<string, unknown>): void {
    if (!this.hasInstrument) return this.replyStatus(msgId, '^param', 0, 'noInst', true)
    const name = typeof args.name === 'string' ? args.name : ''
    const src = typeof args.src === 'string' ? args.src : undefined
    const kit = this.live.type === 'kit'
    const bus = kit && args.bus === 1
    let drum = kit && !bus ? (typeof args.drum === 'number' ? args.drum : this.live.drum) : undefined
    // Name resolution as setParam does it: a cable needs a patched destination and a known source;
    // the kit bus its own table; a sound the follow-file spellings (patched ids scanned first).
    if (src !== undefined) {
      if (!CABLE_DESTINATIONS.has(name)) return this.replyStatus(msgId, '^param', 0, 'name', false)
      if (!(PATCH_SOURCES as readonly string[]).includes(src)) return this.replyStatus(msgId, '^param', 0, 'src', false)
    } else if (bus ? !BUS_NAMES.has(name) : !SOUND_NAMES.has(name)) {
      return this.replyStatus(msgId, '^param', 0, 'name', false)
    }
    if (kit && !bus) {
      const rows = this.rows()
      const row = rows[drum!]
      if (!row || row.tag !== 'sound') return this.replyStatus(msgId, '^param', 0, 'noDrum', false)
    }
    const change: LiveChange = { name, value: 0 }
    if (src !== undefined) change.src = src
    if (bus) change.bus = true
    else if (drum !== undefined) change.drum = drum
    const key = this.paramKey(change)
    if (typeof args.value === 'number') {
      this.live.overrides.set(key, args.value)
      this.live.edited = true
      this.live.gen++
    }
    let value = this.live.overrides.get(key)
    if (value === undefined) {
      // The AutoParam's current value: the file's, when the file has it.
      const path = changePath(this.tree(), change)
      const hex = path === null ? undefined : flattenXML(this.live.preset).get(path)
      if (src !== undefined && path === null) return this.replyStatus(msgId, '^param', 0, 'noParam', false)
      value = hex === undefined ? 0 : parseInt(hex.slice(2), 16) | 0
    }
    const f = [`"name": "${name}"`]
    if (src !== undefined) f.push(`"src": "${src}"`)
    if (kit) f.push(bus ? `"bus": 1` : `"drum": ${typeof args.drum === 'number' ? args.drum : -1}`)
    f.push(`"value": ${value}`, `"err": 0`)
    this.answerRaw(msgId, `{"^param": {\n${f.join(',\n')}}}`)
    this.pushInstrumentIfChanged()
  }

  private doSub(msgId: number, args: Record<string, unknown>): void {
    let secs = typeof args.secs === 'number' ? args.secs : 10
    if (secs <= 0) {
      secs = 0
      this.subscribed = false
    } else {
      secs = Math.min(secs, 120)
      this.subscribed = true
    }
    this.snapshot = this.snapshotKey()
    this.answerRaw(msgId, `{"^sub": {\n"secs": ${secs},${this.instrumentFields()},\n"err": 0}}`)
  }

  /** f_unlink: a file, or an empty folder (FR_DENIED otherwise); FR_NO_FILE when there is nothing there. */
  private unlink(path: string): number {
    if (this.files.has(path)) {
      this.files.delete(path)
      return 0
    }
    if (!this.dirs.has(path)) return 4
    for (const p of [...this.files.keys(), ...this.dirs]) if (p !== path && p.startsWith(`${path}/`)) return 7
    this.dirs.delete(path)
    return 0
  }

  /**
   * f_rename (ff.c:5193-5213): FR_NO_FILE when there is no `from`, FR_NO_PATH
   * when `to`'s folder is missing, FR_EXIST when `to` is in use — unless it
   * is the same entry under other capitalisation, which FAT allows. A folder
   * moves with everything under it.
   */
  private rename(from: string, to: string): number {
    const lower = (s: string): string => s.toLowerCase()
    const isFile = this.files.has(from)
    if (!isFile && !this.dirs.has(from)) return 4
    if (!this.dirs.has(parentOf(to))) return 5
    const taken = [...this.files.keys(), ...this.dirs].some((p) => lower(p) === lower(to) && p !== from)
    if (taken) return 8
    if (isFile) {
      const data = this.files.get(from)!
      this.files.delete(from)
      this.files.set(to, data)
      return 0
    }
    const moved = new Map<string, Uint8Array>()
    for (const [p, v] of this.files) {
      if (p.startsWith(`${from}/`)) {
        this.files.delete(p)
        moved.set(`${to}${p.slice(from.length)}`, v)
      }
    }
    for (const [p, v] of moved) this.files.set(p, v)
    for (const d of [...this.dirs]) {
      if (d === from || d.startsWith(`${from}/`)) {
        this.dirs.delete(d)
        this.dirs.add(`${to}${d.slice(from.length)}`)
      }
    }
    return 0
  }

  /**
   * The grant for another client's session — sid 2, msgIds 17…23, that
   * client's tag — sent on msgId 0 like every grant. Web MIDI is not
   * exclusive: this is what a second editor's negotiation looks like from
   * here.
   */
  otherSession(): void {
    this.answer(0, '^session', { sid: 2, tag: OTHER_CLIENT_TAG, midBase: 16, midMin: 17, midMax: 23 }, undefined, CMD_JSON)
  }

  /** A reply to another client's request, on that client's msgId block. */
  otherClientReply(msgId = 17): void {
    this.answer(msgId, '^read', { fid: 99, addr: 0, size: 0, err: 0 })
  }

  private doOpen(msgId: number, cmd: Record<string, unknown>): void {
    const path = cmd.path as string
    if (this.opts.failOpen) {
      this.answer(msgId, '^open', { fid: 0, size: 0, err: this.opts.failOpen })
      return
    }
    if (cmd.write) {
      this.putFile(path, new Uint8Array(0)) // FA_CREATE_ALWAYS truncates
    } else if (!this.files.has(path)) {
      this.answer(msgId, '^open', { fid: 0, size: 0, err: 4 /* FR_NO_FILE */ })
      return
    }
    const fid = this.fidCounter++
    this.open.set(fid, { path, write: Boolean(cmd.write) })
    this.answer(msgId, '^open', { fid, size: this.files.get(path)!.length, err: 0 })
  }

  private doRead(msgId: number, cmd: Record<string, unknown>): void {
    this.holding = this.opts.holdReads ?? false
    const fid = cmd.fid as number
    const addr = cmd.addr as number
    const want = Math.min((cmd.size as number) ?? 1024, 1024)
    const f = this.open.get(fid)
    if (!f) {
      this.answer(msgId, '^read', { fid, addr, size: 0, err: 12 /* FR_NOT_ENABLED, as readBlock replies */ })
      this.holding = false
      return
    }
    const data = this.files.get(f.path)!.subarray(addr, addr + want)
    this.answer(msgId, '^read', { fid, addr, size: data.length, err: 0 }, data)
    this.holding = false
  }

  /** Send the oldest held write reply; false when none are waiting. */
  releaseWrite(): boolean {
    const bytes = this.held.shift()
    if (!bytes) return false
    this.reply(bytes)
    return true
  }

  /** Send the oldest held read reply; false when none are waiting. */
  releaseRead(): boolean {
    return this.releaseWrite()
  }

  private doWrite(msgId: number, cmd: Record<string, unknown>, data: Uint8Array): void {
    this.holding = this.opts.holdWrites ?? false
    const fid = cmd.fid as number
    const addr = cmd.addr as number
    const f = this.open.get(fid)
    if (!f) {
      this.answer(msgId, '^write', { fid, addr, size: 0, err: 12 })
      return
    }
    let commit = data
    if (this.opts.shortWriteAlways !== undefined) {
      commit = data.subarray(0, Math.min(this.opts.shortWriteAlways, data.length))
    } else if (this.opts.shortWriteOnce !== undefined) {
      commit = data.subarray(0, this.opts.shortWriteOnce)
      this.opts.shortWriteOnce = undefined
    }
    const old = this.files.get(f.path)!
    const grown = new Uint8Array(Math.max(old.length, addr + commit.length))
    grown.set(old)
    grown.set(commit, addr)
    if (this.opts.corruptWrites && grown.length > 0) grown[0] ^= 0xff
    this.files.set(f.path, grown)
    // A short write is err 0 with the real count — smsysex.cpp writeBlock.
    this.answer(msgId, '^write', { fid, addr, size: commit.length, err: 0 })
    this.holding = false
  }

  private doDir(msgId: number, cmd: Record<string, unknown>): void {
    const path = (cmd.path as string).replace(/\/$/, '') || '/'
    const offset = (cmd.offset as number) ?? 0
    const lines = Math.min((cmd.lines as number) ?? 20, 25) // MAX_DIR_LINES
    if (this.opts.failDir) {
      this.answerRaw(msgId, `{"^dir": {\n"list": [],\n"err": ${this.opts.failDir}}}`)
      return
    }
    if (!this.dirs.has(path)) {
      this.answerRaw(msgId, `{"^dir": {\n"list": [],\n"err": 5}}`)
      return
    }
    const prefix = path === '/' ? '/' : `${path}/`
    const inDir = (p: string): boolean => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')
    const names: Array<{ name: string; size: number; attr: number }> = []
    for (const d of this.dirs) if (d !== '/' && inDir(d)) names.push({ name: d.slice(prefix.length), size: 0, attr: 0x10 })
    for (const [p, v] of this.files) if (inDir(p)) names.push({ name: p.slice(prefix.length), size: v.length, attr: 0x20 })
    names.sort((a, b) => a.name.localeCompare(b.name))
    const page = names.slice(offset, offset + lines)
    const list = page
      .map((e) => `{\n"name": "${e.name}",\n"size": ${e.size},\n"date": 22222,\n"time": 11111,\n"attr": ${e.attr}}`)
      .join(', ')
    this.answerRaw(msgId, `{"^dir": {\n"list": [${list}],\n"err": 0}}`)
  }

  /** Reply in the JsonSerializer's memory-based shape: newlines, no indents. */
  private answer(
    msgId: number,
    tag: string,
    attrs: Record<string, unknown>,
    binary?: Uint8Array,
    command: number = CMD_JSON_REPLY,
  ): void {
    const body = Object.entries(attrs)
      .map(([k, v]) => `\n"${k}": ${typeof v === 'string' ? `"${v}"` : v}`)
      .join(',')
    this.answerRaw(msgId, `{"${tag}": {${body}}}`, binary, command)
  }

  private answerRaw(msgId: number, json: string, binary?: Uint8Array, command: number = CMD_JSON_REPLY): void {
    const text = enc(`\n${json}`)
    const packed = binary === undefined ? null : pack8to7(binary)
    const out = new Uint8Array(7 + text.length + (packed ? packed.length + 1 : 0) + 1)
    out[0] = SYSEX_START
    out.set(DELUGE_ID, 1)
    out[5] = command
    out[6] = msgId
    out.set(text, 7)
    let o = 7 + text.length
    if (packed) {
      out[o++] = 0
      out.set(packed, o)
      o += packed.length
    }
    out[o] = SYSEX_END
    if (this.holding) this.held.push(out)
    else this.reply(out)
  }
}
