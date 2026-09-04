/**
 * The sample library's index cache for a card in a reader. The scan trusts
 * the previous index for any file at the same path, size and timestamp — so
 * the cache must be that card's, or a second card with a same-shaped file
 * inherits the first card's references. Keyed by the card's folder name.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { CardError, type CardEntry, type CardFS } from '../../core/library'
import { cacheKey, library } from './library.svelte'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

/** A card in a reader, as the six operations: files by protocol path, folders implied. */
function fakeCard(files: Record<string, string>, opts: { unreadable?: boolean } = {}): CardFS {
  const dirs = new Set<string>(['/'])
  for (const path of Object.keys(files)) {
    const parts = path.split('/').filter(Boolean)
    for (let i = 1; i < parts.length; i++) dirs.add(`/${parts.slice(0, i).join('/')}`)
  }
  const notFound = (p: string) => new CardError('notFound', `${p}: no such file or folder on the card`)
  const refuse = async (): Promise<never> => {
    throw new Error('not in this test')
  }
  return {
    async list(path): Promise<CardEntry[]> {
      if (!dirs.has(path)) throw notFound(path)
      const prefix = path === '/' ? '/' : `${path}/`
      const out: CardEntry[] = []
      for (const d of dirs) {
        if (d !== path && d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) {
          out.push({ name: d.slice(prefix.length), size: 0, date: 0, time: 0, dir: true })
        }
      }
      for (const [p, text] of Object.entries(files)) {
        if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) {
          out.push({ name: p.slice(prefix.length), size: enc(text).length, date: 0, time: 0, dir: false })
        }
      }
      return out
    },
    async read(path) {
      if (opts.unreadable) throw new Error('read from the reader, not the cache')
      const text = files[path]
      if (text === undefined) throw notFound(path)
      return enc(text)
    },
    reader: refuse,
    write: refuse,
    rename: refuse,
    remove: refuse,
    mkdir: refuse,
  }
}

/** Two kits of the same byte length at the same path, naming different samples. */
const KIT_A = '<kit><osc1 type="sample" fileName="SAMPLES/A/kick.wav"></osc1></kit>'
const KIT_B = '<kit><osc1 type="sample" fileName="SAMPLES/B/snar.wav"></osc1></kit>'

beforeEach(() => {
  localStorage.clear()
  library.close()
})

describe('the mounted card’s index cache', () => {
  it('is keyed by the card, so a different card never inherits its references', async () => {
    expect(KIT_A.length).toBe(KIT_B.length)
    await library.mount(fakeCard({ '/KITS/K.XML': KIT_A, '/SAMPLES/A/kick.wav': 'RIFF' }), 'CARD_A')
    expect(library.index?.get('/KITS/K.XML')?.refs).toEqual(['SAMPLES/A/kick.wav'])
    expect(localStorage.getItem(cacheKey('mounted', 'CARD_A'))).toContain('SAMPLES/A/kick.wav')

    // Card B: the same file at the same path, size and timestamp, but not the same file.
    await library.mount(fakeCard({ '/KITS/K.XML': KIT_B, '/SAMPLES/B/snar.wav': 'RIFF' }), 'CARD_B')
    expect(library.index?.get('/KITS/K.XML')?.refs).toEqual(['SAMPLES/B/snar.wav'])
    expect(localStorage.getItem(cacheKey('mounted', 'CARD_B'))).toContain('SAMPLES/B/snar.wav')
    expect(localStorage.getItem(cacheKey('mounted', 'CARD_A'))).toContain('SAMPLES/A/kick.wav')
  })

  it('is used again for the same card, so an unchanged file is not re-read', async () => {
    await library.mount(fakeCard({ '/KITS/K.XML': KIT_A, '/SAMPLES/A/kick.wav': 'RIFF' }), 'CARD_A')
    // Back in the reader: the listing matches the cache, so nothing is read — and that is proven by a card that refuses reads.
    await library.mount(fakeCard({ '/KITS/K.XML': KIT_A, '/SAMPLES/A/kick.wav': 'RIFF' }, { unreadable: true }), 'CARD_A')
    expect(library.error).toBeNull()
    expect(library.index?.get('/KITS/K.XML')?.refs).toEqual(['SAMPLES/A/kick.wav'])
  })

  it('names the Deluge’s cache without a card name, and a reader’s with one', () => {
    expect(cacheKey('deluge', null)).toBe('deluge-editor.sample-index')
    expect(cacheKey('mounted', 'DELUGE')).toBe('deluge-editor.sample-index.mounted.DELUGE')
    expect(cacheKey('mounted', 'DELUGE')).not.toBe(cacheKey('mounted', 'BACKUP'))
  })
})
