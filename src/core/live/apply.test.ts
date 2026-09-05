/**
 * Applying the device's changes: the value lands on the attribute the file
 * holds it in, an attribute the file lacked is created where the firmware
 * writes it (so the regenerated file is byte-identical to the fixture), and
 * a change that addresses nothing here is refused rather than misfiled.
 */
import { describe, expect, it } from 'vitest'
import { fixtureText } from '../../../tests/helpers/fixtures'
import { hexToInt } from '../params/hex'
import { findAtPath } from '../xml/path'
import { flattenXML, generateXML, parseXML } from '../xml'
import { applyChange, changePath, type LiveChange } from './apply'

/** Remove one attribute from the tree, apply the change that restores its value, and expect the fixture's bytes back. */
function restores(fixture: string, path: string, change: Omit<LiveChange, 'value'>): void {
  const text = fixtureText(fixture)
  const flat = flattenXML(text)
  const hex = flat.get(path)
  expect(hex, path).toBeDefined()
  const tree = parseXML(text)
  const ref = findAtPath(tree, path)!
  delete ref.el.attrs[ref.attr]
  expect(applyChange(tree, { ...change, value: hexToInt(hex!) })).toBe(path)
  expect(generateXML(tree)).toBe(text)
}

describe('applyChange on a synth', () => {
  it('writes the value where the file keeps it', () => {
    const tree = parseXML(fixtureText('Default Synth'))
    expect(applyChange(tree, { name: 'lpfFrequency', value: 0x40000000 })).toBe('sound/defaultParams@lpfFrequency')
    expect(flattenXML(generateXML(tree)).get('sound/defaultParams@lpfFrequency')).toBe('0x40000000')
    expect(applyChange(tree, { name: 'pan', value: -0x20000000 })).toBe('sound/defaultParams@pan')
    expect(flattenXML(generateXML(tree)).get('sound/defaultParams@pan')).toBe('0xE0000000')
  })
  it('creates a missing attribute at the writer\'s position: the file comes back byte-identical', () => {
    restores('Default Synth', 'sound/defaultParams@volume', { name: 'volumePostFX' })
    restores('Default Synth', 'sound/defaultParams@lfo1Rate', { name: 'lfo1Rate' })
    restores('Default Synth', 'sound/defaultParams/envelope1@attack', { name: 'env1Attack' })
    restores('Default Synth', 'sound/defaultParams/equalizer@bassFrequency', { name: 'bassFreq' })
  })
  it('sets a cable amount on the cable with that source and destination', () => {
    const tree = parseXML(fixtureText('Sine AnalogSaw Patch Cables'))
    const path = applyChange(tree, { name: 'lpfFrequency', src: 'y', value: 0x20000000 })
    expect(path).toBe('sound/defaultParams/patchCables/patchCable[3]@amount')
    const flat = flattenXML(generateXML(tree))
    expect(flat.get(path!)).toBe('0x20000000')
    expect(flat.get('sound/defaultParams/patchCables/patchCable[2]@amount')).toBe('0x3FFFFFE8') // envelope2 → lpfFrequency untouched
  })
  it('refuses a cable the tree does not have, so the caller pulls instead of inventing one', () => {
    const tree = parseXML(fixtureText('Sine AnalogSaw Patch Cables'))
    const before = generateXML(tree)
    expect(changePath(tree, { name: 'pan', src: 'lfo2', value: 1 })).toBeNull()
    expect(applyChange(tree, { name: 'pan', src: 'lfo2', value: 1 })).toBeNull()
    expect(generateXML(tree)).toBe(before)
  })
  it('refuses a row or bus address on a synth, and a name it does not know', () => {
    const tree = parseXML(fixtureText('Default Synth'))
    expect(applyChange(tree, { name: 'volumePostFX', drum: 0, value: 1 })).toBeNull()
    expect(applyChange(tree, { name: 'volumePostFX', bus: true, value: 1 })).toBeNull()
    expect(applyChange(tree, { name: 'noSuchParam', value: 1 })).toBeNull()
  })
})

describe('applyChange on a kit', () => {
  it('writes the bus into <kit><defaultParams>, including the filter and delay children', () => {
    restores('Kit Sample Rows', 'kit/defaultParams@volume', { name: 'volume', bus: true })
    restores('Kit Sample Rows', 'kit/defaultParams/lpf@frequency', { name: 'lpfFrequency', bus: true })
    restores('Kit Sample Rows', 'kit/defaultParams/delay@rate', { name: 'delayRate', bus: true })
    restores('Kit Sample Rows', 'kit/defaultParams@sidechainCompressorShape', { name: 'compressorShape', bus: true })
  })
  it('writes a row by drum index', () => {
    restores('Kit Sample Rows', 'kit/soundSources/sound[1]/defaultParams@volume', { name: 'volumePostFX', drum: 1 })
    restores('Kit Sample Rows', 'kit/soundSources/sound[2]/defaultParams/envelope1@release', { name: 'env1Release', drum: 2 })
  })
  it('counts MIDI and gate rows when indexing, and refuses them and rows the kit lacks', () => {
    const tree = parseXML(fixtureText('Kit MIDI CV Rows'))
    expect(changePath(tree, { name: 'volumePostFX', drum: 0, value: 0 })).toBe('kit/soundSources/sound/defaultParams@volume')
    expect(applyChange(tree, { name: 'volumePostFX', drum: 1, value: 0 })).toBeNull() // the midiOutput row
    expect(applyChange(tree, { name: 'volumePostFX', drum: 2, value: 0 })).toBeNull() // the gateOutput row
    expect(applyChange(tree, { name: 'volumePostFX', drum: 3, value: 0 })).toBeNull()
    expect(applyChange(tree, { name: 'volumePostFX', value: 0 })).toBeNull() // neither row nor bus on a kit
  })
})
