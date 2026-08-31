import { describe, expect, it } from 'vitest'
import blankKit from '../../assets/templates/Default Kit.XML?raw'
import initSynth from '../../assets/templates/Default Synth.XML?raw'
import { addSampleRows, rowTemplateFrom } from '../kit/build'
import type { KitElement, SoundElement } from '../preset'
import { ensureChild, setAttr } from './edit'
import { child } from './element'
import { diffFlat, flattenXML } from './flatten'
import { groupFlatDiff } from './group'
import { generateXML, parseXML } from './index'

const SPECS = [
  { fileName: 'SAMPLES/Test Kit/Kick.wav', frames: 48000 },
  { fileName: 'SAMPLES/Test Kit/Snare.wav', frames: 24000 },
  { fileName: 'SAMPLES/Test Kit/Closed Hat.wav', frames: 8000 },
]

/** The screenshot scenario: rows built from samples against the blank-kit file. */
const builtKitDiff = () => {
  const expected = flattenXML(blankKit)
  const kit = parseXML(blankKit) as KitElement
  addSampleRows(kit, rowTemplateFrom(blankKit), SPECS)
  const actual = flattenXML(generateXML(kit))
  return { grouped: groupFlatDiff(diffFlat(expected, actual), expected, actual), actual }
}

describe('groupFlatDiff', () => {
  it('collapses each built kit row to one added group, and the blank row to one removed group', () => {
    const { grouped } = builtKitDiff()
    expect(grouped.addedGroups.map((g) => g.prefix)).toEqual([
      'kit/soundSources/sound[0]',
      'kit/soundSources/sound[1]',
      'kit/soundSources/sound[2]',
    ])
    expect(grouped.missingGroups.map((g) => g.prefix)).toEqual(['kit/soundSources/sound'])
    // nothing else differs: the collapse accounts for the whole diff
    expect(grouped.added).toEqual([])
    expect(grouped.missing).toEqual([])
    expect(grouped.changed).toEqual([])
  })

  it('a group carries every collapsed path, none dropped', () => {
    const { grouped, actual } = builtKitDiff()
    const inGroups = grouped.addedGroups.reduce((n, g) => n + g.paths.length, 0)
    const rowPaths = [...actual.keys()].filter((p) => p.startsWith('kit/soundSources/sound['))
    expect(inGroups).toBe(rowPaths.length)
    expect(grouped.addedGroups[0].paths).toContain('kit/soundSources/sound[0]/osc1@fileName')
  })

  it('a value added to an element both sides have stays individual', () => {
    const expected = flattenXML(initSynth)
    const sound = parseXML(initSynth) as SoundElement
    setAttr(sound, 'sideChainSend', '2147483647')
    const actual = flattenXML(generateXML(sound))
    const grouped = groupFlatDiff(diffFlat(expected, actual), expected, actual)
    expect(grouped.added).toEqual(['sound@sideChainSend'])
    expect(grouped.addedGroups).toEqual([])
  })

  it('a new element with a single value keeps its per-value row', () => {
    const expected = flattenXML(initSynth)
    const sound = parseXML(initSynth) as SoundElement
    setAttr(ensureChild(child(sound, 'osc1')!, 'zone'), 'startSamplePos', '0')
    const actual = flattenXML(generateXML(sound))
    const grouped = groupFlatDiff(diffFlat(expected, actual), expected, actual)
    expect(grouped.added).toEqual(['sound/osc1/zone@startSamplePos'])
    expect(grouped.addedGroups).toEqual([])
  })

  it('a new element with several values groups under it, not under its existing parent', () => {
    const expected = flattenXML(initSynth)
    const sound = parseXML(initSynth) as SoundElement
    const zone = ensureChild(child(sound, 'osc1')!, 'zone')
    setAttr(zone, 'startSamplePos', '0')
    setAttr(zone, 'endSamplePos', '48000')
    const actual = flattenXML(generateXML(sound))
    const grouped = groupFlatDiff(diffFlat(expected, actual), expected, actual)
    expect(grouped.addedGroups.map((g) => g.prefix)).toEqual(['sound/osc1/zone'])
    expect(grouped.addedGroups[0].paths).toEqual(['sound/osc1/zone@startSamplePos', 'sound/osc1/zone@endSamplePos'])
    expect(grouped.added).toEqual([])
  })

  it('changed values pass through untouched', () => {
    const expected = flattenXML(initSynth)
    const sound = parseXML(initSynth) as SoundElement
    setAttr(sound, 'polyphonic', 'mono')
    const actual = flattenXML(generateXML(sound))
    const grouped = groupFlatDiff(diffFlat(expected, actual), expected, actual)
    expect(grouped.changed).toEqual([{ path: 'sound@polyphonic', expected: 'poly', actual: 'mono' }])
  })
})
