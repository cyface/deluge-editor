import { describe, expect, it } from 'vitest'
import { discardsFileRoots, fitOffset, parseNoteName, resolveRoots, resolveRootsByFolder, sampleFolder } from './roots'

const cents = (note: number) => note * 100

describe('parseNoteName', () => {
  it('reads a note name under the Deluge’s own naming, where C3 is 60', () => {
    expect(parseNoteName('C3.wav')).toBe(cents(60))
    expect(parseNoteName('A0v12.wav')).toBe(cents(33))
    expect(parseNoteName('D#1v12.wav')).toBe(cents(39))
    expect(parseNoteName('Bb2.wav')).toBe(cents(58))
    expect(parseNoteName('C-1.wav')).toBe(cents(12))
  })

  it('takes the name out of a path, and past a prefix', () => {
    expect(parseNoteName('SAMPLES/Piano/LAB - GB - E3.wav')).toBe(cents(64))
    expect(parseNoteName('LAB_Dark - C2.wav')).toBe(cents(48))
  })

  it('refuses a letter inside a word', () => {
    expect(parseNoteName('Bass.wav')).toBeUndefined()
    expect(parseNoteName('Grab2.wav')).toBeUndefined()
    // The B of "GB" is a letter deep in a word; the E3 after it is the note.
    expect(parseNoteName('LAB - GB - E3.wav')).toBe(cents(64))
  })

  it('refuses names that carry no note at all, however many numbers they have', () => {
    expect(parseNoteName('REC00304_TNZ32.WAV')).toBeUndefined()
    expect(parseNoteName('SkewBass - Marker #2.wav')).toBeUndefined()
    expect(parseNoteName('Freeze Sitar [2018-12-06 224345].wav')).toBeUndefined()
    expect(parseNoteName('kick.wav')).toBeUndefined()
  })

  it('refuses a note the instrument could not play', () => {
    expect(parseNoteName('C99.wav')).toBeUndefined()
    expect(parseNoteName('C-5.wav')).toBeUndefined()
  })

  it('takes the first candidate, so a name reads before a layer tag', () => {
    // "5b3" would read as B3 if the last candidate won.
    expect(parseNoteName('Pad D#2 vel 5b3.wav')).toBe(cents(51))
  })
})

describe('discardsFileRoots', () => {
  it('throws away a folder where every file declares the same note', () => {
    const same = [{ name: 'a.wav', fileRoot: 6000 }, { name: 'b.wav', fileRoot: 6000 }]
    expect(discardsFileRoots(same)).toBe(true)
  })

  it('keeps roots that differ, and keeps a lone file’s root', () => {
    expect(discardsFileRoots([{ name: 'a.wav', fileRoot: 6000 }, { name: 'b.wav', fileRoot: 6100 }])).toBe(false)
    expect(discardsFileRoots([{ name: 'a.wav', fileRoot: 6000 }])).toBe(false)
  })

  it('keeps them when only some files are tagged — one untagged file poisons the match, as on the device', () => {
    const mixed = [{ name: 'a.wav', fileRoot: 6000 }, { name: 'b.wav' }, { name: 'c.wav', fileRoot: 6000 }]
    expect(discardsFileRoots(mixed)).toBe(false)
  })
})

describe('fitOffset', () => {
  it('is the most common disagreement between a file’s own root and its name', () => {
    const rows = [
      { named: cents(48), anchor: cents(60) },
      { named: cents(50), anchor: cents(62) },
      { named: cents(52), anchor: cents(64) },
      { named: cents(55), anchor: cents(55) }, // one odd file out
    ]
    expect(fitOffset(rows)).toBe(12)
  })

  it('is zero with nothing to fit against', () => {
    expect(fitOffset([{ named: cents(60) }, { anchor: cents(60) }])).toBe(0)
  })

  it('breaks a tie towards the smaller shift rather than an octave jump', () => {
    const rows = [
      { named: cents(60), anchor: cents(60) },
      { named: cents(62), anchor: cents(74) },
    ]
    expect(fitOffset(rows)).toBe(0)
  })
})

