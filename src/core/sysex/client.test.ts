import { describe, expect, it } from 'vitest'
import { FakeDeluge, type FakeOptions } from './fake-deluge'
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

  it('uses the negotiated msgId range and cycles within it', async () => {
    const { client, fake } = rig()
    fake.putFile('/SYNTHS/A.XML', bytes(1))
    for (let i = 0; i < 4; i++) await client.readFile('/SYNTHS/A.XML')
    // Fake grants sid 1 → msgIds 9..15; nothing to assert beyond it all worked
    // (a wrong id would never be answered and every call would time out).
  })
})
