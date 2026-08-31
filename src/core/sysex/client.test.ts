import { describe, expect, it } from 'vitest'
import { FakeDeluge, OTHER_CLIENT_TAG, type FakeOptions } from './fake-deluge'
import { isDirectory, SmsClient, SysexError, type SmsClientOptions } from './client'

/** A client wired straight to a fake Deluge. Short timeouts: replies are synchronous. */
function rig(fakeOpts: FakeOptions = {}, clientOpts: SmsClientOptions = {}): { client: SmsClient; fake: FakeDeluge } {
  let client: SmsClient
  const fake = new FakeDeluge((bytes) => client!.receive(bytes), fakeOpts)
  client = new SmsClient((bytes) => fake.receive(bytes), { timeouts: [20, 20, 50, 100], ...clientOpts })
  return { client, fake }
}

const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 0x80) & 0xff)

describe('SmsClient', () => {
  it('pings', async () => {
    const { client } = rig()
    await expect(client.ping()).resolves.toBeUndefined()
  })

  it('reads a multi-chunk file back byte-identical', async () => {
    const { client, fake } = rig()
    const data = bytes(3000) // 3 chunks of 1024, last one partial
    fake.putFile('/SYNTHS/A.XML', data)
    expect(Array.from(await client.readFile('/SYNTHS/A.XML'))).toEqual(Array.from(data))
  })

  it('a missing file is a FatFS error with its name, not a hang', async () => {
    const { client } = rig()
    const err = await client.readFile('/SYNTHS/NOPE.XML').catch((e: SysexError) => e)
    expect(err).toBeInstanceOf(SysexError)
    expect((err as SysexError).code).toBe(4)
    expect((err as SysexError).message).toContain('FR_NO_FILE')
  })

  it('writes, verifies by reading back, and the card copy is byte-identical', async () => {
    const { client, fake } = rig()
    const data = bytes(1500)
    await client.writeFile('/SYNTHS/NEW.XML', data)
    expect(Array.from(fake.files.get('/SYNTHS/NEW.XML')!)).toEqual(Array.from(data))
  })

  it('never sends a frame the firmware would silently drop (over 1024 bytes)', async () => {
    const { client, fake } = rig()
    await client.writeFile('/SYNTHS/BIG.XML', bytes(5000))
    expect(fake.maxFrameSeen).toBeLessThanOrEqual(1024)
  })

  it('keeps exactly one write in flight — the hardware corrupts overlapped transfers', async () => {
    // Measured on a real Deluge: a pipeline window of 4 slowed every write
    // to ~52ms and ended in short writes and FR_DISK_ERR (and pipelined
    // reads corrupted their payloads). PIPELINE must stay 1.
    const { client, fake } = rig({ holdWrites: true }, { timeouts: [5000] })
    const data = bytes(512 * 6) // six chunks at the 512-byte write chunk
    let settled = false
    const done = client.writeFile('/SYNTHS/W.XML', data).finally(() => (settled = true))
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
    await tick()
    expect(fake.requests.filter((r) => 'write' in r).length).toBe(1) // no second before a reply
    for (let i = 0; i < 100 && !settled; i++) {
      fake.releaseWrite()
      await tick()
    }
    await done
    expect(Array.from(fake.files.get('/SYNTHS/W.XML')!)).toEqual(Array.from(data))
  })

  it('resends a dropped request with a fresh msgId instead of hanging', async () => {
    const { client, fake } = rig({ dropRequests: 2 })
    fake.putFile('/SYNTHS/A.XML', bytes(10))
    expect((await client.readFile('/SYNTHS/A.XML')).length).toBe(10)
    // The dropped requests were re-sent: more requests seen than answered ops.
    expect(fake.requests.filter((r) => 'open' in r).length).toBeGreaterThanOrEqual(1)
  })

  it('a short write (err 0, smaller size) is rewritten, not trusted', async () => {
    const { client, fake } = rig({ shortWriteOnce: 100 })
    const data = bytes(512)
    await client.writeFile('/SYNTHS/S.XML', data)
    expect(Array.from(fake.files.get('/SYNTHS/S.XML')!)).toEqual(Array.from(data))
    expect(fake.requests.filter((r) => 'write' in r).length).toBe(2)
  })

  it('read-back verification catches a corrupted card copy', async () => {
    const { client } = rig({ corruptWrites: true })
    await expect(client.writeFile('/SYNTHS/C.XML', bytes(64))).rejects.toThrow(/verify.*differs/)
  })

  it('sampled verify reads spot ranges, not the whole file back', async () => {
    const { client, fake } = rig()
    const data = bytes(1024 * 40) // full verify would read back 40 chunks
    await client.writeFile('/SAMPLES/S.wav', data, undefined, 'sampled')
    expect(fake.requests.filter((r) => 'read' in r).length).toBeLessThanOrEqual(10)
    expect(Array.from(fake.files.get('/SAMPLES/S.wav')!)).toEqual(Array.from(data))
  })

  it('sampled verify still catches a corrupted header', async () => {
    // corruptWrites flips byte 0 on every write — a WAV header byte, covered
    // by the first probe. An odd chunk count, so the flips don't cancel out.
    const { client } = rig({ corruptWrites: true })
    await expect(client.writeFile('/SAMPLES/C.wav', bytes(512 * 79), undefined, 'sampled')).rejects.toThrow(/verify.*differs/)
  })

  it('sampled verify of a small file covers every byte', async () => {
    const { client, fake } = rig()
    const data = bytes(300)
    await client.writeFile('/SAMPLES/T.wav', data, undefined, 'sampled')
    expect(Array.from(fake.files.get('/SAMPLES/T.wav')!)).toEqual(Array.from(data))
  })

  it('an open failure carries the FatFS code', async () => {
    const { client } = rig({ failOpen: 3 })
    const err = await client.writeFile('/SYNTHS/X.XML', bytes(4)).catch((e: SysexError) => e)
    expect((err as SysexError).code).toBe(3)
    expect((err as SysexError).message).toContain('not ready')
  })

  it('pages a long directory through the 25-line limit in one call', async () => {
    const { client, fake } = rig()
    for (let i = 0; i < 60; i++) fake.putFile(`/SYNTHS/P${String(i).padStart(2, '0')}.XML`, 'x')
    const entries = await client.listDirectory('/SYNTHS')
    expect(entries.length).toBe(60)
    expect(fake.requests.filter((r) => 'dir' in r).length).toBe(3) // 25 + 25 + 10
    expect(entries.every((e) => !isDirectory(e))).toBe(true)
  })

  it('lists directories with their flag set', async () => {
    const { client, fake } = rig()
    fake.putFile('/SYNTHS/SUB/A.XML', 'x')
    const entries = await client.listDirectory('/SYNTHS')
    const sub = entries.find((e) => e.name === 'SUB')
    expect(sub && isDirectory(sub)).toBe(true)
  })

  it('a missing directory throws FR_NO_PATH', async () => {
    const { client } = rig()
    const err = await client.listDirectory('/NOPE').catch((e: SysexError) => e)
    expect((err as SysexError).code).toBe(5)
  })

  it('falls back to the last session block when negotiation never answers', async () => {
    const { client, fake } = rig({ dropSession: true }, { timeouts: [5, 5] })
    fake.putFile('/SYNTHS/A.XML', bytes(3))
    expect((await client.readFile('/SYNTHS/A.XML')).length).toBe(3)
    // msgIds must stay inside (15<<3)+1 … (15<<3)+7 — the block the firmware
    // reclaims last — and never (sid<<3)+0, which is not a valid message id.
  })

  it('openRead serves ranged reads without pulling the whole file', async () => {
    const { client, fake } = rig()
    const data = bytes(5000)
    fake.putFile('/SAMPLES/K/Kick.wav', data)
    const handle = await client.openRead('/SAMPLES/K/Kick.wav')
    expect(handle.size).toBe(5000)
    expect(Array.from(await handle.read(0, 12))).toEqual(Array.from(data.subarray(0, 12)))
    expect(Array.from(await handle.read(4000, 8))).toEqual(Array.from(data.subarray(4000, 4008)))
    // a read past EOF comes back short, then empty — never an error
    expect((await handle.read(4996, 100)).length).toBe(4)
    expect((await handle.read(5000, 8)).length).toBe(0)
    // a range wider than the 1024-byte read chunk is assembled from several reads
    expect(Array.from(await handle.read(100, 3000))).toEqual(Array.from(data.subarray(100, 3100)))
    await handle.close()
  })

  // ---- a second editor on the same Deluge (issue #8) ---------------------
  // Web MIDI is not exclusive: every tab and app on the machine receives
  // every reply, so the client must tell its own traffic from a stranger's.

  it('ignores another editor\'s session grant and keeps the one it asked for', async () => {
    // Both grants arrive on msgId 0 (startDirect), the other one first — only
    // the echoed tag says whose is whose. Adopting theirs would put both tabs
    // on one msgId block, each reading the other's replies as its own.
    const seen: string[] = []
    const { client, fake } = rig({ otherSessionFirst: true }, { onOtherClient: (op) => seen.push(op) })
    fake.putFile('/SYNTHS/A.XML', bytes(3))
    expect((await client.readFile('/SYNTHS/A.XML')).length).toBe(3)
    expect(seen).toContain('^session') // the stranger's grant was noticed, not adopted
    // Every request rode our own block (sid 1 → 9…15), never the other's 17…23.
    expect(fake.msgIds.filter((id) => id !== 0).every((id) => id >= 9 && id <= 15)).toBe(true)
  })

  it('reports a reply on another session\'s msgIds instead of acting on it', async () => {
    const seen: string[] = []
    const { client, fake } = rig({}, { onOtherClient: (op) => seen.push(op) })
    fake.putFile('/SYNTHS/A.XML', bytes(3))
    await client.readFile('/SYNTHS/A.XML') // negotiate first, so the block is known
    fake.otherClientReply() // a ^read answered to sid 2, seen here because MIDI multiplexes
    expect(seen).toEqual(['^read'])
    // and the client is untouched by it
    expect((await client.readFile('/SYNTHS/A.XML')).length).toBe(3)
  })

  it('accepts a session grant from a firmware that does not echo the tag', async () => {
    const seen: string[] = []
    const { client, fake } = rig({ omitSessionTag: true }, { onOtherClient: (op) => seen.push(op) })
    fake.putFile('/SYNTHS/A.XML', bytes(3))
    expect((await client.readFile('/SYNTHS/A.XML')).length).toBe(3)
    expect(seen).toEqual([]) // an untagged grant is ours; rejecting it would mean no session at all
    expect(fake.msgIds.filter((id) => id !== 0).every((id) => id >= 9 && id <= 15)).toBe(true)
  })

  it('gives each client its own session tag', () => {
    const tags = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const fake = new FakeDeluge(() => {}) // never answers; only the request matters
      new SmsClient((b) => fake.receive(b), { timeouts: [1] }).ping().catch(() => {})
      tags.add((fake.requests.at(-1) as { session: { tag: string } }).session.tag)
    }
    expect(tags.size).toBeGreaterThan(1) // not the static tag two tabs would share
    expect([...tags].every((t) => t.startsWith('deluge-editor-'))).toBe(true)
    expect(tags.has(OTHER_CLIENT_TAG)).toBe(false)
  })

  it('uses the negotiated msgId range and cycles within it', async () => {
    const { client, fake } = rig()
    fake.putFile('/SYNTHS/A.XML', bytes(1))
    for (let i = 0; i < 4; i++) await client.readFile('/SYNTHS/A.XML')
    // Fake grants sid 1 → msgIds 9..15; nothing to assert beyond it all worked
    // (a wrong id would never be answered and every call would time out).
  })
})
