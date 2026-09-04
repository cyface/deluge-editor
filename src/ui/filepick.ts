/**
 * The hidden `<input type="file">` half of "On This Computer…". The inputs
 * themselves stay in each component — tests reach them by test id — and
 * these read what one delivered and hand it on in the shape the stores take.
 */

/** A file inside a picked folder, as `kit.addLocalSamples` and `multisample.addLocalFolder` take it. */
export interface PickedFile {
  /** The path inside the folder, `sub/…/file.wav`. */
  relPath: string
  file: File
}

/**
 * The files a change event delivered. The input is reset so choosing the same
 * file again fires another change.
 */
export function takeFiles(e: Event): File[] {
  const input = e.currentTarget as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  return files
}

/**
 * A `webkitdirectory` pick as a folder: `webkitRelativePath` is
 * `<folder>/<sub…>/<file>`, so the first segment names the folder and the
 * rest is the file's place in it. `null` when nothing was picked.
 */
export function pickedFolder(files: File[], fallback: string): { folder: string; files: PickedFile[] } | null {
  if (files.length === 0) return null
  const folder = files[0].webkitRelativePath.split('/')[0] || fallback
  return {
    folder,
    files: files.map((file) => ({ relPath: file.webkitRelativePath.split('/').slice(1).join('/') || file.name, file })),
  }
}
