import { describe, expect, it } from 'vitest'
import kitFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import rangesFixture from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { rig as sysexRig } from '../../../tests/helpers/rig'
import type { FakeDeluge } from '../sysex/fake-deluge'
import { SysexError } from '../sysex/client'
import { CardError, decodeXml, isNotFound, type CardFS } from './fs'
import { applyMove, applyMoveToIndex, deleteProblem, deleteTree, planMove, type MovePlan } from './move'
import { referencedPaths } from './refs'
import { scanReferences, type ScanProgress } from './scan'
import { smsFS } from './sms'
import { indexFromJSON, indexToJSON, usageCounts, usagesOf, type ReferenceIndex } from './usages'

/** A fake card with the fixtures on it, through the real client. */
function rig(): { fs: CardFS; fake: FakeDeluge; text: (p: string) => string } {
  const { client, fake } = sysexRig()
  fake.putFile('/KITS/Fixtures Kit.XML', kitFixture)
  fake.putFile('/SYNTHS/Piano.XML', rangesFixture)
  fake.putFile('/SYNTHS/Sub/Init.XML', synthTemplate)
  fake.putFile('/SONGS/Notes.txt', 'not a preset')
  for (const f of ['kick', 'snare', 'hat-closed', 'hat-open', 'crash', 'range-low', 'range-high', 'unused']) {
    fake.putFile(`/SAMPLES/Fixtures/${f}.wav`, `RIFF${f}`)
  }
  fake.putFile('/SAMPLES/Fixtures/Sub/deep.wav', 'RIFFdeep')
  return { fs: smsFS(client), fake, text: (p) => decodeXml(fake.files.get(p)!).text }
}

describe('scanReferences', () => {
  it('indexes every XML under SONGS, KITS and SYNTHS, recursively, and nothing else', async () => {
    const { fs } = rig()
    const index = await scanReferences(fs)
    expect([...index.keys()]).toEqual(['/KITS/Fixtures Kit.XML', '/SYNTHS/Piano.XML', '/SYNTHS/Sub/Init.XML'])
    expect(index.get('/KITS/Fixtures Kit.XML')!.refs).toEqual(referencedPaths(kitFixture))
    expect(index.get('/SYNTHS/Sub/Init.XML')!.refs).toEqual([])
  })

  it('re-reads only files whose listing entry changed', async () => {
    const { fs, fake } = rig()
    const first = await scanReferences(fs)
    const reads = () => fake.requests.filter((r) => r.open && !(r.open as { write: number }).write).length
    const before = reads()
    const progress: ScanProgress[] = []
    const again = await scanReferences(fs, first, (p) => progress.push(p))
    expect(reads()).toBe(before) // nothing changed: nothing read
    expect(again).toEqual(first)
    expect(progress.some((p) => p.phase === 'reading' && p.total === 0)).toBe(true)

    fake.putFile('/SYNTHS/Piano.XML', rangesFixture.replace('SAMPLES/Fixtures/range-low.wav', 'SAMPLES/P/low.wav'))
    const third = await scanReferences(fs, again)
    expect(reads()).toBe(before + 1)
    expect(third.get('/SYNTHS/Piano.XML')!.refs).toContain('SAMPLES/P/low.wav')
  })

  it('a card without SONGS still indexes the rest', async () => {
    const { fs, fake } = rig()
    fake.files.delete('/SONGS/Notes.txt')
    fake.dirs.delete('/SONGS')
    expect((await scanReferences(fs)).size).toBe(3)
  })

  it('a listing that fails for any other reason rejects the scan rather than indexing an empty root', async () => {
    // FR_DISK_ERR on every `dir`: an index built anyway would say every
    // sample is used by 0 files, and deleteProblem would let a delete through.
    const { client, fake } = sysexRig({ failDir: 1 })
    fake.putFile('/KITS/Fixtures Kit.XML', kitFixture)
    const err = await scanReferences(smsFS(client)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CardError)
    expect((err as CardError).code).toBe('io')
    expect((err as CardError).message).toContain('FR_DISK_ERR')
    expect(isNotFound(err)).toBe(false)
  })

  it('a listing that times out rejects too', async () => {
    const { client, fake } = sysexRig({ dropRequests: 99 }, { timeouts: [10, 10] })
    fake.putFile('/KITS/Fixtures Kit.XML', kitFixture)
    const err = await scanReferences(smsFS(client)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CardError)
    expect((err as CardError).code).toBe('io')
  })
})

