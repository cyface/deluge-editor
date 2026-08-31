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
 *   handled when the card is free (`sysexReceived` pushes onto the `SysExQ`
 *   deque; `handleNextSysEx` returns early while `currentlyAccessingCard`).
 *   So every send runs on a timeout ladder, and a resend takes a fresh msgId
 *   so a late reply to an abandoned attempt can never be mistaken for the
 *   current one. Every operation addresses an explicit fid/addr/offset, so
 *   resending is idempotent. The queue accepts several requests at once,
 *   but whether overlapping them is safe depends on the firmware's USB
 *   send ring (`ConnectedUSBMIDIDevice::bufferMessage`): the original ring
 *   silently discarded single events on overflow, so an overlapped reply
 *   came back complete, well-framed and WRONG (measured on hardware —
 *   cyface/DelugeFirmware#43). Fixed firmware reserves ring space for the
 *   whole reply up front and drops the whole message on overflow — a
 *   timeout, which the ladder retries — and advertises its safe in-flight
 *   count as `pipe` in the `^session` grant. Bulk transfers here run at
 *   `min(pipe, 2)` requests in flight; a grant without the field is an
 *   unfixed firmware and stays strictly serial (see `pipeline`).
 *   Replies are matched by msgId AND by the reply's op (plus
 *   the echoed fid/addr where the op has them), because the msgId space is
 *   only 7 wide per session and an abandoned attempt's late reply could
 *   otherwise land on a newer request that drew the same id.
 * - A short write is NOT an error: `writeBlock` commits however many bytes
 *   arrived and replies err=0 with the real count in `size`. The count must
 *   be checked and the chunk rewritten, or the file is silently holed.
 * - `^open` always answers, carrying a FatFS error code — a missing file is
 *   `err: 4` (FR_NO_FILE) with fid 0, not a protocol failure.
 *
 * After a write, the file is read back and byte-compared. A file with the
 * right name and size can still be full of zeroes; only the read-back proves
 * the card holds what was sent.
 *
 * One more fact shapes the session handling: the transport is not exclusive.
 * The OS MIDI stacks multiplex, so a second editor tab — or any other app on
 * the machine — receives every reply this Deluge sends, and its own session
 * grant looks exactly like ours. Hence the per-client `tag` and `isOurs`:
 * we adopt only the grant we asked for, ignore replies addressed to another
 * session's msgIds, and report them through `onOtherClient` so the UI can
 * warn that two editors can overwrite each other's saves (issue #8).
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

/**
 * How much of a written file the read-back verify re-reads. `full` is every
 * byte; `sampled` checks the reported size plus the first and last chunks
 * and eight spread through the middle (~10KB regardless of file size).
 * Sampled still catches the transport's known failure shapes — truncation
 * (size), a dropped byte (everything after it shifts, so any probe hits),
 * and header damage (the first chunk) — while a multi-megabyte sample skips
 * the ~40% of push time a full re-read costs. There is no cheaper honest
 * option: the firmware has no checksum op (`handleNextSysEx`'s command set
 * ends at utime/session/ping), so any client-side hash would have to read
 * every byte back anyway.
 */