describe('resolveRoots', () => {
  const named = (...names: string[]) => names.map((name) => ({ name }))

  it('prefers a file’s own root, and says so', () => {
    const plan = resolveRoots([{ name: 'C3.wav', fileRoot: cents(48) }])
    expect(plan.rows[0]).toMatchObject({ root: cents(48), from: 'file', named: cents(60) })
  })

  it('falls back to the name through the folder’s offset', () => {
    const plan = resolveRoots(named('C3.wav', 'D3.wav'))
    expect(plan.rows.map((r) => [r.root, r.from])).toEqual([
      [cents(60), 'name'],
      [cents(62), 'name'],
    ])
    expect(plan.offsetFrom).toBe('assumed')
  })

  it('calibrates the names against the files that do declare a root', () => {
    // Salamander's shape: the library names middle C as C4, so every name
    // reads an octave above what the files themselves say.
    const plan = resolveRoots([
      { name: 'A0v12.wav', fileRoot: cents(21) },
      { name: 'C1v12.wav', fileRoot: cents(24) },
      { name: 'E1v12.wav' },
    ])
    expect(plan.offset).toBe(-12)
    expect(plan.offsetFrom).toBe('anchors')
    expect(plan.rows[2]).toMatchObject({ root: cents(28), from: 'name' })
  })

  it('honours a user offset over the fitted one', () => {
    const plan = resolveRoots(named('C3.wav'), { offset: 24 })
    expect(plan).toMatchObject({ offset: 24, offsetFrom: 'user' })
    expect(plan.rows[0].root).toBe(cents(84))
  })

  it('lets a per-row override win over everything', () => {
    const plan = resolveRoots([{ name: 'C3.wav', fileRoot: cents(48) }], { overrides: { 'C3.wav': cents(72) } })
    expect(plan.rows[0]).toMatchObject({ root: cents(72), from: 'user' })
  })

  it('discards a folder that declares one note throughout, then reads the names instead', () => {
    const plan = resolveRoots([
      { name: 'C2.wav', fileRoot: cents(60) },
      { name: 'D2.wav', fileRoot: cents(60) },
    ])
    expect(plan.discardedFileRoots).toBe(true)
    expect(plan.rows.map((r) => [r.root, r.from])).toEqual([
      [cents(48), 'name'],
      [cents(50), 'name'],
    ])
  })

  it('interpolates a file whose name says nothing between two that do', () => {
    const plan = resolveRoots(named('1 C3.wav', '2 unnamed.wav', '3 unnamed.wav', '4 C4.wav'))
    expect(plan.rows.map((r) => [r.root, r.from])).toEqual([
      [cents(60), 'name'],
      [cents(64), 'between'],
      [cents(68), 'between'],
      [cents(72), 'name'],
    ])
  })

  it('flags what it cannot place instead of dropping it, either end of the folder', () => {
    const plan = resolveRoots(named('1 unnamed.wav', '2 C3.wav', '3 D3.wav', '4 unnamed.wav'))
    expect(plan.rows.map((r) => r.from)).toEqual(['unknown', 'name', 'name', 'unknown'])
    expect(plan.rows[0].root).toBeUndefined()
  })

  it('orders rows by file name, counting numbers as numbers', () => {
    const plan = resolveRoots(named('layer10 C4.wav', 'layer2 C3.wav'))
    expect(plan.rows.map((r) => r.name)).toEqual(['layer2 C3.wav', 'layer10 C4.wav'])
  })
})

describe('resolveRootsByFolder', () => {
  it('splits a set by the folder each file sits in, in folder-name order', () => {
    const plans = resolveRootsByFolder([
      { name: 'SAMPLES/Rhodes/C3.wav' },
      { name: 'SAMPLES/Piano/C3.wav' },
      { name: 'SAMPLES/Piano/D3.wav' },
    ])
    expect(plans.map((p) => [p.folder, p.rows.length])).toEqual([
      ['SAMPLES/Piano', 2],
      ['SAMPLES/Rhodes', 1],
    ])
  })

  it('keeps one folder’s discarded tags from deciding another folder’s roots', () => {
    // Piano is the lazy-exporter case — every file tagged C3, so its tags go
    // and its names carry it. Rhodes tags two files honestly. Pooled, the
    // discard check would see roots that differ and keep Piano's bad tags.
    const plans = resolveRootsByFolder([
      { name: 'SAMPLES/Piano/C3.wav', fileRoot: cents(60) },
      { name: 'SAMPLES/Piano/E3.wav', fileRoot: cents(60) },
      { name: 'SAMPLES/Rhodes/C3.wav', fileRoot: cents(48) },
      { name: 'SAMPLES/Rhodes/E3.wav', fileRoot: cents(52) },
    ])
    const [piano, rhodes] = plans
    expect(piano.discardedFileRoots).toBe(true)
    expect(piano.rows.map((r) => [r.root, r.from])).toEqual([
      [cents(60), 'name'],
      [cents(64), 'name'],
    ])
    expect(rhodes.discardedFileRoots).toBe(false)
    expect(rhodes.rows.map((r) => r.from)).toEqual(['file', 'file'])
  })

  it('fits each folder’s naming convention on its own', () => {
    // One library names middle C as C4 and one as C3; a single offset over
    // both would put one of them an octave out.
    const plans = resolveRootsByFolder([
      { name: 'SAMPLES/Salamander/C4.wav', fileRoot: cents(60) },
      { name: 'SAMPLES/Salamander/D4.wav' },
      { name: 'SAMPLES/Straight/C3.wav', fileRoot: cents(60) },
      { name: 'SAMPLES/Straight/D3.wav' },
    ])
    expect(plans.map((p) => [p.folder, p.offset, p.offsetFrom])).toEqual([
      ['SAMPLES/Salamander', -12, 'anchors'],
      ['SAMPLES/Straight', 0, 'anchors'],
    ])
    expect(plans.map((p) => p.rows[1].root)).toEqual([cents(62), cents(62)])
  })

  it('treats a file with no folder as its own group', () => {
    expect(sampleFolder('C3.wav')).toBe('')
    expect(resolveRootsByFolder([{ name: 'C3.wav' }]).map((p) => p.folder)).toEqual([''])
  })
})
