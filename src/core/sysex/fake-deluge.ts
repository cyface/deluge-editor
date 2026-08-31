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
 *
 * Used by unit tests only; nothing in the app imports it.
 */

import { CMD_JSON, CMD_JSON_REPLY, DELUGE_ID, SYSEX_END, SYSEX_START } from './frame'
import { pack8to7, unpack7to8 } from './pack'

export interface FakeOptions {
  /** Drop this many JSON requests before answering (lost-request simulation). */
  dropRequests?: number
  /** Never answer `session` requests (forces the client's fallback range). */
  dropSession?: boolean
  /** Next write commits only this many bytes, err 0 — once. */
  shortWriteOnce?: number
  /** Every `open` fails with this FRESULT. */
  failOpen?: number
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
}

/** The tag the second client in `otherSessionFirst` asked for. */
export const OTHER_CLIENT_TAG = 'deluge-editor-beef'

interface OpenFile {
  path: string
  write: boolean
}

const enc = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))

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
    }
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
    if (this.opts.shortWriteOnce !== undefined) {
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