export type VerifyMode = 'full' | 'sampled'

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
  /**
   * Per-attempt reply timeouts, ms. Fresh msgId per attempt. The first rung
   * must sit above the card's worst single-op stall, not the healthy round
   * trip: measured on hardware, requests answer in 5–13ms warm, but an
   * open-for-write after the card has been idle takes ~0.5–1s of FAT work.
   * Rungs below that fire resends the firmware queues and processes anyway —
   * every duplicate adds card work, and a slow save snowballs into a 30s one.
   * A tall first rung costs nothing when the link is healthy; a reply
   * resolves the moment it arrives.
   */
  timeouts?: number[]
  /**
   * File bytes per write request. The paper limit is the firmware's
   * 1024-byte frame buffer (`MaxSysExLength`), but the real one is the
   * host's: macOS CoreMIDI/AppleUSBMIDIDriver deletes byte 750 of any
   * outgoing SysEx over 752 bytes and repacks the rest, so the frame
   * arrives one byte short and the write commits n-1 bytes — bisected to
   * exactly frame ≤ 752 OK, ≥ 753 short, and pinned on the host by a
   * firmware `^echo` op with USB receive stats (cyface/DelugeFirmware#42).
   * A 512-byte chunk makes a ~645-byte frame, clear of the cliff; the
   * measured gain from camping at ~600 is ~5%, not worth the margin.
   */
  writeChunk?: number
  /** File bytes per read request; the firmware clamps at its 1024-byte block buffer. */
  readChunk?: number
  /** Rewrites of one chunk before giving up on a persistent short write. */
  writeAttempts?: number
  /**
   * Session tag shown to the firmware, which echoes it back in the grant.
   * Defaults to a per-client random one; see `newTag`. Only pass a fixed tag
   * in tests, where one client is the only client.
   */
  tag?: string
  /**
   * Called whenever a reply arrives that belongs to somebody else's session
   * — the fingerprint of a second editor on the same Deluge (Web MIDI is not
   * exclusive; see `isOurs`). The argument is the op that was answered.
   * Advisory only: nothing here blocks, because nothing client-side can stop
   * the other client from truncating a file we just wrote.
   */
  onOtherClient?: (op: string) => void
  /**
   * One line per request (op, elapsed, which timeout rung answered) and one
   * per late reply — a reply arriving after its attempt was abandoned, the
   * signature of a timeout rung shorter than the link's real round trip.
   */
  debug?: (line: string) => void
}

/** `MAX_DIR_LINES` in smsysex.cpp: `dir` returns at most 25 entries per request. */
const MAX_DIR_LINES = 25

/**
 * The most requests this client will keep in flight, however much the
 * firmware's grant offers. 2 is where the measured curve peaks (hardware,
 * fixed ring, 2026-08-31, cyface/DelugeFirmware#43): reads 127→172 KB/s
 * (+36%), writes 39→52 KB/s (+31%), 20/20 repetitions byte-identical.
 * Wider windows are strictly WORSE, not just unhelpful: the fixed ring
 * fails an overflow by dropping the whole reply, each drop costs a
 * first-rung timeout (~2s), and at 3+ in flight the drops start —
 * measured 85–105 KB/s, below serial. The gain is capped anyway because
 * the firmware serves requests serially (~10ms card+parse per chunk);
 * only the transport leg overlaps. Must always stay under the session's
 * 7 msgIds.
 */
const MAX_PIPELINE = 2

/** Every option but `tag`, whose default is drawn per client (`newTag`). */
const DEFAULTS: Required<Omit<SmsClientOptions, 'tag'>> = {
  timeouts: [2000, 2000, 4000, 10000],
  writeChunk: 512,
  readChunk: 1024,
  writeAttempts: 5,
  onOtherClient: () => {},
  debug: () => {},
}

/**
 * A per-client session tag. The OS MIDI stacks multiplex, so two editor tabs
 * on one Deluge both see every reply — including each other's `^session`
 * grant, which arrives on msgId 0 (`startDirect`) and so matches any tab
 * mid-negotiation. `assignSession` (smsysex.cpp) echoes back the tag it was
 * given, and that echo is the only thing in the grant that says whose it is:
 * with the static tag both tabs could adopt one sid, hence one msgId range,
 * and then read each other's replies as their own. 16 bits of tag makes that
 * collision a 1-in-65536 accident instead of a certainty.
 */
const newTag = (): string => `deluge-editor-${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}`

interface Session {
  midMin: number
  midMax: number
  /**
   * The in-flight request count the firmware's grant vouches for (`pipe`
   * in `^session`), 1 when the grant carries no such field — a firmware
   * whose send ring can still corrupt overlapped replies (#43).
   */
  pipe: number
}

interface Pending {
  /** Whether a reply on this msgId is really for this request (op key, echoed fid/addr). */
  matches: (r: SysexReply) => boolean
  resolve: (r: SysexReply) => void
}

