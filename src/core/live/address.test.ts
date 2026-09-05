/**
 * The flat-path → `param` translation, against Deluge-authored presets: every
 * name it produces is one the firmware's `fileStringToParam` knows, the two
 * spellings that differ between a synth and the kit bus come out right, kit
 * rows are counted the way `Kit::getDrumIndex` counts them, and everything
 * that is not an `AutoParam` is sent to the whole-document path.
 */
import { describe, expect, it } from 'vitest'
import { allFixtures, fixtureText } from '../../../tests/helpers/fixtures'
import { PARAM_NAMES, SOUND_PARAM_ATTRS } from '../preset/params'
import { flattenXML, parseXML } from '../xml'
import { classifyPath, rowSegments } from './address'
import { changePath } from './apply'

const synth = flattenXML(fixtureText('Default Synth'))
const cabled = flattenXML(fixtureText('Sine AnalogSaw Patch Cables'))
const nested = flattenXML(fixtureText('Subtractive Many Patch Cables'))
const kit = flattenXML(fixtureText('Kit Sample Rows'))
const mixedKit = flattenXML(fixtureText('Kit MIDI CV Rows'))

describe('a synth', () => {
  it('addresses every <defaultParams> attribute by its cable name, with no row or bus', () => {
    for (const attr of SOUND_PARAM_ATTRS) {
      const a = classifyPath(`sound/defaultParams@${attr}`, synth)
      expect(a, attr).not.toBeNull()
      expect(PARAM_NAMES, `${attr} → ${a!.name}`).toContain(a!.name)
      expect(a!.drum).toBeUndefined()
      expect(a!.bus).toBeUndefined()
    }
  })
  it('uses the patched spellings the firmware scans first', () => {
    // fileStringToParam(UNPATCHED_SOUND, name, allowPatched) hits LOCAL_VOLUME for "volume";
    // <defaultParams volume> is GLOBAL_VOLUME_POST_FX.
    expect(classifyPath('sound/defaultParams@volume', synth)).toEqual({ name: 'volumePostFX' })
    expect(classifyPath('sound/defaultParams@pitchAdjust', synth)).toEqual({ name: 'pitch' })
    expect(classifyPath('sound/defaultParams@oscAPulseWidth', synth)).toEqual({ name: 'oscAPhaseWidth' })
    expect(classifyPath('sound/defaultParams@modulator1Amount', synth)).toEqual({ name: 'modulator1Volume' })
    expect(classifyPath('sound/defaultParams@arpeggiatorRate', synth)).toEqual({ name: 'arpRate' })
  })
  it('reaches the envelope and equalizer children', () => {
    expect(classifyPath('sound/defaultParams/envelope1@attack', synth)).toEqual({ name: 'env1Attack' })
    expect(classifyPath('sound/defaultParams/envelope4@release', synth)).toEqual({ name: 'env4Release' })
    expect(classifyPath('sound/defaultParams/equalizer@bassFrequency', synth)).toEqual({ name: 'bassFreq' })
  })
  it('sends everything that is not an AutoParam to the whole-document path', () => {
    for (const p of ['sound@polyphonic', 'sound/osc1@type', 'sound/lfo1@type', 'sound/unison@num', 'sound/arpeggiator@mode', 'sound@firmwareVersion']) {
      expect(classifyPath(p, synth), p).toBeNull()
    }
  })
  it('addresses a cable amount by destination and source, from the cable itself', () => {
    const paths = [...cabled.keys()].filter((p) => /patchCable(\[\d+\])?@amount$/.test(p))
    expect(paths.length).toBe(6)
    for (const p of paths) {
      const el = p.slice(0, p.lastIndexOf('@'))
      expect(classifyPath(p, cabled), p).toEqual({ name: cabled.get(`${el}@destination`), src: cabled.get(`${el}@source`) })
    }
    // the cable's other attributes are structure, not values
    expect(classifyPath('sound/defaultParams/patchCables/patchCable[0]@source', cabled)).toBeNull()
    expect(classifyPath('sound/defaultParams/patchCables/patchCable[0]@polarity', cabled)).toBeNull()
  })
  it('does not address a cable that modulates another cable (the protocol cannot)', () => {
    const deep = [...nested.keys()].filter((p) => p.includes('depthControlledBy') && p.endsWith('@amount'))
    expect(deep.length).toBeGreaterThan(0)
    for (const p of deep) expect(classifyPath(p, nested), p).toBeNull()
  })
})

describe('a kit', () => {
  it('addresses the bus by the UNPATCHED_GLOBAL spellings', () => {
    expect(classifyPath('kit/defaultParams@volume', kit)).toEqual({ name: 'volume', bus: true })
    expect(classifyPath('kit/defaultParams@pitchAdjust', kit)).toEqual({ name: 'pitchAdjust', bus: true })
    expect(classifyPath('kit/defaultParams@sidechainCompressorShape', kit)).toEqual({ name: 'compressorShape', bus: true })
    expect(classifyPath('kit/defaultParams@bitCrush', kit)).toEqual({ name: 'bitcrushAmount', bus: true })
    expect(classifyPath('kit/defaultParams@arpeggiatorGate', kit)).toEqual({ name: 'arpGate', bus: true })
    expect(classifyPath('kit/defaultParams/lpf@frequency', kit)).toEqual({ name: 'lpfFrequency', bus: true })
    expect(classifyPath('kit/defaultParams/delay@feedback', kit)).toEqual({ name: 'delayFeedback', bus: true })
    expect(classifyPath('kit/defaultParams/equalizer@treble', kit)).toEqual({ name: 'treble', bus: true })
  })
  it('has no name for tempo (paramNameForFile has none for UNPATCHED_TEMPO)', () => {
    expect(classifyPath('kit/defaultParams@tempo', kit)).toBeNull()
  })
  it('addresses a row by its position among all rows', () => {
    const segs = rowSegments(kit)
    expect(segs.length).toBeGreaterThan(1)
    segs.forEach((seg, i) => {
      expect(classifyPath(`kit/soundSources/${seg}/defaultParams@volume`, kit), seg).toEqual({ name: 'volumePostFX', drum: i })
      expect(classifyPath(`kit/soundSources/${seg}/defaultParams/envelope1@attack`, kit), seg).toEqual({ name: 'env1Attack', drum: i })
    })
  })
  it('counts MIDI and gate rows in the drum index, and gives them no parameters', () => {
    expect(rowSegments(mixedKit)).toEqual(['sound', 'midiOutput', 'gateOutput'])
    expect(classifyPath('kit/soundSources/sound/defaultParams@volume', mixedKit)).toEqual({ name: 'volumePostFX', drum: 0 })
    expect(classifyPath('kit/soundSources/midiOutput@channel', mixedKit)).toBeNull()
    expect(classifyPath('kit/soundSources/gateOutput@channel', mixedKit)).toBeNull()
    expect(classifyPath('kit/soundSources/sound@name', mixedKit)).toBeNull()
  })
})

describe('across every fixture', () => {
  it('every fast-path address names a parameter the firmware has, and maps back to the same path', () => {
    for (const [name, text] of allFixtures()) {
      const preset = parseXML(text)
      const flat = flattenXML(text)
      let fast = 0
      for (const path of flat.keys()) {
        const a = classifyPath(path, flat)
        if (!a) continue
        fast++
        expect(PARAM_NAMES, `${name}: ${path} → ${a.name}`).toContain(a.name)
        expect(changePath(preset, { ...a, value: 0 }), `${name}: ${path}`).toBe(path)
      }
      expect(fast, `${name} has fast-path values`).toBeGreaterThan(0)
    }
  })
})
