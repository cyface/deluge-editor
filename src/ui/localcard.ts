/**
 * A Deluge card in a reader, as a `CardFS` — the same six operations the
 * library runs over SysEx, over the browser's File System Access API
 * (`showDirectoryPicker`, Chrome and Edge, the same browsers Web MIDI
 * needs). A card of songs that takes minutes to index at SysEx speed takes
 * seconds from a reader.
 *
 * Paths are the protocol's (`/SAMPLES/Drums/Kick.wav`); each segment is
 * looked up exactly first and then case-insensitively, because a FAT card
 * matches names either way and the XML may spell a folder differently
 * from the disk. Renames use the handle's `move()` where the browser has
 * it (Chrome 111+, files only) and fall back to copy-then-remove — which is
 * also what a folder move is, since no browser moves a directory handle.
 * Like `f_rename`, a rename refuses a name already in use, except the
 * entry's own name in other capitalisation. Failures are `CardError`s with
 * the same codes the SysEx backend reports, so the library treats a card
 * in a reader exactly as it treats one in the Deluge.
 *
 * Lives beside `dropdir.ts` rather than in `src/core/`: it is bound to a
 * browser API that happy-dom does not provide. The handle surface is
 * structural, so `localcard.test.ts` runs it over an in-memory tree; the
 * browser's own implementation is exercised end to end against Chrome's
 * origin-private file system (`tests/e2e/`).
 */

import { CardError, type CardEntry, type CardFS, type CardProgress, type RangedFile } from '../core/library'

/** The handle surface used here; lib.dom lags the spec on `entries()` and `move()`. */
interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>
  isSameEntry(other: FileHandle | DirHandle): Promise<boolean>
  move?(target: DirHandle | string, name?: string): Promise<void>
}
interface DirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterable<[string, FileHandle | DirHandle]>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>
  isSameEntry(other: FileHandle | DirHandle): Promise<boolean>
}

type PickerWindow = Window & { showDirectoryPicker?: (opts: { mode: 'readwrite'; id?: string }) => Promise<DirHandle> }

/** Whether this browser can open a folder for reading and writing. */
export const canMountCard = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function'

const segments = (path: string): string[] => path.split('/').filter(Boolean)

const notFound = (path: string): CardError => new CardError('notFound', `${path}: no such file or folder on the card`)
const notAFile = (path: string): CardError => new CardError('notAFile', `${path} is a folder`)

/** A directory's child by name, exact first, then case-insensitively; null when absent. */
async function childOf(dir: DirHandle, name: string): Promise<FileHandle | DirHandle | null> {
  try {
    return await dir.getDirectoryHandle(name)
  } catch {
    // not a folder by that exact name
  }
  try {
    return await dir.getFileHandle(name)
  } catch {
    // not a file by that exact name either
  }
  const want = name.toLowerCase()
  for await (const [n, h] of dir.entries()) if (n.toLowerCase() === want) return h
  return null
}

async function dirAt(root: DirHandle, path: string): Promise<DirHandle> {
  let at = root
  for (const seg of segments(path)) {
    const next = await childOf(at, seg)
    if (!next || next.kind !== 'directory') throw notFound(path)
    at = next
  }
  return at
}

async function entryAt(root: DirHandle, path: string): Promise<FileHandle | DirHandle> {
  const parts = segments(path)
  if (parts.length === 0) return root
  const dir = await dirAt(root, `/${parts.slice(0, -1).join('/')}`)
  const h = await childOf(dir, parts[parts.length - 1])
  if (!h) throw notFound(path)
  return h
}

const split = (path: string): { dir: string; name: string } => {
  const parts = segments(path)
  return { dir: `/${parts.slice(0, -1).join('/')}`, name: parts[parts.length - 1] ?? '' }
}

/**
 * Create or truncate, write, then read the file back and compare — the same
 * bar the SysEx client holds a save to (`SmsClient.writeFile`, 'full'): a
 * reader that lies about a write, or a card that drops bytes, must not be
 * reported as "N files updated".
 */
async function writeWhole(dir: DirHandle, name: string, data: Uint8Array, path: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(data)
  await w.close()
  const back = new Uint8Array(await (await fh.getFile()).arrayBuffer())
  if (back.length !== data.length) {
    throw new CardError('verify', `verify ${path}: wrote ${data.length} bytes but read back ${back.length} — the card copy is bad`)
  }
  for (let i = 0; i < data.length; i++) {
    if (back[i] !== data[i]) throw new CardError('verify', `verify ${path}: card copy differs from what was sent, first at byte ${i}`)
  }
}

