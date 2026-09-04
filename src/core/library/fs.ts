/**
 * The card as the library code sees it: six operations over paths in the
 * SysEx protocol's form (`/SAMPLES/Drums/Kick.wav`, leading slash). The
 * editor's Web MIDI store adapts `SmsClient` to this; tests adapt the fake
 * Deluge. Nothing here knows about MIDI beyond recognising its error type.
 */

import { SysexError } from '../sysex'

/**
 * Why a card operation failed, as far as the two backends can tell apart.
 * `notFound` is the one code callers act on — a root that isn't there is an
 * empty root, a folder that isn't there has no samples — so it must never be
 * inferred from anything else: a timed-out listing or a disk error is `io`,
 * and reporting it as absence would let a delete through on an index that
 * is missing a whole root (`move.ts` `deleteProblem`).
 */
export type CardErrorCode =
  | 'notFound' // FatFS FR_NO_FILE / FR_NO_PATH, or no such entry on a mounted card
  | 'exists' // FR_EXIST: the destination name is taken
  | 'notAFile' // a read of a folder
  | 'verify' // the bytes read back after a write differ from what was sent
  | 'io' // anything else: disk error, timeout, no reply

export class CardError extends Error {
  constructor(
    public readonly code: CardErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'CardError'
  }
}

const FR_NO_FILE = 4
const FR_NO_PATH = 5
const FR_EXIST = 8

/** The `CardErrorCode` for a FatFS result code. */
export const cardErrorCode = (fresult: number): CardErrorCode =>
  fresult === FR_NO_FILE || fresult === FR_NO_PATH ? 'notFound' : fresult === FR_EXIST ? 'exists' : 'io'

/**
 * Whether `e` says the path is not on the card — a `CardError` from either
 * backend, or a raw `SysexError` from a client used directly (the card store's
 * `listPath`). Anything else, a timeout included, is not absence.
 */
export const isNotFound = (e: unknown): boolean =>
  (e instanceof CardError && e.code === 'notFound') ||
  (e instanceof SysexError && (e.code === FR_NO_FILE || e.code === FR_NO_PATH))

export interface CardEntry {
  name: string
  size: number
  /** FatFS `fdate`/`ftime` words, as `^dir` reports them — a change detector, nothing more. */
  date: number
  time: number
  dir: boolean
}

export type CardProgress = (done: number, total: number) => void

/** An open file for ranged reads — a WAV header without the audio behind it. Always `close()`. */
export interface RangedFile {
  size: number
  /** Up to `length` bytes at `offset`; shorter only at end of file. */
  read(offset: number, length: number): Promise<Uint8Array>
  close(): Promise<void>
}

export interface CardFS {
  /** The folder's entries; throws when it does not exist. */
  list(path: string): Promise<CardEntry[]>
  read(path: string, onProgress?: CardProgress): Promise<Uint8Array>
  reader(path: string): Promise<RangedFile>
  /** Create or truncate, write, verify. */
  write(path: string, data: Uint8Array, onProgress?: CardProgress): Promise<void>
  /** FatFS `f_rename`: a file or a folder, across folders; fails if `to` exists. */
  rename(from: string, to: string): Promise<void>
  /** FatFS `f_unlink`: a file, or an empty folder. */
  remove(path: string): Promise<void>
  /** One level; succeeds when the folder is already there. */
  mkdir(path: string): Promise<void>
}

/** `/SAMPLES/Drums/Kick.wav` → `/SAMPLES/Drums`; `/SAMPLES` → `/`. */
export const parentOf = (path: string): string => {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

/** `/SAMPLES/Drums/Kick.wav` → `Kick.wav`. */
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

export const joinPath = (dir: string, name: string): string => (dir === '/' ? `/${name}` : `${dir}/${name}`)

/** The protocol form of a path the XML carries: one leading slash. */
export const cardPath = (p: string): string => `/${p.replace(/\\/g, '/').replace(/^\/+/, '')}`

/** The XML form of a card path: no leading slash. */
export const xmlPath = (p: string): string => p.replace(/^\/+/, '')

/**
 * Bytes to text and back without loss. A file the Deluge wrote is UTF-8 —
 * or, for a name the card holds in some other code page, not quite; that
 * file is carried as latin1 so every byte comes back where it was, and only
 * its non-ASCII characters read oddly on screen.
 */
export interface XmlText {
  text: string
  encoding: 'utf-8' | 'latin1'
}

export function decodeXml(bytes: Uint8Array): XmlText {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('latin1').decode(bytes), encoding: 'latin1' }
  }
}

export function encodeXml(text: string, encoding: XmlText['encoding']): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(text)
  return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff)
}
