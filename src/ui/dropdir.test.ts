/**
 * Reading a dropped folder through the callback-based directory API. The
 * entries are plain objects shaped like the browser's — `isFile`,
 * `isDirectory`, `createReader().readEntries(ok)`, `file(ok)` — asynchronous
 * and batched the way Chrome hands them out, which is what the wrapper is for.
 */
import { describe, expect, it } from 'vitest'
import { collectDroppedSamples } from './dropdir'

interface FakeEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (ok: (f: File) => void) => void
  createReader?: () => { readEntries: (ok: (e: FakeEntry[]) => void, err?: (e: unknown) => void) => void }
}

const fileEntry = (name: string): FakeEntry => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok) => queueMicrotask(() => ok(new File(['x'], name))),
})

/** A folder whose reader pages `batch` entries per call and is empty once drained, as Chrome's is. */
const dirEntry = (name: string, entries: FakeEntry[], batch = 100): FakeEntry => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader() {
    let at = 0
    return {
      readEntries(ok) {
        const page = entries.slice(at, at + batch)
        at += page.length
        queueMicrotask(() => ok(page))
      },
    }
  },
})

const transfer = (...entries: (FakeEntry | null)[]): DataTransfer =>
  ({ items: entries.map((e) => ({ webkitGetAsEntry: () => e })), files: [] }) as unknown as DataTransfer

const names = (r: Awaited<ReturnType<typeof collectDroppedSamples>>) => r!.files.map((f) => f.relPath)

describe('collectDroppedSamples', () => {
  it('a dropped folder names the import and its files sit at the root', async () => {
    const r = await collectDroppedSamples(transfer(dirEntry('Piano', [fileEntry('C3.wav'), fileEntry('C4.wav')])))
    expect(r!.folder).toBe('Piano')
    expect(names(r)).toEqual(['C3.wav', 'C4.wav'])
    expect(r!.files[0].file.name).toBe('C3.wav')
  })

  it('keeps a sub-folder as a sub-path, and a second dropped folder keeps its own name', async () => {
    const piano = dirEntry('Piano', [fileEntry('C3.wav'), dirEntry('soft', [fileEntry('C3 soft.wav')])])
    const strings = dirEntry('Strings', [fileEntry('A3.wav')])
    const r = await collectDroppedSamples(transfer(piano, strings))
    expect(r!.folder).toBe('Piano')
    expect(names(r)).toEqual(['C3.wav', 'soft/C3 soft.wav', 'Strings/A3.wav'])
  })

  it('reads past the 100-entry page the browser hands out per call', async () => {
    const many = Array.from({ length: 250 }, (_, i) => fileEntry(`s${String(i).padStart(3, '0')}.wav`))
    const r = await collectDroppedSamples(transfer(dirEntry('Big', many, 100)))
    expect(names(r)).toHaveLength(250)
    expect(names(r).at(-1)).toBe('s249.wav')
  })

  it('does not filter inside a folder: what is not a WAV is the caller\'s to leave out', async () => {
    const r = await collectDroppedSamples(transfer(dirEntry('Piano', [fileEntry('notes.txt')])))
    expect(r!.folder).toBe('Piano')
    expect(names(r)).toEqual(['notes.txt'])
  })

  it('loose WAV files are an import with no folder; anything else dropped alone is not', async () => {
    const r = await collectDroppedSamples(transfer(fileEntry('Kick.WAV'), fileEntry('Snare.wav'), fileEntry('readme.txt')))
    expect(r!.folder).toBeNull()
    expect(names(r)).toEqual(['Kick.WAV', 'Snare.wav'])
    // no folder and no WAV: the caller treats the drop as a preset file
    expect(await collectDroppedSamples(transfer(fileEntry('Default Synth.XML')))).toBeNull()
    expect(await collectDroppedSamples(transfer(null))).toBeNull()
    expect(await collectDroppedSamples(transfer())).toBeNull()
  })

  it('survives an item with no entry API at all', async () => {
    const dt = { items: [{}], files: [] } as unknown as DataTransfer
    expect(await collectDroppedSamples(dt)).toBeNull()
  })
})
