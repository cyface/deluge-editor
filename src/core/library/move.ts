/**
 * Moving, renaming and deleting samples on the card with the files that
 * name them kept true.
 *
 * A move is the sample first, then the references: `f_rename` is one
 * operation the card either does or doesn't, and everything after it is a
 * rewrite of text this code can retry. Each referencing file is rewritten
 * beside itself and swapped in — `X.XML.tmp` written and verified,
 * `X.XML` → `X.XML.bak`, tmp → `X.XML`, bak removed — so there is no moment
 * at which a song exists on the card truncated: an interrupted transfer
 * leaves the original where it was, or a complete new copy under the right
 * name with a `.bak` beside it. The Deluge's browsers list only `.XML`
 * (`Browser::readFileItemsForFolder` keeps a file only when its extension
 * is in `allowedFileExtensionsXML`, `gui/ui/browser/browser.cpp:67` and
 * `:305-320`, upstream/community b6062d7), so a leftover never shows up on
 * the instrument.
 *
 * What a failure looks like is part of the contract: `applyMove` moves the
 * sample or throws with nothing changed, and then reports per file which
 * references it updated and which it could not, so the panel can say
 * exactly which files still carry the old path.
 *
 * The three folders the instrument records into — `SAMPLES/CLIPS`,
 * `SAMPLES/RECORD`, `SAMPLES/RESAMPLE` (`storage/audio/audio_file_manager.h:44`,
 * upstream/community b6062d7) — are not renamed, moved or deleted from
 * here: the firmware recreates them, and a song saved with "collect media"
 * expects to find them.
 */

import { baseName, cardPath, decodeXml, encodeXml, joinPath, parentOf, type CardFS } from './fs'
import { renamedRef, rewriteSampleRefs, samePath, underFolder, type TargetKind } from './refs'
import { usagesOf, type ReferenceIndex } from './usages'

export const SAMPLES_ROOT = '/SAMPLES'

/** Folders the firmware records into; left alone. */
export const RECORDING_FOLDERS = ['/SAMPLES/CLIPS', '/SAMPLES/RECORD', '/SAMPLES/RESAMPLE'] as const

export const isRecordingFolder = (path: string): boolean => RECORDING_FOLDERS.some((f) => samePath(f, path))

