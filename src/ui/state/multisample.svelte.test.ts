/**
 * The multi-sample import (issue #33): one question, one folder, and ranges on
 * the oscillator. What is checked here is the part only the store owns — that
 * the folder lands as ranges with the firmware's boundaries, that a file it
 * cannot place is kept and can be given a root by hand rather than dropped,
 * and that a question dismissed leaves the oscillator as it was found.
 *
 * The roots cascade and the boundary arithmetic have their own tests
 * (`src/core/samples/roots.test.ts`, `src/core/preset/multisample.test.ts`).
 *
 * The WAVs are synthetic: a canonical 44-byte header is a public format, not a
 * claim about what the firmware writes, and none carries an embedded root — so
 * the file names carry these imports, which is the case the flow is shaped
 * around.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { removeRange, sampleRanges, setRangeFileName } from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import type { SoundElement } from '../../core/preset/types'
import { editor } from './editor.svelte'
import { multisample as ms } from './multisample.svelte'
import { samples } from './samples.svelte'

/**
 * A minimal 16-bit mono WAV of `frames` frames at 44.1 kHz, optionally
 * declaring `root` as its MIDI unity note in a `smpl` chunk — the strongest
 * signal in the cascade, and the one a file name can't stand in for.
 */
function wav(frames: number, root?: number): Uint8Array {
  const data = frames * 2
  const smpl = root === undefined ? 0 : 44
  const b = new Uint8Array(44 + data + smpl)
  const view = new DataView(b.buffer)
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + data + smpl, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 44100, true)
  view.setUint32(28, 88200, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, data, true)
  if (root !== undefined) {
    // `smpl` is 36 bytes: MIDIUnityNote is the fourth field, the loop count the eighth.
    ascii(44 + data, 'smpl')
    view.setUint32(48 + data, 36, true)
    view.setUint32(52 + data + 12, root, true)
  }
  return b
}

/** A dropped folder. A name paired with a note gets that note in its header. */
const drop = (...names: (string | [string, number])[]) =>
  names.map((entry) => {
    const relPath = typeof entry === 'string' ? entry : entry[0]
    const root = typeof entry === 'string' ? undefined : entry[1]
    return { relPath, file: new File([wav(4410, root) as BlobPart], relPath.split('/').pop() as string) }
  })

const osc1 = () => oscOf(editor.sound as SoundElement, 1)!
const built = () => sampleRanges(osc1()).map((r) => [r.fileName?.split('/').pop(), r.topNote])
const roots = () => sampleRanges(osc1()).map((r) => r.rootCents / 100)

beforeEach(() => {
  ms.cancel()
  ms.dismissSession()
  samples.reset()
  editor.load(synthTemplate, 'Test Synth.XML')
  ms.start(1)
})

describe('the source question', () => {
  it('makes the target a sample oscillator while it is open', () => {
    expect(osc1().attrs.type).toBe('sample')
    expect(oscOf(editor.sound as SoundElement, 2)!.attrs.type).toBe('square')
  })

  it('puts the waveform back when it is dismissed with no folder chosen', () => {
    ms.cancel()
    expect(osc1().attrs.type).toBe('square')
    expect(editor.changeCount).toBe(0)
  })

  it('keeps Sample when a sample was assigned by hand while it was open', () => {
    ms.start(1)
    sampleRangesAssign()
    ms.cancel()
    expect(osc1().attrs.type).toBe('sample')
  })
})

/** Stand in for the user pointing the oscillator at a file through the picker. */
function sampleRangesAssign(): void {
  osc1().attrs.fileName = 'SAMPLES/elsewhere.wav'
}