describe('smsFS errors', () => {
  it('turns FatFS codes into CardError codes, keeping the SysexError as the cause', async () => {
    const { fs } = rig()
    const missing = await fs.list('/NOPE').catch((e: unknown) => e)
    expect(missing).toBeInstanceOf(CardError)
    expect((missing as CardError).code).toBe('notFound')
    expect(isNotFound(missing)).toBe(true)
    expect((missing as CardError).cause).toBeInstanceOf(SysexError)

    const taken = await fs.rename('/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Fixtures/snare.wav').catch((e: unknown) => e)
    expect(taken).toBeInstanceOf(CardError)
    expect((taken as CardError).code).toBe('exists')
    expect(isNotFound(taken)).toBe(false)
  })

  it('a write whose read-back differs is a verify error', async () => {
    const { client } = sysexRig({ corruptWrites: true })
    const err = await smsFS(client)
      .write('/SYNTHS/New.XML', new TextEncoder().encode(synthTemplate))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CardError)
    expect((err as CardError).code).toBe('verify')
  })
})

describe('usages', () => {
  it('answers per file and per folder, case-insensitively', async () => {
    const index = await scanReferences(rig().fs)
    expect(usagesOf(index, '/SAMPLES/fixtures/KICK.WAV', 'file')).toEqual(['/KITS/Fixtures Kit.XML'])
    expect(usagesOf(index, '/SAMPLES/Fixtures/range-low.wav', 'file')).toEqual(['/SYNTHS/Piano.XML'])
    expect(usagesOf(index, '/SAMPLES/Fixtures', 'folder')).toEqual(['/KITS/Fixtures Kit.XML', '/SYNTHS/Piano.XML'])
    expect(usagesOf(index, '/SAMPLES/Fixtures/unused.wav', 'file')).toEqual([])
    const counts = usageCounts(index, [
      { path: '/SAMPLES/Fixtures', kind: 'folder' },
      { path: '/SAMPLES/Fixtures/kick.wav', kind: 'file' },
      { path: '/SAMPLES/Fixtures/unused.wav', kind: 'file' },
    ])
    expect([...counts.values()]).toEqual([2, 1, 0])
  })

  it('survives a trip through JSON, and rejects junk', async () => {
    const index = await scanReferences(rig().fs)
    expect(indexFromJSON(JSON.parse(JSON.stringify(indexToJSON(index))))).toEqual(index)
    expect(indexFromJSON([{ path: 1 }, null, 'x']).size).toBe(0)
    expect(indexFromJSON('nope').size).toBe(0)
  })
})

describe('planMove', () => {
  const index: ReferenceIndex = new Map()
  it('keeps samples under SAMPLES and out of the recording folders', () => {
    expect(planMove(index, '/SAMPLES/A/x.wav', '/KITS/x.wav', 'file')).toBe('samples have to stay under SAMPLES/')
    expect(planMove(index, '/SYNTHS/x.wav', '/SAMPLES/x.wav', 'file')).toMatch(/not a sample/)
    expect(planMove(index, '/SAMPLES/RECORD', '/SAMPLES/Old', 'folder')).toMatch(/records/)
    expect(planMove(index, '/SAMPLES/A', '/SAMPLES/A/B', 'folder')).toMatch(/into itself/)
    expect(planMove(index, '/SAMPLES/A/x.wav', '/SAMPLES/A/x.wav', 'file')).toMatch(/already/)
    expect(planMove(index, '/SAMPLES/A/x.wav', '/SAMPLES/A/x:y.wav', 'file')).toMatch(/cannot contain/)
    expect(planMove(index, '/SAMPLES/A/x.wav', '/SAMPLES/A/ x.wav', 'file')).toMatch(/space/)
  })
  it('a change of case alone is a rename', () => {
    const plan = planMove(index, '/SAMPLES/A/x.wav', '/SAMPLES/A/X.wav', 'file')
    expect(plan).toMatchObject({ from: '/SAMPLES/A/x.wav', to: '/SAMPLES/A/X.wav', files: [] })
  })
})

