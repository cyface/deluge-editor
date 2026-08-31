/**
 * The smSysex client: sessions, retries, and the file operations, over any
 * byte transport (the UI wires it to a Web MIDI port; tests wire it to a
 * fake Deluge). Framework-free.
 *
 * The firmware side is `src/deluge/storage/smsysex.cpp` (upstream/main
 * 3f898e95), and three of its behaviours shape everything here:
 *
 * - A request can vanish without any reply: oversized frames are dropped
 *   silently (`incomingSysexBuffer[1024]`), and requests are queued and only
 *   handled when the card is free (`handleNextSysEx` returns early while
 *   `currentlyAccessingCard`). So every send runs on a timeout ladder, and a
 *   resend takes a fresh msgId so a late reply to an abandoned attempt can
 *   never be mistaken for the current one. Every operation addresses an
 *   explicit fid/addr/offset, so resending is idempotent.
 * - A short write is NOT an error: `writeBlock` commits however many bytes
 *   arrived and replies err=0 with the real count in `size`. The count must
 *   be checked and the chunk rewritten, or the file is silently holed.
 * - `^open` always answers, carrying a FatFS error code — a missing file is
 *   `err: 4` (FR_NO_FILE) with fid 0, not a protocol failure.
 *
 * After a write, the file is read back and byte-compared. A file with the
 * right name and size can still be full of zeroes; only the read-back proves
 * the card holds what was sent.
 */

import { fresultMessage, fresultName } from './fatfs'
import { buildJsonFrame, MAX_REQUEST_BYTES, parseReply, type SysexReply } from './frame'

/** One `^dir` list entry: `getDirEntries` writes name/size/date/time/attr. */
export interface DirEntry {
  name: string
  size: number
  date: number
  time: number
  attr: number
}

/** FatFS `AM_DIR` bit, as commented in `getDirEntries`. */
export const isDirectory = (e: DirEntry): boolean => (e.attr & 0x10) !== 0

export type Progress = (done: number, total: number) => void

/** An open read-only file on the card; see `SmsClient.openRead`. */
export interface ReadHandle {
  size: number
  /** Up to `length` bytes at `offset`; shorter only at end of file. */
  read(offset: number, length: number): Promise<Uint8Array>
  close(): Promise<void>
}

export class SysexError extends Error {
  constructor(
    public readonly op: string,
    public readonly path: string,
    /** FatFS FRESULT, or -1 when no reply ever came. */
    public readonly code: number,
  ) {
    super(
      code === -1
        ? `${op} ${path}: no reply from the Deluge`
        : `${op} ${path}: ${fresultMessage(code)} (${fresultName(code)})`,
    )
    this.name = 'SysexError'
  }
}

export interface SmsClientOptions {
  /** Per-attempt reply timeouts, ms. Fresh msgId per attempt. */
  timeouts?: number[]
  /**
   * File bytes per write request. Packed, a 512-byte chunk makes a ~645-byte
   * frame, safely under the firmware's 1024-byte receive buffer; a 1024-byte
   * chunk would pack past it and be dropped without a reply.
   */
  writeChunk?: number
  /** File bytes per read request; the firmware clamps at its 1024-byte block buffer. */
  readChunk?: number
  /** Rewrites of one chunk before giving up on a persistent short write. */
  writeAttempts?: number
  /** Session tag shown to the firmware. */
  tag?: string
}

/** `MAX_DIR_LINES` in smsysex.cpp: `dir` returns at most 25 entries per request. */
const MAX_DIR_LINES = 25

const DEFAULTS: Required<SmsClientOptions> = {
  timeouts: [400, 400, 800, 2000, 4000, 10000],
  writeChunk: 512,
  readChunk: 1024,
  writeAttempts: 5,
  tag: 'deluge-editor',
}

interface Session {
  midMin: number
  midMax: number
}

export class SmsClient {
  private readonly opts: Required<SmsClientOptions>
  private session: Session | null = null
  private counter = 0
  private pending = new Map<number, (r: SysexReply) => void>()

