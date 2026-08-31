import { describe, expect, it } from 'vitest'
import { gridBlocks, type Group } from './groups'

const gs = (...ids: string[]) => ids.map((id) => ({ id }) as Group)
const ids = (blocks: Group[][]) => blocks.map((b) => b.map((g) => g.id))

describe('gridBlocks', () => {
  it('tucks the Randomiser under the Arpeggiator as one block', () => {
    expect(ids(gridBlocks(gs('cables', 'arp', 'random', 'gold')))).toEqual([
      ['cables'], ['arp', 'random'], ['gold'],
    ])
  })

  it('the kit bus between them dissolves the pair', () => {
    // visibleGroups seats the kit before the Randomiser in a kit preset.
    expect(ids(gridBlocks(gs('arp', 'kit', 'random', 'gold')))).toEqual([
      ['arp'], ['kit'], ['random'], ['gold'],
    ])
  })

  it('a Randomiser without its Arpeggiator stands alone', () => {
    // The user can collapse Arp to a chip while keeping the Randomiser pinned.
    expect(ids(gridBlocks(gs('cables', 'random', 'gold')))).toEqual([
      ['cables'], ['random'], ['gold'],
    ])
  })
})