/** Characters FAT refuses in one name segment, plus the firmware's own filter. */
const BAD_NAME = /[\\/:*?"<>|]/

/** Why a name can't be used, or null when it can. */
export function nameProblem(name: string): string | null {
  if (!name.trim()) return 'a name is needed'
  if (name !== name.trim()) return 'a name cannot start or end with a space'
  if (BAD_NAME.test(name)) return 'a name cannot contain \\ / : * ? " < > |'
  if (name === '.' || name === '..') return 'not a name'
  return null
}

export interface MovePlan {
  kind: TargetKind
  /** Protocol form, `/SAMPLES/…`. */
  from: string
  to: string
  /** The files whose references will be rewritten, path order. */
  files: string[]
}

/**
 * What moving `from` to `to` would touch, or a reason it can't be done.
 * Both paths are the full new locations: a rename keeps the folder, a move
 * keeps the name.
 */
export function planMove(index: ReferenceIndex, from: string, to: string, kind: TargetKind): MovePlan | string {
  from = cardPath(from)
  to = cardPath(to)
  if (!underFolder(from, SAMPLES_ROOT) || samePath(from, SAMPLES_ROOT)) return `${from} is not a sample`
  if (!underFolder(to, SAMPLES_ROOT) || samePath(to, SAMPLES_ROOT)) return 'samples have to stay under SAMPLES/'
  if (isRecordingFolder(from)) return `${baseName(from)} is where the Deluge records — leave it where it is`
  if (from === to) return 'that is where it already is' // a change of case alone is a rename FAT allows
  if (kind === 'folder' && underFolder(to, from)) return 'a folder cannot be moved into itself'
  const problem = nameProblem(baseName(to))
  if (problem) return problem
  return { kind, from, to, files: usagesOf(index, from, kind) }
}

export interface MoveOutcome {
  /** Files rewritten and swapped in. */
  updated: string[]
  /** Files that named the sample in the index but not in their current text. */
  unchanged: string[]
  /** Files whose rewrite failed; each still holds the old path. */
  failed: { path: string; error: string }[]
}

export type MoveProgress = (label: string, fraction: number) => void

/** `mkdir` every level of `dir` that is missing, top down. */
export async function ensureFolder(fs: CardFS, dir: string): Promise<void> {
  const parts = dir.split('/').filter(Boolean)
  let at = ''
  for (const p of parts) {
    at = `${at}/${p}`
    await fs.mkdir(at)
  }
}

/** Rewrite one file's references, swapped in beside itself; returns how many references changed. */
async function rewriteFile(fs: CardFS, path: string, plan: MovePlan, onProgress?: MoveProgress): Promise<number> {
  const name = baseName(path)
  const { text, encoding } = decodeXml(await fs.read(path, (d, t) => onProgress?.(`Reading ${name}`, t ? d / t / 3 : 0)))
  const { xml, count } = rewriteSampleRefs(text, plan.from, plan.to, plan.kind)
  if (count === 0) return 0
  const tmp = `${path}.tmp`
  const bak = `${path}.bak`
  try {
    await fs.write(tmp, encodeXml(xml, encoding), (d, t) => onProgress?.(`Writing ${name}`, 1 / 3 + (t ? d / t / 3 : 0)))
  } catch (e) {
    await fs.remove(tmp).catch(() => {})
    throw e
  }
  onProgress?.(`Swapping in ${name}`, 2 / 3)
  await fs.remove(bak).catch(() => {}) // a leftover from an interrupted earlier swap
  await fs.rename(path, bak)
  try {
    await fs.rename(tmp, path)
  } catch (e) {
    await fs.rename(bak, path).catch(() => {}) // put the original back under its name
    throw e
  }
  await fs.remove(bak).catch(() => {}) // harmless if it stays: the Deluge lists only .XML
  return count
}

/**
 * Do the move. Throws, with nothing on the card changed, if the sample
 * itself cannot be moved; after that every referencing file is attempted
 * and the outcome says which were not.
 */
export async function applyMove(fs: CardFS, plan: MovePlan, onProgress?: MoveProgress): Promise<MoveOutcome> {
  onProgress?.(`Moving ${baseName(plan.from)}`, 0)
  await ensureFolder(fs, parentOf(plan.to))
  // One `f_rename`, across folders or not. It refuses a name already in use
  // (FR_EXIST) — except the entry being renamed itself, so `Kick.wav` →
  // `kick.wav` goes through as a plain rename (`src/fatfs/ff.c:5208-5213`).
  await fs.rename(plan.from, plan.to)
  const outcome: MoveOutcome = { updated: [], unchanged: [], failed: [] }
  const n = plan.files.length
  for (const [i, path] of plan.files.entries()) {
    try {
      const count = await rewriteFile(fs, path, plan, (label, f) => onProgress?.(label, (i + f) / n))
      ;(count > 0 ? outcome.updated : outcome.unchanged).push(path)
    } catch (e) {
      outcome.failed.push({ path, error: e instanceof Error ? e.message : String(e) })
    }
  }
  onProgress?.('', 1)
  return outcome
}

/** The index as it reads after a move — the updated files' references renamed, sizes left to the next scan. */
export function applyMoveToIndex(index: ReferenceIndex, plan: MovePlan, outcome: MoveOutcome): ReferenceIndex {
  const next: ReferenceIndex = new Map(index)
  for (const path of outcome.updated) {
    const f = index.get(path)
    if (!f) continue
    next.set(path, { ...f, size: -1, refs: f.refs.map((r) => renamedRef(r, plan.from, plan.to, plan.kind) ?? r) })
  }
  return next
}

/** Why `path` can't be deleted, or null. Deleting is refused while anything names it. */
export function deleteProblem(index: ReferenceIndex, path: string, kind: TargetKind): string | null {
  path = cardPath(path)
  if (!underFolder(path, SAMPLES_ROOT) || samePath(path, SAMPLES_ROOT)) return `${path} is not a sample`
  if (isRecordingFolder(path)) return `${baseName(path)} is where the Deluge records — leave it where it is`
  const used = usagesOf(index, path, kind)
  if (used.length) return `${baseName(path)} is used by ${used.length} file${used.length === 1 ? '' : 's'}`
  return null
}

/** Remove a file, or a folder and everything under it. Reports each entry as it goes. */
export async function deleteTree(fs: CardFS, path: string, kind: TargetKind, onProgress?: (label: string) => void): Promise<number> {
  path = cardPath(path)
  if (kind === 'file') {
    onProgress?.(`Deleting ${baseName(path)}`)
    await fs.remove(path)
    return 1
  }
  let n = 0
  for (const e of await fs.list(path)) {
    n += await deleteTree(fs, joinPath(path, e.name), e.dir ? 'folder' : 'file', onProgress)
  }
  onProgress?.(`Deleting ${baseName(path)}/`)
  await fs.remove(path)
  return n
}
