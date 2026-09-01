import { describe, expect, it } from 'vitest'
import blankKit from '../../assets/templates/Default Kit.XML?raw'
import { drumRows, type KitElement, type SoundElement } from '../preset'
import { diffFlat, flattenXML, generateXML, isClean, parseXML } from '../xml'
import { child } from '../xml/element'
import { addSampleRows, isBlankRow, moveRow, removeRow, renameRow, rowNameFor, rowTemplateFrom } from './build'

const freshKit = (): KitElement => parseXML(blankKit) as KitElement
const template = (): SoundElement => rowTemplateFrom(blankKit)

const SPECS = [
  { fileName: 'SAMPLES/Test Kit/Kick.wav', frames: 48000 },
  { fileName: 'SAMPLES/Test Kit/Snare.wav', frames: 24000 },
  { fileName: 'SAMPLES/Test Kit/Closed Hat.wav', frames: 8000 },
]

describe('addSampleRows', () => {
  it('replaces the blank new-kit row and appends one row per sample', () => {
    const kit = freshKit()
    expect(drumRows(kit).filter(isBlankRow).length).toBe(1)
    addSampleRows(kit, template(), SPECS)
    const rows = drumRows(kit)
    expect(rows.length).toBe(3)
    expect(rows.filter(isBlankRow).length).toBe(0)
    expect(rows.map((r) => r.attrs.name)).toEqual(['Kick', 'Snare', 'Closed Hat'])
  })

  it('sets only file, zone, loop mode and name; everything else is the template row', () => {
    const kit = freshKit()
    const [row] = addSampleRows(kit, template(), [SPECS[0]])
    const o = child(row, 'osc1')!
    expect(o.attrs.fileName).toBe('SAMPLES/Test Kit/Kick.wav')
    expect(o.attrs.loopMode).toBe('1') // ONCE, like every factory drum row
    const zone = child(o, 'zone')!
    expect(zone.attrs.startSamplePos).toBe('0')
    expect(zone.attrs.endSamplePos).toBe('48000')
    // the rest of the sound is untouched template material
    expect(row.attrs.polyphonic).toBe('auto')
    expect(child(row, 'modKnobs')?.children.length).toBe(16)
  })

  it('the built kit serialises cleanly and a second save is byte-identical', () => {
    const kit = freshKit()
    addSampleRows(kit, template(), SPECS)
    const once = generateXML(kit)
    const reparsed = parseXML(once)
    expect(diffFlat(flattenXML(once), flattenXML(generateXML(reparsed)))).toSatisfy(isClean)
    expect(generateXML(reparsed)).toBe(once)
  })

  it('duplicate sample names get unique row names', () => {
    const kit = freshKit()
    const rows = addSampleRows(kit, template(), [
      { fileName: 'SAMPLES/K/Kick.wav', frames: 10 },
      { fileName: 'SAMPLES/K/Sub/Kick.wav', frames: 20 },
    ])
    expect(rows.map((r) => r.attrs.name)).toEqual(['Kick', 'Kick 2'])
  })

  it('appending to a kit that already has real rows keeps them', () => {
    const kit = freshKit()
    addSampleRows(kit, template(), [SPECS[0]])
    addSampleRows(kit, template(), [SPECS[1]])
    expect(drumRows(kit).map((r) => r.attrs.name)).toEqual(['Kick', 'Snare'])
  })
})

describe('row edits', () => {
  it('moveRow reorders within soundSources', () => {
    const kit = freshKit()
    addSampleRows(kit, template(), SPECS)
    moveRow(kit, 2, 0)
    expect(drumRows(kit).map((r) => r.attrs.name)).toEqual(['Closed Hat', 'Kick', 'Snare'])
    moveRow(kit, 0, 99) // clamped to the end
    expect(drumRows(kit).map((r) => r.attrs.name)).toEqual(['Kick', 'Snare', 'Closed Hat'])
  })

  it('removeRow and renameRow', () => {
    const kit = freshKit()
    addSampleRows(kit, template(), SPECS)
    removeRow(kit, drumRows(kit)[1])
    renameRow(drumRows(kit)[0], 'BD')
    expect(drumRows(kit).map((r) => r.attrs.name)).toEqual(['BD', 'Closed Hat'])
  })
})

describe('rowNameFor', () => {
  it('is the base name without the extension', () => {
    expect(rowNameFor('SAMPLES/My Kit/808 Kick.wav')).toBe('808 Kick')
    expect(rowNameFor('Snare.WAV')).toBe('Snare')
  })
})
