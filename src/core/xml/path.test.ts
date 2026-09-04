/**
 * Flattened paths back onto the tree, on a kit: the one preset shape where
 * same-named siblings (`soundSources/sound[3]`) make the index matter.
 */
import { describe, expect, it } from 'vitest'
import { fixtureKit, fixtureText } from '../../../tests/helpers/fixtures'
import { drumRows } from '../preset'
import { flattenXML } from './flatten'
import { ensureAtPath, findAtPath, findElementAtPath } from './path'

const KIT = 'Kit Sample Rows'

describe('indexed paths on a kit', () => {
  it('sound[3] is the fourth drum row, and its walk is the lineage', () => {
    const kit = fixtureKit(KIT)
    const rows = drumRows(kit)
    expect(rows.length).toBeGreaterThan(3)
    const hit = findAtPath(kit, 'kit/soundSources/sound[3]@name')
    expect(hit).not.toBeNull()
    expect(hit!.el).toBe(rows[3])
    expect(hit!.attr).toBe('name')
    expect(hit!.el.attrs.name).toBe(rows[3].attrs.name)
    expect(hit!.lineage.map((e) => e.tag)).toEqual(['kit', 'soundSources', 'sound'])
    // and the element form, one level further down
    const osc = findElementAtPath(kit, 'kit/soundSources/sound[3]/osc1')
    expect(osc!.el).toBe(rows[3].children.find((c) => c.tag === 'osc1'))
    expect(osc!.el.tag).toBe('osc1')
  })

  it('an unindexed segment is [0]; an index past the siblings is nothing, and ensure appends only at the end', () => {
    const kit = fixtureKit(KIT)
    const rows = drumRows(kit) // the live child list: its length moves with the tree below
    const n = rows.length
    expect(findAtPath(kit, 'kit/soundSources/sound@name')!.el).toBe(rows[0])
    expect(findAtPath(kit, 'kit/soundSources/sound[0]@name')!.el).toBe(rows[0])
    expect(findAtPath(kit, `kit/soundSources/sound[${n}]@name`)).toBeNull()
    expect(findAtPath(kit, 'synth/soundSources/sound@name')).toBeNull() // wrong root
    // ensureAtPath creates the next sibling, never one further out
    expect(ensureAtPath(kit, `kit/soundSources/sound[${n + 1}]@name`)).toBeNull()
    expect(drumRows(kit).length).toBe(n)
    const made = ensureAtPath(kit, `kit/soundSources/sound[${n}]@name`)
    expect(made!.el.tag).toBe('sound')
    expect(drumRows(kit).length).toBe(n + 1)
    expect(drumRows(kit)[n]).toBe(made!.el)
  })

  it('finds every flattened entry of the kit at its own value', () => {
    // The flattener and the walker are independent code over the same
    // grammar; every path the one writes, the other must resolve.
    const kit = fixtureKit(KIT)
    const misses: string[] = []
    for (const [path, value] of flattenXML(fixtureText(KIT))) {
      const hit = findAtPath(kit, path)
      if (!hit || hit.el.attrs[hit.attr] !== value) misses.push(path)
    }
    expect(misses).toEqual([])
  })
})