describe('reading a folder', () => {
  it('writes a range per sample, in root order, with the midpoint boundaries', async () => {
    await ms.addLocalFolder('Piano', drop('C4.wav', 'C3.wav', 'C5.wav'))
    expect(built()).toEqual([
      ['C3.wav', 66],
      ['C4.wav', 78],
      ['C5.wav', undefined],
    ])
    expect(ms.session).toMatchObject({ which: 1, folder: 'Piano', placed: 3 })
    expect(ms.open).toBe(false) // the question is answered and gone
  })

  it('stops showing the import row once another preset is loaded', async () => {
    // Provenance and left-out files describe particular ranges; over someone
    // else's ranges the same row would be a caption for the wrong instrument.
    await ms.addLocalFolder('Piano', drop('C3.wav', 'C5.wav'))
    editor.load(synthTemplate, 'Another Synth.XML')
    expect(ms.session).toBe(null)
  })

  it('stores the path the preset will carry, under the folder that was read', async () => {
    await ms.addLocalFolder('My Piano', drop('C3.wav', 'D3.wav'))
    expect(sampleRanges(osc1())[0].fileName).toBe('SAMPLES/My Piano/C3.wav')
  })

  it('says where each root came from', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav'))
    expect(ms.session?.from).toEqual({ 'SAMPLES/Piano/C3.wav': 'name', 'SAMPLES/Piano/D3.wav': 'name' })
  })

  it('hands the local bytes to the stash, so saving copies them to the card', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav'))
    expect(samples.pushable).toEqual(['SAMPLES/Piano/C3.wav', 'SAMPLES/Piano/D3.wav'])
  })

  it('refuses a folder where nothing says what note it is, and leaves the ranges alone', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav'))
    const before = editor.output
    ms.start(1)
    await ms.addLocalFolder('Field', drop('rec001.wav', 'rec002.wav'))
    expect(ms.error).toMatch(/what note/)
    expect(editor.output).toBe(before)
  })
})

describe('what the import could not place', () => {
  it('keeps a file with no note in its name, instead of dropping it', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav', 'zzz noise.wav'))
    expect(ms.session?.leftOut.map((l) => [l.base, l.reason])).toEqual([['zzz noise.wav', 'no root']])
    expect(built().length).toBe(2)
  })

  it('keeps one whose root leaves it no key band', async () => {
    // Three takes of the same note: the first gets the band up to its
    // midpoint, the next has nothing left between that and the same midpoint.
    await ms.addLocalFolder('Piano', drop('C3 b.wav', 'C3 c.wav', 'C3.wav', 'C5.wav'))
    expect(ms.session?.leftOut.map((l) => [l.base, l.reason])).toEqual([['C3 c.wav', 'no room']])
    expect(built().length).toBe(3)
  })

  it('puts one on the keyboard at the note it is given, splitting the range there', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'C5.wav', 'zzz noise.wav'))
    ms.assign('SAMPLES/Piano/zzz noise.wav', 96)
    expect(built().map((r) => r[0])).toEqual(['C3.wav', 'C5.wav', 'zzz noise.wav'])
    expect(roots().at(-1)).toBe(96)
    expect(ms.session?.leftOut).toEqual([])
    expect(ms.session?.from['SAMPLES/Piano/zzz noise.wav']).toBe('user')
  })

  it('still holds the bytes of one placed by hand, so saving copies it too', async () => {
    // The import keeps every file it read, not just the ones it could place:
    // a left-out row given a root is a range like any other, and a range whose
    // sample never reaches the card is silent on the instrument.
    await ms.addLocalFolder('Piano', drop('C3.wav', 'C5.wav', 'zzz noise.wav'))
    ms.assign('SAMPLES/Piano/zzz noise.wav', 96)
    expect(samples.pushable).toContain('SAMPLES/Piano/zzz noise.wav')
  })

  it('drops one from the list when it was never meant to be a key range', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav', 'zzz noise.wav'))
    ms.discard('SAMPLES/Piano/zzz noise.wav')
    expect(ms.session?.leftOut).toEqual([])
    expect(built().length).toBe(2)
  })
})

describe('shifting the whole instrument', () => {
  it('moves every root and boundary together, which is the offset a library needs', async () => {
    await ms.addLocalFolder('Piano', drop('C4.wav', 'C5.wav'))
    ms.shift(-12)
    expect(roots()).toEqual([60, 72])
    expect(built()).toEqual([
      ['C4.wav', 66],
      ['C5.wav', undefined],
    ])
    expect(ms.session?.offset).toBe(-12)
  })

  it('says so rather than pretending when the keyboard runs out', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'C5.wav'))
    ms.shift(48)
    ms.shift(48)
    expect(ms.notice).toMatch(/end of the keyboard/)
  })
})