async function copyTree(from: FileHandle | DirHandle, intoDir: DirHandle, name: string, path: string): Promise<void> {
  if (from.kind === 'file') {
    await writeWhole(intoDir, name, new Uint8Array(await (await from.getFile()).arrayBuffer()), path)
    return
  }
  const target = await intoDir.getDirectoryHandle(name, { create: true })
  for await (const [n, h] of from.entries()) await copyTree(h, target, n, `${path}/${n}`)
}

/**
 * Pick the card's root folder. Null when the person cancelled; throws when
 * the folder is not a Deluge card — no `SAMPLES/` beside a `SONGS/`, `KITS/`
 * or `SYNTHS/` — so the library never indexes a random folder.
 */
export async function pickCardRoot(): Promise<DirHandle | null> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) throw new Error('this browser cannot open a folder for writing — use Chrome or Edge')
  let root: DirHandle
  try {
    root = await picker.call(window, { mode: 'readwrite', id: 'deluge-card' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
  const has = async (name: string): Promise<boolean> => (await childOf(root, name))?.kind === 'directory'
  if (!(await has('SAMPLES')) || !((await has('SONGS')) || (await has('KITS')) || (await has('SYNTHS')))) {
    throw new Error(`${root.name} is not a Deluge card: it needs a SAMPLES folder beside SONGS, KITS or SYNTHS`)
  }
  return root
}

export function localFS(root: DirHandle): CardFS {
  return {
    async list(path): Promise<CardEntry[]> {
      const dir = await dirAt(root, path)
      const out: CardEntry[] = []
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') {
          out.push({ name, size: 0, date: 0, time: 0, dir: true })
        } else {
          // lastModified stands in for FAT's date/time words as the change detector.
          const f = await h.getFile()
          out.push({ name, size: f.size, date: Math.floor(f.lastModified / 1000), time: f.lastModified % 1000, dir: false })
        }
      }
      return out
    },
    async read(path, onProgress?: CardProgress) {
      const h = await entryAt(root, path)
      if (h.kind !== 'file') throw notAFile(path)
      const f = await h.getFile()
      const bytes = new Uint8Array(await f.arrayBuffer())
      onProgress?.(bytes.length, bytes.length)
      return bytes
    },
    async reader(path): Promise<RangedFile> {
      const h = await entryAt(root, path)
      if (h.kind !== 'file') throw notAFile(path)
      const f = await h.getFile()
      return {
        size: f.size,
        read: async (offset, length) => new Uint8Array(await f.slice(offset, offset + length).arrayBuffer()),
        close: async () => {},
      }
    },
    async write(path, data, onProgress?: CardProgress) {
      const { dir, name } = split(path)
      await writeWhole(await dirAt(root, dir), name, data, path)
      onProgress?.(data.length, data.length)
    },
    async rename(from, to) {
      const src = await entryAt(root, from)
      const { dir: toDir, name: toName } = split(to)
      const dest = await dirAt(root, toDir)
      const taken = await childOf(dest, toName)
      if (taken && !(await taken.isSameEntry(src))) throw new CardError('exists', `${to} already exists`)
      if (src.kind === 'file' && typeof src.move === 'function') {
        await src.move(dest, toName)
        return
      }
      // No move on this handle (a folder, or an older browser): copy, then remove.
      const { dir: fromDir, name: fromName } = split(from)
      if (taken) {
        // Only the case differs: go through a temporary name so the copy never lands on itself.
        const via = `${fromName}.renaming`
        await copyTree(src, dest, via, `${toDir}/${via}`)
        await (await dirAt(root, fromDir)).removeEntry(fromName, { recursive: true })
        const tmp = await childOf(dest, via)
        if (!tmp) throw notFound(`${toDir}/${via}`)
        await copyTree(tmp, dest, toName, to)
        await dest.removeEntry(via, { recursive: true })
        return
      }
      await copyTree(src, dest, toName, to)
      await (await dirAt(root, fromDir)).removeEntry(fromName, { recursive: true })
    },
    async remove(path) {
      const { dir, name } = split(path)
      const parent = await dirAt(root, dir)
      const h = await childOf(parent, name)
      if (!h) throw notFound(path)
      await parent.removeEntry(h.name)
    },
    async mkdir(path) {
      const { dir, name } = split(path)
      await (await dirAt(root, dir)).getDirectoryHandle(name, { create: true })
    },
  }
}
