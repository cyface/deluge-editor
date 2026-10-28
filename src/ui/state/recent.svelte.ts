/**
 * Open › Recent: the presets opened or saved lately, newest first, so the
 * one you were working on is a click away instead of a walk through the
 * card's folders again.
 *
 * Two kinds, by where the file lives:
 *
 * - **On the Deluge**, kept by card path (`/KITS/DEPECHEMODE.XML`). Opening
 *   one connects if need be and reads that path; a path the card no longer
 *   has drops out of the list.
 * - **On this computer**, kept by the browser's file handle (File System
 *   Access, Chrome and Edge). A handle reads the file as it is on disk now,
 *   not a copy from when it was opened; the browser asks again for read
 *   permission after a reload. A file that arrived without a handle (the
 *   plain file input, a browser without the API) cannot be reopened, so it
 *   is not listed.
 *
 * Handles cannot go in localStorage, so the list lives in IndexedDB. Without
 * IndexedDB (tests, a locked-down browser) it lasts for the session only.
 * Nothing here opens anything: `start.ts` (`openRecent`) does, under the same
 * replace-the-preset questions as every other open.
 */

/** A file handle, as far as this list uses one; lib.dom lags the spec on the permission calls. */
export interface RecentHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  isSameEntry(other: RecentHandle): Promise<boolean>
  queryPermission?(opts: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(opts: { mode: 'read' }): Promise<PermissionState>
}

export type RecentEntry =
  | { kind: 'deluge'; path: string; name: string; at: number }
  | { kind: 'computer'; name: string; handle: RecentHandle; at: number }

/** How many the menu lists. */
export const RECENT_MAX = 8

/** Whether two entries are the same file: the same card path (FAT ignores case), or the same handle. */
async function same(a: RecentEntry, b: RecentEntry): Promise<boolean> {
  if (a.kind === 'deluge' && b.kind === 'deluge') return a.path.toLowerCase() === b.path.toLowerCase()
  if (a.kind === 'computer' && b.kind === 'computer') {
    try {
      return await a.handle.isSameEntry(b.handle)
    } catch {
      return false
    }
  }
  return false
}

/** `entry` at the front of `list`, any older mention of the same file removed, cut to `RECENT_MAX`. */
export async function withEntry(list: readonly RecentEntry[], entry: RecentEntry): Promise<RecentEntry[]> {
  const rest: RecentEntry[] = []
  for (const e of list) if (!(await same(e, entry))) rest.push(e)
  return [entry, ...rest].slice(0, RECENT_MAX)
}

const DB = 'deluge-editor'
const STORE = 'kv'
const KEY = 'recent'

function db(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function read(): Promise<RecentEntry[]> {
  const open = db()
  if (!open) return []
  const d = await open
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as RecentEntry[]) : [])
    req.onerror = () => reject(req.error)
  })
}

async function write(list: RecentEntry[]): Promise<void> {
  const open = db()
  if (!open) return
  const d = await open
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(list, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

class Recent {
  /** Newest first. Raw, not a deep proxy: a file handle must reach IndexedDB as itself. */
  entries = $state.raw<RecentEntry[]>([])
  /** Changes made before the stored list has loaded wait for it, so a restore never overwrites them. */
  private ready: Promise<void>

  constructor() {
    this.ready = read()
      .then((stored) => {
        this.entries = stored
      })
      .catch(() => {}) // unreadable storage: start empty, as a first visit does
  }

  /** A preset just opened from, or saved to, the card at `path`. */
  addDeluge(path: string): Promise<void> {
    return this.add({ kind: 'deluge', path, name: path.slice(path.lastIndexOf('/') + 1), at: Date.now() })
  }

  /** A preset just opened from this computer, through a handle that can read it again. */
  addComputer(handle: RecentHandle): Promise<void> {
    return this.add({ kind: 'computer', name: handle.name, handle, at: Date.now() })
  }

  async remove(entry: RecentEntry): Promise<void> {
    await this.ready
    this.entries = this.entries.filter((e) => e !== entry)
    await this.save()
  }

  async clear(): Promise<void> {
    await this.ready
    this.entries = []
    await this.save()
  }

  private async add(entry: RecentEntry): Promise<void> {
    await this.ready
    this.entries = await withEntry(this.entries, entry)
    await this.save()
  }

  private async save(): Promise<void> {
    try {
      await write(this.entries)
    } catch {
      // Storage full or blocked: the list still works for this session.
    }
  }
}

export const recent = new Recent()