/**
 * The spot-check plan for a sampled verify: the first chunk (a WAV's whole
 * header), the last chunk (truncation and tail holes), and eight aligned
 * probes spread through the middle. A file small enough that the probes
 * would cover it anyway is checked whole.
 */
function sampledRanges(size: number, chunk: number): Array<[number, number]> {
  if (size === 0) return []
  if (size <= chunk * 10) return [[0, size]]
  const offsets = new Set<number>([0, size - chunk])
  for (let i = 1; i <= 8; i++) {
    offsets.add(Math.min(size - chunk, Math.floor((size * i) / 9 / chunk) * chunk))
  }
  return [...offsets].sort((a, b) => a - b).map((o) => [o, Math.min(chunk, size - o)])
}

/** Run `work` over `items` with at most `limit` in flight; a failure stops new starts. */
async function pooled<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      try {
        await work(items[next++])
      } catch (e) {
        failed = true
        throw e
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export class SmsClient {
  private readonly opts: Required<SmsClientOptions>
  private session: Session | null = null
  private counter = 0
  private pending = new Map<number, Pending>()

  constructor(
    private readonly send: (bytes: Uint8Array) => void,
    options: SmsClientOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options, tag: options.tag ?? newTag() }
  }

  /** Feed every incoming MIDI message here; non-smSysex bytes are ignored. */
  receive(data: Uint8Array): void {
    const reply = parseReply(data)
    if (!reply) return
    const op = Object.keys(reply.json)[0] ?? '?'
    if (!this.isOurs(reply)) {
      this.opts.debug(`another client's reply msgId 0x${reply.msgId.toString(16)} (${op}) — a second editor is on this Deluge`)
      this.opts.onOtherClient(op)
      return
    }
    const entry = this.pending.get(reply.msgId)
    if (!entry) {
      this.opts.debug(`late reply msgId 0x${reply.msgId.toString(16)} (${op}) — its attempt already timed out`)
      return
    }
    if (!entry.matches(reply)) {
      // An abandoned attempt's reply on a reused msgId; the real one is coming.
      this.opts.debug(`stale reply msgId 0x${reply.msgId.toString(16)} (${op}) — for an earlier request on the same id`)
      return
    }
    this.pending.delete(reply.msgId)
    entry.resolve(reply)
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

  /**
   * A whole file, with up to `pipeline` chunk reads in flight. Each chunk
   * addresses an explicit fid/addr and lands at its own offset, so order
   * doesn't matter and a timed-out chunk resends idempotently. A chunk
   * shorter than asked means the file shrank mid-read (another editor, the
   * Deluge itself) — that fails the whole read rather than returning a
   * buffer with a hole in it.
   */
  async readFile(path: string, onProgress?: Progress): Promise<Uint8Array> {
    const open = await this.expect('open', path, { open: { path, write: 0 } })
    const fid = open.fid as number
    const size = open.size as number
    const out = new Uint8Array(size)
    const offsets: number[] = []
    for (let o = 0; o < size; o += this.opts.readChunk) offsets.push(o)
    let done = 0
    let short = false
    await pooled(offsets, this.pipeline, async (offset) => {
      const want = Math.min(this.opts.readChunk, size - offset)
      const r = await this.request({ read: { fid, addr: offset, size: want } })
      this.body('read', path, r, '^read')
      const data = r.binary ?? new Uint8Array(0)
      out.set(data.subarray(0, Math.min(data.length, want)), offset)
      done += data.length
      if (data.length < want) short = true
      onProgress?.(Math.min(done, size), size)
    })
    await this.close(path, fid)
    if (short || done < size) throw new SysexError('read', path, 9 /* FR_INVALID_OBJECT: file shrank mid-read */)
    return out
  }

  /** Write and then read back and byte-compare — name and size prove nothing. */
  async writeFile(path: string, data: Uint8Array, onProgress?: Progress, verify: VerifyMode = 'full'): Promise<void> {
    const spots = verify === 'sampled' ? sampledRanges(data.length, this.opts.readChunk) : null
    const total = data.length + (spots ? spots.reduce((n, [, len]) => n + len, 0) : data.length)
    const open = await this.expect('open', path, { open: { path, write: 1 } })
    const fid = open.fid as number
    const offsets: number[] = []
    for (let o = 0; o < data.length; o += this.opts.writeChunk) offsets.push(o)
    let done = 0
    await pooled(offsets, this.pipeline, async (offset) => {
      const chunk = data.subarray(offset, Math.min(offset + this.opts.writeChunk, data.length))
      let written = -1
      for (let attempt = 0; attempt < this.opts.writeAttempts && written !== chunk.length; attempt++) {
        const r = await this.request({ write: { fid, addr: offset, size: chunk.length } }, chunk)
        const body = this.body('write', path, r, '^write')
        written = body.size as number
        if (written !== chunk.length) this.opts.debug(`short write at ${offset}: ${written}/${chunk.length} committed`)
      }
      if (written !== chunk.length) throw new SysexError('write', path, 1 /* FR_DISK_ERR: persistent short write */)
      done += chunk.length
      onProgress?.(done, total)
    })
    await this.close(path, fid)

    if (!spots) {
      const back = await this.readFile(path, (n) => onProgress?.(data.length + n, total))
      if (back.length !== data.length) {
        throw new Error(`verify ${path}: wrote ${data.length} bytes but read back ${back.length} — the card copy is bad`)
      }
      for (let i = 0; i < data.length; i++) {
        if (back[i] !== data[i]) {
          throw new Error(`verify ${path}: card copy differs from what was sent, first at byte ${i}`)
        }
      }
      return
    }
    const handle = await this.openRead(path)
    try {
      if (handle.size !== data.length) {
        throw new Error(`verify ${path}: wrote ${data.length} bytes but the card reports ${handle.size} — the card copy is bad`)
      }
      for (const [start, len] of spots) {
        const back = await handle.read(start, len)
        if (back.length !== len) {
          throw new Error(`verify ${path}: could not read ${len} bytes back at ${start} — the card copy is bad`)
        }
        for (let i = 0; i < len; i++) {
          if (back[i] !== data[start + i]) {
            throw new Error(`verify ${path}: card copy differs from what was sent at byte ${start + i}`)
          }
        }
        done += len
        onProgress?.(done, total)
      }
    } finally {
      await handle.close()
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

  /**
   * Requests to keep in flight during a bulk transfer: what the firmware's
   * session grant vouches for, capped at `MAX_PIPELINE`. Always 1 until a
   * grant arrives, and both bulk paths open the file first, so by the time
   * a pool starts the session is negotiated.
   */
  private get pipeline(): number {
    return Math.min(this.session?.pipe ?? 1, MAX_PIPELINE)
  }

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
    const op = Object.keys(cmd)[0] ?? '?'
    // The reply must be for THIS request, not an abandoned attempt whose id
    // came round again: its op key must be present, and where the command
    // carries a fid/addr the reply must echo them (^write and ^read do).
    const args = (cmd as Record<string, Record<string, unknown>>)[op] ?? {}
    const matches = (r: SysexReply): boolean => {
      const body = r.json[`^${op}`] as Record<string, unknown> | undefined
      if (!body) return false
      if (args.fid !== undefined && body.fid !== undefined && body.fid !== args.fid) return false
      if (args.addr !== undefined && body.addr !== undefined && body.addr !== args.addr) return false
      return true
    }
    const started = Date.now()
    let lastError: Error | null = null
    let attempt = 0
    for (const timeout of this.opts.timeouts) {
      attempt++
      const session = await this.ensureSession()
      const range = session.midMax - session.midMin + 1
      // With a pipeline in flight, skip ids another request is waiting on.
      let msgId = session.midMin + this.counter++ % range
      for (let i = 0; this.pending.has(msgId) && i < range; i++) msgId = session.midMin + this.counter++ % range
      const frame = buildJsonFrame(msgId, cmd, binary)
      if (frame.length > MAX_REQUEST_BYTES) {
        throw new Error(`SysEx request is ${frame.length} bytes; the Deluge silently drops anything over ${MAX_REQUEST_BYTES}`)
      }
      try {
        const reply = await this.exchange(msgId, frame, timeout, matches)
        this.opts.debug(`${op} ${frame.length}B → ${Date.now() - started}ms${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
        return reply
      } catch (e) {
        lastError = e as Error
      }
    }
    this.opts.debug(`${op} gave up after ${Date.now() - started}ms and ${attempt} attempts`)
    throw lastError ?? new Error('SysEx request failed')
  }

  /**
   * Whether a reply is an answer to something *we* asked, as opposed to
   * another editor's traffic — Web MIDI is not exclusive, so every open tab
   * and app on this machine receives every reply the Deluge sends (issue #8).
   *
   * Two disjoint cases. A normal `JsonReply` carries the msgId of its
   * request, and sessions hand out disjoint blocks of seven
   * (`(sid<<3)+1 … +7`), so anything outside our block was answered to
   * somebody else. The `^session` grant is the exception: it comes back on
   * msgId 0 (`startDirect`), identical in shape whoever asked, and is told
   * apart only by the tag the firmware echoes from the request. A grant with
   * no tag at all is taken as ours — it can only come from a firmware that
   * predates the echo, and a client that rejected it would never get a
   * session.
   *
   * One known false positive: after a reconnect this is a fresh client with
   * a fresh session, so a reply still in flight for the tab's *previous*
   * session reads as a stranger's. That costs a needless advisory, never a
   * wrong write.
   */
  private isOurs(reply: SysexReply): boolean {
    if (reply.msgId === 0) {
      const body = reply.json['^session'] as { tag?: unknown } | undefined
      return !body || typeof body.tag !== 'string' || body.tag === this.opts.tag
    }
    return this.session !== null && reply.msgId >= this.session.midMin && reply.msgId <= this.session.midMax
  }

  /**
   * `{session:{tag}}` → `^session {sid, midMin, midMax}` (msgIds are
   * `(sid<<3)+1 … (sid<<3)+7`; 15 sessions, LRU-reclaimed). Only a grant
   * echoing our own tag is adopted (`isOurs`); another tab's, arriving on
   * the same msgId 0, is ignored and we keep waiting for ours. If
   * negotiation never answers, fall back to the last session's range: the
   * firmware never validates msgId ownership — `noteSessionIdUse` only marks
   * the session block as recently used — so any well-formed msgId works.
   */
  private async ensureSession(): Promise<Session> {
    if (this.session) return this.session
    for (const timeout of this.opts.timeouts) {
      try {
        const r = await this.exchange(0, buildJsonFrame(0, { session: { tag: this.opts.tag } }), timeout, (reply) =>
          '^session' in reply.json,
        )
        const body = r.json['^session'] as { midMin?: number; midMax?: number; pipe?: number } | undefined
        if (body?.midMin !== undefined && body.midMax !== undefined) {
          const pipe = typeof body.pipe === 'number' && body.pipe >= 1 ? Math.floor(body.pipe) : 1
          this.session = { midMin: body.midMin, midMax: body.midMax, pipe }
          return this.session
        }
      } catch {
        // try again; fall through to the fallback after the ladder
      }
    }
    // A firmware that never answered has told us nothing about its ring: serial.
    this.session = { midMin: (15 << 3) + 1, midMax: (15 << 3) + 7, pipe: 1 }
    return this.session
  }

  private exchange(
    msgId: number,
    frame: Uint8Array,
    timeout: number,
    matches: (r: SysexReply) => boolean = () => true,
  ): Promise<SysexReply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msgId)
        reject(new Error(`no reply to msgId 0x${msgId.toString(16)} after ${timeout}ms`))
      }, timeout)
      this.pending.set(msgId, {
        matches,
        resolve: (reply) => {
          clearTimeout(timer)
          resolve(reply)
        },
      })
      this.send(frame)
    })
  }
}