  constructor(
    private readonly send: (bytes: Uint8Array) => void,
    options: SmsClientOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options }
  }

  /** Feed every incoming MIDI message here; non-smSysex bytes are ignored. */
  receive(data: Uint8Array): void {
    const reply = parseReply(data)
    if (!reply) return
    const resolve = this.pending.get(reply.msgId)
    if (resolve) {
      this.pending.delete(reply.msgId)
      resolve(reply)
    }
  }

  async ping(): Promise<void> {
    const r = await this.request({ ping: {} })
    if (!('^ping' in r.json)) throw new SysexError('ping', '', -1)
  }

  /**
   * An open read-only file for ranged access — one `open`, any number of
   * `read`s, one `close` — so probing a WAV header costs a few small reads
   * instead of the whole sample. Always `close()` when done; the firmware's
   * file table is finite.
   */
  async openRead(path: string): Promise<ReadHandle> {
    const open = await this.expect('open', path, { open: { path, write: 0 } })
    const fid = open.fid as number
    const size = open.size as number
    const read = async (offset: number, length: number): Promise<Uint8Array> => {
      const out = new Uint8Array(Math.max(0, Math.min(length, size - offset)))
      let done = 0
      while (done < out.length) {
        const want = Math.min(this.opts.readChunk, out.length - done)
        const r = await this.request({ read: { fid, addr: offset + done, size: want } })
        this.body('read', path, r, '^read')
        const data = r.binary ?? new Uint8Array(0)
        if (data.length === 0) break // EOF short of the advertised size: don't spin.
        out.set(data.subarray(0, Math.min(data.length, out.length - done)), done)
        done += data.length
      }
      return done < out.length ? out.subarray(0, done) : out
    }
    return { size, read, close: () => this.close(path, fid) }
  }

  async readFile(path: string, onProgress?: Progress): Promise<Uint8Array> {
    const handle = await this.openRead(path)
    const out = new Uint8Array(handle.size)
    let offset = 0
    while (offset < handle.size) {
      const data = await handle.read(offset, this.opts.readChunk)
      if (data.length === 0) break
      out.set(data, offset)
      offset += data.length
      onProgress?.(offset, handle.size)
    }
    await handle.close()
    if (offset < handle.size) throw new SysexError('read', path, 9 /* FR_INVALID_OBJECT: file shrank mid-read */)
    return out
  }

  /** Write and then read back and byte-compare — name and size prove nothing. */
  async writeFile(path: string, data: Uint8Array, onProgress?: Progress): Promise<void> {
    const total = data.length * 2 // write + verify
    const open = await this.expect('open', path, { open: { path, write: 1 } })
    const fid = open.fid as number
    let offset = 0
    while (offset < data.length) {
      const chunk = data.subarray(offset, Math.min(offset + this.opts.writeChunk, data.length))
      let written = -1
      for (let attempt = 0; attempt < this.opts.writeAttempts && written !== chunk.length; attempt++) {
        const r = await this.request({ write: { fid, addr: offset, size: chunk.length } }, chunk)
        const body = this.body('write', path, r, '^write')
        written = body.size as number
      }
      if (written !== chunk.length) throw new SysexError('write', path, 1 /* FR_DISK_ERR: persistent short write */)
      offset += chunk.length
      onProgress?.(offset, total)
    }
    await this.close(path, fid)
    const back = await this.readFile(path, (done) => onProgress?.(data.length + done, total))
    if (back.length !== data.length) {
      throw new Error(`verify ${path}: wrote ${data.length} bytes but read back ${back.length} — the card copy is bad`)
    }
    for (let i = 0; i < data.length; i++) {
      if (back[i] !== data[i]) {
        throw new Error(`verify ${path}: card copy differs from what was sent, first at byte ${i}`)
      }
    }
  }

  /** The whole directory, paged through the firmware's 25-line limit. */
  async listDirectory(path: string): Promise<DirEntry[]> {
    const all: DirEntry[] = []
    for (;;) {
      const r = await this.request({ dir: { path, offset: all.length, lines: MAX_DIR_LINES } })
      const body = r.json['^dir'] as { list?: DirEntry[]; err?: number } | undefined
      if (!body) throw new SysexError('dir', path, -1)
      const err = body.err ?? 0
      if (err !== 0 && all.length === 0) throw new SysexError('dir', path, err)
      const page = body.list ?? []
      all.push(...page)
      if (err !== 0 || page.length < MAX_DIR_LINES) return all
    }
  }

  // ---- plumbing -----------------------------------------------------------

  private async close(path: string, fid: number): Promise<void> {
    const r = await this.request({ close: { fid } })
    this.body('close', path, r, '^close')
  }

  /** Send `open` (or any op) and unwrap its `^`-reply, throwing on a FatFS error. */
  private async expect(op: string, path: string, cmd: object): Promise<Record<string, unknown>> {
    const r = await this.request(cmd)
    return this.body(op, path, r, `^${op}`)
  }

  private body(op: string, path: string, r: SysexReply, key: string): Record<string, unknown> {
    const body = r.json[key] as Record<string, unknown> | undefined
    if (!body) throw new SysexError(op, path, -1)
    const err = (body.err as number | undefined) ?? 0
    if (err !== 0) throw new SysexError(op, path, err)
    return body
  }

  /** One command with the retry ladder; a fresh msgId per attempt. */
  private async request(cmd: object, binary?: Uint8Array): Promise<SysexReply> {
    let lastError: Error | null = null
    for (const timeout of this.opts.timeouts) {
      const session = await this.ensureSession()
      const range = session.midMax - session.midMin + 1
      const msgId = session.midMin + this.counter++ % range
      const frame = buildJsonFrame(msgId, cmd, binary)
      if (frame.length > MAX_REQUEST_BYTES) {
        throw new Error(`SysEx request is ${frame.length} bytes; the Deluge silently drops anything over ${MAX_REQUEST_BYTES}`)
      }
      try {
        return await this.exchange(msgId, frame, timeout)
      } catch (e) {
        lastError = e as Error
      }
    }
    throw lastError ?? new Error('SysEx request failed')
  }

  /**
   * `{session:{tag}}` → `^session {sid, midMin, midMax}` (msgIds are
   * `(sid<<3)+1 … (sid<<3)+7`; 15 sessions, LRU-reclaimed). If negotiation
   * never answers, fall back to the last session's range: the firmware never
   * validates msgId ownership — `noteSessionIdUse` only marks the session
   * block as recently used — so any well-formed msgId works.
   */
  private async ensureSession(): Promise<Session> {
    if (this.session) return this.session
    for (const timeout of this.opts.timeouts) {
      try {
        const r = await this.exchange(0, buildJsonFrame(0, { session: { tag: this.opts.tag } }), timeout)
        const body = r.json['^session'] as { midMin?: number; midMax?: number } | undefined
        if (body?.midMin !== undefined && body.midMax !== undefined) {
          this.session = { midMin: body.midMin, midMax: body.midMax }
          return this.session
        }
      } catch {
        // try again; fall through to the fallback after the ladder
      }
    }
    this.session = { midMin: (15 << 3) + 1, midMax: (15 << 3) + 7 }
    return this.session
  }

  private exchange(msgId: number, frame: Uint8Array, timeout: number): Promise<SysexReply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msgId)
        reject(new Error(`no reply to msgId 0x${msgId.toString(16)} after ${timeout}ms`))
      }, timeout)
      this.pending.set(msgId, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
      this.send(frame)
    })
  }
}
