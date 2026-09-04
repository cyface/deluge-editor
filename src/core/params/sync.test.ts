/**
 * `syncType` and `syncLevel` as the file has them. The values are the
 * firmware's enums — `SyncType` in `src/deluge/model/sync.h` (`beta`):
 * `SYNC_TYPE_EVEN = 0`, `SYNC_TYPE_TRIPLET = 10`, `SYNC_TYPE_DOTTED = 19`.
 */
import { describe, expect, it } from 'vitest'
import { SYNC_LEVELS, SYNC_TYPES, syncLevelName } from './sync'

describe('SYNC_TYPES', () => {
  it('is the SyncType enum, values as strings', () => {
    expect(SYNC_TYPES.map((t) => [t.value, t.label])).toEqual([
      ['0', 'Even'],
      ['10', 'Triplet'],
      ['19', 'Dotted'],
    ])
  })
})

describe('syncLevelName', () => {
  it('names every listed level the way the option table does', () => {
    for (const { value, label } of SYNC_LEVELS) expect(syncLevelName(value)).toBe(label)
  })

  it('reads a missing attribute as off and passes junk through', () => {
    expect(syncLevelName(undefined)).toBe('Off')
    expect(syncLevelName('x')).toBe('x')
    expect(syncLevelName('-1')).toBe('-1')
  })
})