describe('applyMove', () => {
  it('moves a sample into a new folder and rewrites the one kit that names it', async () => {
    const { fs, fake, text } = rig()
    const index = await scanReferences(fs)
    const plan = planMove(index, '/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Drums/808/Kick.wav', 'file') as MovePlan
    expect(plan.files).toEqual(['/KITS/Fixtures Kit.XML'])
    const labels: string[] = []
    const outcome = await applyMove(fs, plan, (label) => labels.push(label))
    expect(outcome).toEqual({ updated: ['/KITS/Fixtures Kit.XML'], unchanged: [], failed: [] })
    expect(fake.files.has('/SAMPLES/Fixtures/kick.wav')).toBe(false)
    expect(fake.files.has('/SAMPLES/Drums/808/Kick.wav')).toBe(true)
    expect(fake.dirs.has('/SAMPLES/Drums/808')).toBe(true)
    // the kit is the fixture with exactly that one value changed
    expect(text('/KITS/Fixtures Kit.XML')).toBe(kitFixture.replace('SAMPLES/Fixtures/kick.wav', 'SAMPLES/Drums/808/Kick.wav'))
    // no temp or backup left beside it
    expect([...fake.files.keys()].filter((p) => p.endsWith('.tmp') || p.endsWith('.bak'))).toEqual([])
    expect(labels[0]).toBe('Moving kick.wav')
    // the in-memory index follows, so a second move need not rescan
    const next = applyMoveToIndex(index, plan, outcome)
    expect(usagesOf(next, '/SAMPLES/Drums/808/Kick.wav', 'file')).toEqual(['/KITS/Fixtures Kit.XML'])
    expect(usagesOf(next, '/SAMPLES/Fixtures/kick.wav', 'file')).toEqual([])
  })

  it('moves a folder with everything under it and rewrites every file that names anything in it', async () => {
    const { fs, fake, text } = rig()
    const index = await scanReferences(fs)
    const plan = planMove(index, '/SAMPLES/Fixtures', '/SAMPLES/Library/Fixtures', 'folder') as MovePlan
    expect(plan.files).toEqual(['/KITS/Fixtures Kit.XML', '/SYNTHS/Piano.XML'])
    const outcome = await applyMove(fs, plan)
    expect(outcome.updated).toEqual(plan.files)
    expect(fake.files.has('/SAMPLES/Library/Fixtures/Sub/deep.wav')).toBe(true)
    expect(fake.dirs.has('/SAMPLES/Fixtures')).toBe(false)
    expect(referencedPaths(text('/SYNTHS/Piano.XML'))).toEqual([
      'SAMPLES/Library/Fixtures/range-low.wav',
      'SAMPLES/Library/Fixtures/range-high.wav',
    ])
    expect(text('/SYNTHS/Sub/Init.XML')).toBe(synthTemplate)
  })

  it('a rename that only changes case goes through', async () => {
    const { fs, fake } = rig()
    const plan = planMove(await scanReferences(fs), '/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Fixtures/KICK.wav', 'file') as MovePlan
    await applyMove(fs, plan)
    expect(fake.files.has('/SAMPLES/Fixtures/KICK.wav')).toBe(true)
  })

  it('refuses to overwrite: a taken name fails before anything changes', async () => {
    const { fs, fake, text } = rig()
    const index = await scanReferences(fs)
    const plan = planMove(index, '/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Fixtures/snare.wav', 'file') as MovePlan
    await expect(applyMove(fs, plan)).rejects.toThrow(/FR_EXIST/)
    expect(fake.files.has('/SAMPLES/Fixtures/kick.wav')).toBe(true)
    expect(text('/KITS/Fixtures Kit.XML')).toBe(kitFixture)
  })

  it('a file that stopped naming the sample since the scan is reported unchanged, not rewritten', async () => {
    const { fs, fake } = rig()
    const index = await scanReferences(fs)
    fake.putFile('/KITS/Fixtures Kit.XML', kitFixture.replace('SAMPLES/Fixtures/kick.wav', 'SAMPLES/Other/kick.wav'))
    const plan = planMove(index, '/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Drums/kick.wav', 'file') as MovePlan
    const outcome = await applyMove(fs, plan)
    expect(outcome).toEqual({ updated: [], unchanged: ['/KITS/Fixtures Kit.XML'], failed: [] })
  })

  it('a reference rewrite that fails leaves the original file intact and says which', async () => {
    const { fs, fake, text } = rig()
    const index = await scanReferences(fs)
    const plan = planMove(index, '/SAMPLES/Fixtures', '/SAMPLES/Moved', 'folder') as MovePlan
    // A failing verify on the .tmp write: the swap never starts for that file.
    const failing: CardFS = {
      ...fs,
      write: async (path, data, p) => {
        if (path.startsWith('/SYNTHS/Piano')) throw new Error('simulated write failure')
        return fs.write(path, data, p)
      },
    }
    const outcome = await applyMove(failing, plan)
    expect(outcome.updated).toEqual(['/KITS/Fixtures Kit.XML'])
    expect(outcome.failed).toEqual([{ path: '/SYNTHS/Piano.XML', error: 'simulated write failure' }])
    expect(text('/SYNTHS/Piano.XML')).toBe(rangesFixture)
    expect(fake.files.has('/SYNTHS/Piano.XML.tmp')).toBe(false)
    // the sample itself did move — the outcome says the synth still names the old path
    expect(fake.dirs.has('/SAMPLES/Moved')).toBe(true)
  })
})