describe('re-detecting the roots of ranges already there', () => {
  const tops = () => sampleRanges(osc1()).map((r) => r.topNote)

  /** A folder imported, then knocked an octave out, with the import's own row put away. */
  async function octaveOut() {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav', 'E3.wav'))
    ms.shift(12)
    ms.dismissSession()
  }

  it('proposes what would move, and writes nothing until it is applied', async () => {
    await octaveOut()
    expect(roots()).toEqual([72, 74, 76])
    await ms.redetect(1)
    expect(ms.plan?.changed).toBe(3)
    expect(ms.plan?.rows.map((r) => [r.was / 100, (r.root as number) / 100, r.from])).toEqual([
      [72, 60, 'name'],
      [74, 62, 'name'],
      [76, 64, 'name'],
    ])
    expect(roots()).toEqual([72, 74, 76])
    ms.applyRedetect()
    expect(roots()).toEqual([60, 62, 64])
  })

  it('never touches the boundaries, which are decisions rather than defects', async () => {
    await octaveOut()
    const before = tops()
    await ms.redetect(1)
    ms.applyRedetect()
    expect(tops()).toEqual(before)
  })

  it('leaves the ranges alone when the proposal is turned down', async () => {
    await octaveOut()
    await ms.redetect(1)
    ms.cancelRedetect()
    expect(ms.plan).toBeNull()
    expect(roots()).toEqual([72, 74, 76])
  })

  it('reads the note the WAV itself declares, over the one in its name', async () => {
    await ms.addLocalFolder('Piano', drop(['C3.wav', 48], ['E3.wav', 52]))
    expect(roots()).toEqual([48, 52])
    ms.shift(-5)
    ms.dismissSession()
    await ms.redetect(1)
    expect(ms.plan?.rows.map((r) => [(r.root as number) / 100, r.from])).toEqual([
      [48, 'file'],
      [52, 'file'],
    ])
  })

  it('keeps a range nothing can place, rather than moving it somewhere', async () => {
    await ms.addLocalFolder('Piano', drop('C3.wav', 'D3.wav', 'noise.wav'))
    ms.assign('SAMPLES/Piano/noise.wav', 70)
    ms.dismissSession()
    await ms.redetect(1)
    expect(ms.plan?.rows.map((r) => [r.base, r.from])).toEqual([
      ['C3.wav', 'name'],
      ['D3.wav', 'name'],
      ['noise.wav', 'kept'],
    ])
    expect(ms.plan?.changed).toBe(0)
    ms.applyRedetect()
    expect(roots()).toEqual([60, 62, 70])
    expect(ms.session?.kind).toBe('redetect')
    expect(ms.session?.from['SAMPLES/Piano/noise.wav']).toBe('kept')
  })

  it('says so when the answer would leave the roots out of key order', async () => {
    // What a repointed range looks like: the low band now holds the high
    // sample. The proposal is right about each file and wrong as an
    // instrument, which is worth saying before it is applied.
    await ms.addLocalFolder('Piano', drop('C3.wav', 'G3.wav'))
    setRangeFileName(osc1(), 0, 'SAMPLES/Piano/G3.wav')
    setRangeFileName(osc1(), 1, 'SAMPLES/Piano/C3.wav')
    ms.dismissSession()
    await ms.redetect(1)
    expect(ms.plan?.rows.map((r) => (r.root as number) / 100)).toEqual([67, 60])
    expect(ms.plan?.disordered).toBe(true)
  })

  it('refuses to write onto ranges that changed while it was on screen', async () => {
    await octaveOut()
    await ms.redetect(1)
    removeRange(osc1(), 0)
    ms.applyRedetect()
    expect(ms.error).toMatch(/changed while/)
    expect(ms.plan).toBeNull()
    expect(roots()).toEqual([74, 76])
  })

  it('has nothing to read on an oscillator with no samples', async () => {
    editor.load(synthTemplate, 'Test Synth.XML')
    await ms.redetect(1)
    expect(ms.plan).toBeNull()
    expect(ms.error).toMatch(/no samples/)
  })
})
