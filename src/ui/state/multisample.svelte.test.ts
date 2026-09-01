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
import { sampleRanges } from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import type { SoundElement } from '../../core/preset/types'
import { editor } from './editor.svelte'
import { multisample as ms } from './multisample.svelte'
import { samples } from './samples.svelte'

/** A minimal 16-bit mono WAV of `frames` frames at 44.1 kHz. */
function wav(frames: number): Uint8Array {
  const data = frames * 2
  const b = new Uint8Array(44 + data)
  const view = new DataView(b.buffer)
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + data, true)
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
  return b
}

const drop = (...names: string[]) =>
  names.map((relPath) => ({ relPath, file: new File([wav(4410) as BlobPart], relPath.split('/').pop() as string) }))

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