describe('delete', () => {
  it('refuses anything still referenced, and the recording folders', async () => {
    const index = await scanReferences(rig().fs)
    expect(deleteProblem(index, '/SAMPLES/Fixtures/kick.wav', 'file')).toBe('kick.wav is used by 1 file')
    expect(deleteProblem(index, '/SAMPLES/Fixtures', 'folder')).toBe('Fixtures is used by 2 files')
    expect(deleteProblem(index, '/SAMPLES/Fixtures/unused.wav', 'file')).toBeNull()
    expect(deleteProblem(index, '/SAMPLES/RESAMPLE', 'folder')).toMatch(/records/)
    expect(deleteProblem(index, '/SAMPLES', 'folder')).toMatch(/not a sample/)
  })

  it('removes a file, or a folder tree bottom up', async () => {
    const { fs, fake } = rig()
    expect(await deleteTree(fs, '/SAMPLES/Fixtures/unused.wav', 'file')).toBe(1)
    expect(fake.files.has('/SAMPLES/Fixtures/unused.wav')).toBe(false)
    fake.putFile('/SAMPLES/Old/a.wav', 'a')
    fake.putFile('/SAMPLES/Old/Deeper/b.wav', 'b')
    const seen: string[] = []
    expect(await deleteTree(fs, '/SAMPLES/Old', 'folder', (l) => seen.push(l))).toBe(2)
    expect(fake.dirs.has('/SAMPLES/Old')).toBe(false)
    expect(fake.dirs.has('/SAMPLES/Old/Deeper')).toBe(false)
    expect(seen.at(-1)).toBe('Deleting Old/')
  })
})
