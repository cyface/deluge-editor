import { describe, expect, it } from 'vitest'
import { FakeDeluge } from './fake-deluge'
import { buildJsonFrame, IDENTITY_REQUEST, parseIdentityReply, parseReply, type SysexReply } from './frame'

/** A fake whose replies are collected, decoded as the client would decode them. */
function rig(opts: ConstructorParameters<typeof FakeDeluge>[1] = {}): { fake: FakeDeluge; replies: SysexReply[] } {
  const replies: SysexReply[] = []
  const fake = new FakeDeluge((bytes) => {
    const r = parseReply(bytes)
    if (r) replies.push(r)
  }, opts)
  return { fake, replies }
}

type DirEntry = { name: string; size: number; date: number; time: number; attr: number }
const listing = (r: SysexReply): DirEntry[] => (r.json['^dir'] as { list: DirEntry[] }).list

/**
 * The two facts the e2e path (tests/e2e/fake-deluge.entry.ts) now leans on,
 * pinned here so a change to the fake shows up in a unit test before it
 * silently changes what the specs exercise.
 */
describe('FakeDeluge', () => {
  it('the session grant carries `pipe` when configured, on msgId 0 with the tag echoed', () => {
    const { fake, replies } = rig({ sessionPipe: 2 })
    fake.receive(buildJsonFrame(0, { session: { tag: 'deluge-editor-cafe' } }))
    expect(replies).toHaveLength(1)
    expect(replies[0].msgId).toBe(0)
    expect(replies[0].json['^session']).toMatchObject({ sid: 1, tag: 'deluge-editor-cafe', midMin: 9, midMax: 15, pipe: 2 })
  })

  it('an unconfigured grant has no `pipe` at all — an unfixed firmware, which keeps the client serial', () => {
    const { fake, replies } = rig()
    fake.receive(buildJsonFrame(0, { session: { tag: 'deluge-editor-cafe' } }))
    expect(replies[0].json['^session']).not.toHaveProperty('pipe')
  })

  it('dir entries carry a non-zero date and time, so a scan cache can see "unchanged"', () => {
    const { fake, replies } = rig()
    fake.putFile('/SYNTHS/A.XML', 'x')
    fake.putFile('/SYNTHS/Sub/B.XML', 'xy')
    fake.receive(buildJsonFrame(9, { dir: { path: '/SYNTHS', offset: 0, lines: 20 } }))
    const list = listing(replies[0])
    expect(list.map((e) => e.name)).toEqual(['A.XML', 'Sub'])
    for (const e of list) {
      expect(e.date).toBeGreaterThan(0)
      expect(e.time).toBeGreaterThan(0)
    }
    // And they are stable across listings: the same file lists the same stamp.
    fake.receive(buildJsonFrame(10, { dir: { path: '/SYNTHS', offset: 0, lines: 20 } }))
    expect(listing(replies[1])).toEqual(list)
  })
})

type FakeCard = {
  files: Map<string, Uint8Array>
  dirs: Set<string>
  text: (p: string) => string | null
  paths: () => string[]
  otherEditor: () => void
  deluge: FakeDeluge
}
type Port = { name: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null; send: (b: Uint8Array) => void }
type Access = { inputs: Map<string, Port>; outputs: Map<string, Port> }

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 1))

/**
 * The e2e init script, run here under happy-dom: the Web MIDI shim, the
 * identity reply, the pipelined grant, and the `__cardSeed` → `__fakeCard`
 * contract the specs use. Importing it is also what type-checks it.
 */
describe('the e2e init script (tests/e2e/fake-deluge.entry.ts)', () => {
  it('seeds the card, answers the identity inquiry with 1.3.0 and grants a pipelined session', async () => {
    const g = globalThis as unknown as { __cardSeed?: Record<string, string>; __fakeCard: FakeCard; navigator: { requestMIDIAccess: () => Promise<Access> } }
    g.__cardSeed = { '/SYNTHS/Seeded.XML': '<sound/>', '/SAMPLES/Kit/kick.wav': 'RIFFkick' }
    await import('../../../tests/e2e/fake-deluge.entry')

    const card = g.__fakeCard
    expect(card.paths()).toEqual(['/SAMPLES/Kit/kick.wav', '/SYNTHS/Seeded.XML'])
    expect(card.text('/SYNTHS/Seeded.XML')).toBe('<sound/>')
    expect(card.text('/SYNTHS/Missing.XML')).toBeNull()
    expect(card.files).toBe(card.deluge.files)
    expect(card.dirs.has('/SAMPLES/Kit')).toBe(true)

    const access = await g.navigator.requestMIDIAccess()
    const output = [...access.outputs.values()][0]
    const input = [...access.inputs.values()][0]
    expect(output.name).toContain('Deluge')
    const heard: Uint8Array[] = []
    input.onmidimessage = (e) => heard.push(e.data)

    output.send(IDENTITY_REQUEST)
    await tick()
    expect(parseIdentityReply(heard[0])).toEqual({ major: 1, minor: 3, patch: 0 })

    output.send(buildJsonFrame(0, { session: { tag: 'deluge-editor-cafe' } }))
    await tick()
    const grant = parseReply(heard[1])!
    expect(grant.msgId).toBe(0)
    expect(grant.json['^session']).toMatchObject({ tag: 'deluge-editor-cafe', pipe: 2 })

    // A second editor's reply lands on that editor's msgId block.
    card.otherEditor()
    await tick()
    expect(parseReply(heard[2])).toMatchObject({ msgId: 17, json: { '^read': { fid: 99 } } })

    // What the app sent is on record for assertions.
    expect(card.deluge.requests).toEqual([{ session: { tag: 'deluge-editor-cafe' } }])
  })
})
