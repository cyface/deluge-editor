/**
 * Choosing one sample for one oscillator. What is checked here is what the
 * store owns beyond the writers it calls: the path a local file is given, the
 * bytes it keeps so saving can copy them, and the repeat mode and tuning the
 * instrument would set for that file.
 *
 * The WAVs are synthetic — a canonical 44-byte header is a public format, not
 * a claim about what the firmware writes.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { monoWav as wav } from '../../../tests/helpers/wav'
import kitTemplate from '../../assets/templates/Default Kit.XML?raw'
import synthTemplate from '../../assets/templates/Default Synth.XML?raw'
import { OSC_ATTR_ORDER } from '../../core/preset/order'
import { rootName, sampleRanges } from '../../core/preset/ranges'
import { osc as oscOf } from '../../core/preset/sound'
import type { OscElement, SoundElement } from '../../core/preset/types'
import { setAttr } from '../../core/xml/edit'
import { editor } from './editor.svelte'
import { samplePick as pick } from './samplepick.svelte'
import { samples } from './samples.svelte'

const file = (name: string, frames: number) => new File([wav(frames) as BlobPart], name)
const osc1 = (): OscElement => oscOf(editor.sound as SoundElement, 1)!
const range = () => sampleRanges(osc1())[0]

beforeEach(() => {
  pick.cancel()
  samples.reset()
  editor.load(kitTemplate, 'Test Kit.XML')
  pick.start(osc1(), { label: 'U1' })
})

describe('a file from this computer', () => {
  it('lands on the oscillator with the whole file as its zone', async () => {
    await pick.useLocalFile(file('Kick.wav', 1000))
    expect(range().fileName).toBe('SAMPLES/Test Kit/Kick.wav')
    expect(range().zone?.attrs.endSamplePos).toBe('1000')
    expect(pick.open).toBe(false) // chosen, so the question is gone
  })

  it('keeps the bytes, so saving copies the sample to the card', async () => {
    await pick.useLocalFile(file('Kick.wav', 1000))
    expect(samples.pushable).toEqual(['SAMPLES/Test Kit/Kick.wav'])
  })

  it('refuses anything that is not a WAV, and writes nothing', async () => {
    const before = editor.output
    await pick.useLocalFile(new File(['nope'], 'Kick.aiff'))
    expect(pick.error).toMatch(/not a \.wav/)
    expect(editor.output).toBe(before)
  })

  it('leaves the oscillator alone when the question is dismissed', () => {
    pick.cancel()
    expect(editor.changeCount).toBe(0)
  })
})

describe('the repeat mode the instrument would set', () => {
  it('plays a short sample Once rather than cutting it off at note-off', async () => {
    await pick.useLocalFile(file('Kick.wav', 44100)) // one second
    expect(osc1().attrs.loopMode).toBe('1')
  })

  it('cuts a long one, which is the mode a two-second-plus sample gets', async () => {
    await pick.useLocalFile(file('Drone.wav', 44100 * 3))
    expect(osc1().attrs.loopMode).toBe('0')
  })

  it('leaves Loop alone, as the browser does', async () => {
    // `if (repeatMode == STRETCH || repeatMode == LOOP) {}` — sample_browser.cpp:975.
    setAttr(osc1(), 'loopMode', '2', OSC_ATTR_ORDER)
    await pick.useLocalFile(file('Kick.wav', 1000))
    expect(osc1().attrs.loopMode).toBe('2')
  })
})

/**
 * The synth half of the browser's branch: a chosen sample brings its own
 * pitch, so the same file plays at pitch across the keyboard
 * (`sample_browser.cpp:1034`).
 */
describe('the tuning the instrument would set', () => {
  beforeEach(() => {
    pick.cancel()
    samples.reset()
    editor.load(synthTemplate, 'Test Synth.XML')
    pick.start(osc1(), { label: 'Osc A' })
  })

  it('takes the root from the note in the file name, folded into the nearest octave', async () => {
    await pick.useLocalFile(file('Piano C5.wav', 1000))
    // C5 is two octaves up; a lone sample is folded back, so it plays at pitch.
    expect(range().transpose).toBe(0)
    expect(rootName(range().rootCents)).toBe('C3')
  })

  it('keeps a root close enough to middle C where it is', async () => {
    await pick.useLocalFile(file('Piano F3.wav', 1000))
    expect(rootName(range().rootCents)).toBe('F3')
  })

  it('keeps the octave for a sample joining others', async () => {
    await pick.useLocalFile(file('Piano C3.wav', 1000))
    pick.start(osc1(), { label: 'Osc A', target: { mode: 'add' } })
    await pick.useLocalFile(file('Piano C5.wav', 1000))
    const list = sampleRanges(osc1())
    expect(list.map((r) => rootName(r.rootCents))).toEqual(['C3', 'C5'])
  })

  it('leaves the tuning alone when nothing says what note the file is', async () => {
    await pick.useLocalFile(file('Kick.wav', 1000))
    expect(range().transpose).toBe(0)
    expect(range().cents).toBe(0)
  })

  it('gives a drum no pitch at all — every hit sounds one note', async () => {
    editor.load(kitTemplate, 'Test Kit.XML')
    pick.start(osc1(), { label: 'U1' })
    await pick.useLocalFile(file('Piano C5.wav', 1000))
    expect(range().transpose).toBe(0)
  })
})

describe('the caller', () => {
  beforeEach(() => {
    pick.cancel()
    samples.reset()
    editor.load(synthTemplate, 'Test Synth.XML')
    pick.start(osc1(), { label: 'Osc A' })
  })

  it('is told which range took the sample, so a selection can follow', async () => {
    let landed = -1
    await pick.useLocalFile(file('Piano C3.wav', 1000))
    pick.start(osc1(), { label: 'Osc A', target: { mode: 'add' }, onDone: (i) => (landed = i) })
    await pick.useLocalFile(file('Piano C5.wav', 1000))
    expect(landed).toBe(1)
  })

  it('is offered the whole folder only when it asked for it', () => {
    expect(pick.offersFolder).toBe(false)
    pick.start(osc1(), { label: 'U1', onFolder: () => {} })
    expect(pick.offersFolder).toBe(true)
  })
})

describe('the card browser', () => {
  const entries = [
    { name: 'Hats', dir: true },
    { name: 'Kick.wav', dir: false },
    { name: 'notes.txt', dir: false },
  ]
  beforeEach(() => {
    // The listing as browseCard would leave it — no Deluge is reached here.
    pick.cardPath = '/SAMPLES/Drums'
    pick.cardEntries = entries
  })

  it('picks a WAV out for Select, and nothing else', async () => {
    await pick.chooseCard(entries[2])
    expect(pick.selected).toBeNull()
    await pick.chooseCard(entries[1])
    expect(pick.selected).toBe('Kick.wav')
    expect(pick.open).toBe(true) // picked out, not yet taken
  })

  it('hands the folder to the caller and closes', async () => {
    let given: [string, number] | null = null
    pick.start(osc1(), { label: 'U1', onFolder: (path, list) => void (given = [path, list.length]) })
    pick.cardPath = '/SAMPLES/Drums'
    pick.cardEntries = entries
    expect(pick.folderHasWavs).toBe(true)
    await pick.useFolder()
    expect(given).toEqual(['/SAMPLES/Drums', 3])
    expect(pick.open).toBe(false)
  })

  it('offers no folder with no WAV in it', () => {
    pick.cardEntries = [entries[0], entries[2]]
    expect(pick.folderHasWavs).toBe(false)
  })
})
