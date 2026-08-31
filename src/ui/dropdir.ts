/**
 * Reading a drag-and-drop of sample folders. The drag-and-drop directory API
 * is callback-based and batches `readEntries` at 100 per call (Chrome), so
 * this wraps it: give it the DataTransfer, get the WAV files with their
 * paths relative to the dropped folder. A drop with no directory and no WAV
 * files returns null — the caller treats that as a preset-file drop.
 */

export interface DroppedSample {
  /** Path under the dropped folder: `Kick.wav`, `sub/Kick.wav`. */
  relPath: string
  file: File
}

export interface DroppedSamples {
  /** The dropped folder's name; null when loose WAV files were dropped. */
  folder: string | null
  files: DroppedSample[]
}

const readAllEntries = (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => {
    const reader = dir.createReader()
    const all: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all)
        all.push(...batch)
        next() // Chrome hands out at most 100 entries per call
      }, reject)
    next()
  })

const entryFile = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject))

async function walk(entry: FileSystemEntry, prefix: string, out: DroppedSample[]): Promise<void> {
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry)
    out.push({ relPath: `${prefix}${entry.name}`, file })
  } else if (entry.isDirectory) {
    for (const e of await readAllEntries(entry as FileSystemDirectoryEntry)) {
      await walk(e, `${prefix}${entry.name}/`, out)
    }
  }
}

export async function collectDroppedSamples(dt: DataTransfer): Promise<DroppedSamples | null> {
  const entries = [...dt.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => e !== null && e !== undefined)
  const dirs = entries.filter((e): e is FileSystemDirectoryEntry => e.isDirectory)
  const looseWavs = entries.filter((e): e is FileSystemFileEntry => e.isFile && /\.wav$/i.test(e.name))
  if (dirs.length === 0 && looseWavs.length === 0) return null

  const files: DroppedSample[] = []
  // The first folder names the kit's sample folder; its files sit at its
  // root, further folders keep their own name as a sub-path.
  for (const [i, dir] of dirs.entries()) {
    for (const e of await readAllEntries(dir)) await walk(e, i === 0 ? '' : `${dir.name}/`, files)
  }
  for (const f of looseWavs) files.push({ relPath: f.name, file: await entryFile(f) })
  return { folder: dirs[0]?.name ?? null, files }
}
