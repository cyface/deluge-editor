import { describe, expect, it } from 'vitest'
import initSynth from '../../assets/templates/Default Synth.XML?raw'
import { setEnvelopeMenu } from '../preset/sound'
import type { SoundElement } from '../preset/types'
import { parseXML } from '../xml'
import { setAttr } from '../xml/edit'
import { OSC_ATTR_ORDER, SOUND_ATTR_ORDER } from '../preset/order'
import { child } from '../xml/element'
import { patchFileName, randomPatchName } from './names'
import { makeRng } from './rng'

const sound = (): SoundElement => parseXML(initSynth) as SoundElement

/** Every name this sound can be given, across a hundred rng positions. */
const names = (s: SoundElement): string[] => Array.from({ length: 100 }, (_, i) => randomPatchName(s, makeRng(i)))

describe('randomPatchName', () => {
  it('is two upper-case words', () => {
    for (const name of names(sound())) expect(name).toMatch(/^[A-Z0-9]+ [A-Z0-9]+$/)
  })

  it('is the same for the same seed', () => {
    const s = sound()
    expect(randomPatchName(s, makeRng(4))).toBe(randomPatchName(s, makeRng(4)))
  })

  it('is not always the same two words', () => {
    expect(new Set(names(sound())).size).toBeGreaterThan(8)
  })

  it('says what the voice is made of', () => {
    const s = sound()
    setAttr(s, 'mode', 'fm', SOUND_ATTR_ORDER)
    expect(names(s).join(' ')).toMatch(/\b(FM|DX|OPERATOR)\b/)

    const ring = sound()
    setAttr(ring, 'mode', 'ringmod', SOUND_ATTR_ORDER)
    expect(names(ring).join(' ')).toMatch(/\b(RING|CLANG|METAL)\b/)

    const saw = sound()
    setAttr(child(saw, 'osc1')!, 'type', 'saw', OSC_ATTR_ORDER)
    expect(names(saw).join(' ')).toMatch(/\b(SAW|BRIGHT|BLADE)\b/)
  })

  it('says what the envelope does', () => {
    const plucked = sound()
    setEnvelopeMenu(plucked, 1, 'attack', 0)
    setEnvelopeMenu(plucked, 1, 'sustain', 2)
    expect(names(plucked).join(' ')).toMatch(/\b(PLUCK|STAB|BLIP|SPARK)\b/)

    const slow = sound()
    setEnvelopeMenu(slow, 1, 'attack', 30)
    setEnvelopeMenu(slow, 1, 'sustain', 40)
    expect(names(slow).join(' ')).toMatch(/\b(SWELL|RISE|BLOOM|TIDE)\b/)
  })

  it('never repeats the same word twice', () => {
    for (const name of names(sound())) {
      const [a, b] = name.split(' ')
      expect(a, name).not.toBe(b)
    }
  })

  it('handles an oscillator type it has no word for', () => {
    const s = sound()
    setAttr(child(s, 'osc1')!, 'type', 'inStereo', OSC_ATTR_ORDER)
    for (const name of names(s)) expect(name).toMatch(/^[A-Z0-9]+ [A-Z0-9]+$/)
  })
})

describe('patchFileName', () => {
  it('is the name the card browser will write', () => {
    expect(patchFileName('GLASS DRIFT')).toBe('GLASS DRIFT.XML')
  })
})
