import { describe, expect, it } from 'vitest'
import { RECENT_MAX, withEntry, type RecentEntry, type RecentHandle } from './recent.svelte'

const deluge = (path: string, at = 0): RecentEntry => ({ kind: 'deluge', path, name: path.slice(path.lastIndexOf('/') + 1), at })
const handle = (id: string): RecentHandle => ({
  kind: 'file',
  name: `${id}.XML`,
  getFile: async () => new File([], `${id}.XML`),
  isSameEntry: async (o) => o.name === `${id}.XML`,
})
const computer = (id: string): RecentEntry => ({ kind: 'computer', name: `${id}.XML`, handle: handle(id), at: 0 })

describe('withEntry', () => {
  it('puts the entry first and drops an older mention of the same card path, whatever its case', async () => {
    const list = await withEntry([deluge('/KITS/A.XML'), deluge('/kits/b.xml')], deluge('/KITS/B.XML', 1))
    expect(list.map((e) => (e.kind === 'deluge' ? e.path : ''))).toEqual(['/KITS/B.XML', '/KITS/A.XML'])
  })

  it('tells files on this computer apart by handle, and never a computer file from a card path', async () => {
    const list = await withEntry([computer('x'), computer('y'), deluge('/SYNTHS/x.XML')], computer('x'))
    expect(list.map((e) => e.kind + ':' + e.name)).toEqual(['computer:x.XML', 'computer:y.XML', 'deluge:x.XML'])
  })

  it(`keeps at most ${RECENT_MAX}`, async () => {
    let list: RecentEntry[] = []
    for (let i = 0; i < RECENT_MAX + 3; i++) list = await withEntry(list, deluge(`/SYNTHS/${i}.XML`))
    expect(list).toHaveLength(RECENT_MAX)
    expect(list[0]).toMatchObject({ path: `/SYNTHS/${RECENT_MAX + 2}.XML` })
  })
})
