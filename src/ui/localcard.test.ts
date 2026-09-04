/**
 * `localcard.ts` over an in-memory stand-in for the File System Access API
 * handles: the error codes it reports and the read-back after a write. The
 * browser's real handles are exercised in `tests/e2e/library-mounted.spec.ts`.
 */
import { describe, expect, it } from 'vitest'
import { CardError, isNotFound } from '../core/library'
import { localFS } from './localcard'

class FakeFile {
  readonly kind = 'file' as const
  constructor(
    public name: string,
    public data: Uint8Array,
    private readonly card: FakeCard,
  ) {}
  async getFile(): Promise<File> {
    return new File([this.data as BlobPart], this.name)
  }
  async createWritable(): Promise<{ write(d: Uint8Array): Promise<void>; close(): Promise<void> }> {
    const chunks: Uint8Array[] = []
    return {
      write: async (d) => {
        chunks.push(d)
      },
      close: async () => {
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
        let at = 0
        for (const c of chunks) {
          out.set(c, at)
          at += c.length
        }
        // A reader that lies: the write "succeeds" but the card holds something else.
        this.data = this.card.corruptWrites && out.length ? out.map((b, i) => (i === 0 ? b ^ 0xff : b)) : out
      },
    }
  }
  async isSameEntry(o: unknown): Promise<boolean> {
    return o === this
  }
}

class FakeDir {
  readonly kind = 'directory' as const
  readonly children = new Map<string, FakeFile | FakeDir>()
  constructor(
    public name: string,
    private readonly card: FakeCard,
  ) {}
  async *entries(): AsyncIterable<[string, FakeFile | FakeDir]> {
    yield* this.children
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const c = this.children.get(name)
    if (c) {
      if (c.kind !== 'file') throw new DOMException(`${name} is a directory`, 'TypeMismatchError')
      return c
    }
    if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError')
    const f = new FakeFile(name, new Uint8Array(), this.card)
    this.children.set(name, f)
    return f
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    const c = this.children.get(name)
    if (c) {
      if (c.kind !== 'directory') throw new DOMException(`${name} is a file`, 'TypeMismatchError')
      return c
    }
    if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError')
    const d = new FakeDir(name, this.card)
    this.children.set(name, d)
    return d
  }
  async removeEntry(name: string): Promise<void> {
    if (!this.children.delete(name)) throw new DOMException(`${name} not found`, 'NotFoundError')
  }
  async isSameEntry(o: unknown): Promise<boolean> {
    return o === this
  }
}

class FakeCard {
  corruptWrites = false
  readonly root = new FakeDir('DELUGE', this)
  async put(path: string, text: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    let dir = this.root
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true })
    ;(await dir.getFileHandle(parts[parts.length - 1], { create: true })).data = new TextEncoder().encode(text)
  }
}

async function rig() {
  const card = new FakeCard()
  await card.put('/SAMPLES/Fixtures/kick.wav', 'RIFFkick')
  await card.put('/SAMPLES/Fixtures/snare.wav', 'RIFFsnare')
  await card.put('/KITS/Kit.XML', '<kit/>')
  // localcard's handle types are structural; the fake is the same shape.
  return { card, fs: localFS(card.root as unknown as Parameters<typeof localFS>[0]) }
}

const failure = (p: Promise<unknown>): Promise<unknown> => p.then(() => null, (e: unknown) => e)

describe('localFS errors', () => {
  it('a folder that is not there is notFound, and nothing else is', async () => {
    const { fs } = await rig()
    const e = await failure(fs.list('/SONGS'))
    expect(e).toBeInstanceOf(CardError)
    expect((e as CardError).code).toBe('notFound')
    expect(isNotFound(e)).toBe(true)
    expect((e as CardError).message).not.toContain('FR_')
    expect(isNotFound(await failure(fs.read('/SAMPLES/Fixtures')))).toBe(false)
    expect(((await failure(fs.read('/SAMPLES/Fixtures'))) as CardError).code).toBe('notAFile')
  })

  it('a rename onto a name in use is exists, without a FatFS code in the text', async () => {
    const { fs } = await rig()
    const e = await failure(fs.rename('/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Fixtures/snare.wav'))
    expect(e).toBeInstanceOf(CardError)
    expect((e as CardError).code).toBe('exists')
    expect((e as CardError).message).toBe('/SAMPLES/Fixtures/snare.wav already exists')
  })

  it('a handle without move() goes copy-then-remove, and the copy is verified', async () => {
    const { fs, card } = await rig()
    await fs.rename('/SAMPLES/Fixtures/kick.wav', '/SAMPLES/Fixtures/Kick 808.wav')
    expect((await fs.list('/SAMPLES/Fixtures')).map((e) => e.name).sort()).toEqual(['Kick 808.wav', 'snare.wav'])
    expect(new TextDecoder().decode(await fs.read('/SAMPLES/Fixtures/Kick 808.wav'))).toBe('RIFFkick')
    card.corruptWrites = true
    const e = await failure(fs.rename('/SAMPLES/Fixtures/snare.wav', '/SAMPLES/Fixtures/Snare.wav'))
    expect((e as CardError).code).toBe('verify')
  })
})

describe('localFS write', () => {
  it('reads the file back and accepts it when the bytes match', async () => {
    const { fs } = await rig()
    const data = new TextEncoder().encode('<kit>new</kit>')
    let progress: [number, number] | null = null
    await fs.write('/KITS/Kit.XML', data, (d, t) => (progress = [d, t]))
    expect(progress).toEqual([data.length, data.length])
    expect(await fs.read('/KITS/Kit.XML')).toEqual(data)
  })

  it('refuses a write whose read-back differs, as the SysEx client does', async () => {
    const { fs, card } = await rig()
    card.corruptWrites = true
    const e = await failure(fs.write('/KITS/Kit.XML', new TextEncoder().encode('<kit>new</kit>')))
    expect(e).toBeInstanceOf(CardError)
    expect((e as CardError).code).toBe('verify')
    expect((e as CardError).message).toMatch(/^verify \/KITS\/Kit\.XML: card copy differs from what was sent, first at byte 0/)
  })
})
