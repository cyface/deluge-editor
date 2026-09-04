/**
 * The sticky device-firmware rule (issue #7): connecting selects the device's
 * firmware, the selection survives disconnect and file loads, and the user
 * can still override. Fixtures are Deluge-authored, as always.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import community from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML?raw' // firmwareVersion="c1.3.0"
import official from '../../../tests/fixtures/official-4.0.1/Attribute Format Baseline.XML?raw' // firmwareVersion="4.0.1"
import blankKit from '../../assets/templates/Default Kit.XML?raw'
import { addSampleRows, rowTemplateFrom } from '../../core/kit/build'
import { drumRows, isKit, isSound } from '../../core/preset'
import { setParamMenu } from '../../core/preset/sound'
import { child, ensureChild, removeAttr, removeChild, setAttr } from '../../core/xml'
import { editor, FALLBACK_FIRMWARE } from './editor.svelte'

beforeEach(() => {
  editor.preset = null
  editor.source = null
  editor.firmware = FALLBACK_FIRMWARE
  editor.deviceFirmware = null
})

describe('firmware selection without a device', () => {
  it('follows the loaded file', () => {
    editor.load(official, 'Baseline.XML')
    expect(editor.firmware).toBe('4.0.1')
    editor.load(community, 'Default Synth.XML')
    expect(editor.firmware).toBe('c1.3.0')
  })
  it('adds an unlisted file version to the choices', () => {
    editor.load(official, 'Baseline.XML')
    expect(editor.firmwareChoices).toContain('4.0.1')
  })
})

describe('firmware selection with a device (issue #7)', () => {
  it('a device identity selects that firmware', () => {
    editor.setDeviceFirmware('c1.3.0')
    expect(editor.firmware).toBe('c1.3.0')
    expect(editor.deviceFirmware).toBe('c1.3.0')
  })
  it('the device outranks a loaded file, and sticks after loads', () => {
    editor.setDeviceFirmware('c1.3.0')
    editor.load(official, 'Baseline.XML')
    expect(editor.firmware).toBe('c1.3.0')
  })
  it('a user override sticks too', () => {
    editor.setDeviceFirmware('c1.3.0')
    editor.firmware = '4.1.4'
    editor.load(community, 'Default Synth.XML')
    expect(editor.firmware).toBe('4.1.4')
  })
  it('an unlisted device version stays in the choices even while overridden', () => {
    editor.setDeviceFirmware('c1.3.1')
    editor.firmware = '4.1.4'
    expect(editor.firmwareChoices).toContain('c1.3.1')
  })
  it('an unparseable identity is ignored', () => {
    editor.setDeviceFirmware('cgarbage')
    expect(editor.deviceFirmware).toBeNull()
    expect(editor.firmware).toBe(FALLBACK_FIRMWARE)
  })
})

describe('macOS sidecar rejection (issue #24)', () => {
  it('a ._ AppleDouble is refused with a plain message, not a parser error', () => {
    // The real thing is binary (magic 0x00051607); the name alone condemns it.
    editor.load('\x00\x05\x16\x07\x00\x02\x00\x00', '._Default Synth.XML')
    expect(editor.preset).toBeNull()
    expect(editor.error).toContain('macOS metadata sidecar')
    expect(editor.error).toContain('load Default Synth.XML instead')
  })
  it('the refusal leaves an already-loaded preset alone', () => {
    editor.load(community, 'Default Synth.XML')
    editor.load('junk', '._Default Synth.XML')
    expect(editor.fileName).toBe('Default Synth.XML')
    expect(editor.preset).not.toBeNull()
    expect(editor.identical).toBe(true)
  })
})

describe('New Synth (issue #25)', () => {
  it('loads the Deluge-authored init template, byte-identical from the first click', () => {
    editor.newSynth()
    expect(editor.preset?.tag).toBe('sound')
    expect(editor.identical).toBe(true)
    expect(editor.changeCount).toBe(0)
  })
  it('starts unnamed, so the card save flow must ask for a name', () => {
    editor.newSynth()
    expect(editor.fileName).toBe('')
  })
  it('selects the template writer’s firmware, c1.3.0', () => {
    editor.newSynth()
    expect(editor.firmware).toBe('c1.3.0')
  })
  it('a connected device still outranks the template’s provenance', () => {
    editor.setDeviceFirmware('c1.2.1')
    editor.newSynth()
    expect(editor.firmware).toBe('c1.2.1')
  })
})

/*
 * Issue #28. The pill gates controls; it is not a target the file is stamped
 * with. `firmwareVersion` is the reader's key for legacy fixups and
 * `earliestCompatibleFirmware` is its refuse-to-load floor, so restamping
 * either would change values on the instrument — see decisions.md, "A save
 * never restamps the file's firmware attributes".
 */
describe('retargeting never restamps the file (issue #28)', () => {
  const stamps = (xml: string) => [
    /firmwareVersion="([^"]*)"/.exec(xml)?.[1],
    /earliestCompatibleFirmware="([^"]*)"/.exec(xml)?.[1],
  ]

  it('a community file retargeted to official saves byte-identically', () => {
    editor.load(community, 'Default Synth.XML')
    editor.firmware = '4.1.4'
    expect(stamps(editor.output)).toEqual(['c1.3.0', '4.1.0-alpha'])
    expect(editor.changeCount).toBe(0)
    expect(editor.identical).toBe(true)
  })

  it('an official file retargeted to community saves byte-identically', () => {
    editor.load(official, 'Baseline.XML')
    editor.firmware = 'c1.3.0'
    expect(stamps(editor.output)).toEqual(['4.0.1', '4.0.0'])
    expect(editor.changeCount).toBe(0)
    expect(editor.identical).toBe(true)
  })

  it('a New Synth keeps the template writer’s stamps whatever the target', () => {
    editor.newSynth()
    editor.firmware = '4.1.4'
    expect(stamps(editor.output)).toEqual(['c1.3.0', '4.1.0-alpha'])
    expect(editor.identical).toBe(true)
  })

  it('a connected device does not restamp either', () => {
    editor.load(official, 'Baseline.XML')
    editor.setDeviceFirmware('c1.3.0')
    expect(stamps(editor.output)).toEqual(['4.0.1', '4.0.0'])
    expect(editor.identical).toBe(true)
  })
})

describe('per-change revert', () => {
  it('a changed value goes back to the file, byte-identically', () => {
    editor.load(community, 'Default Synth.XML')
    const sound = editor.preset!
    if (!isSound(sound)) throw new Error('fixture is a synth')
    setParamMenu(sound, 'lpfFrequency', 10)
    expect(editor.changeCount).toBe(1)
    editor.revert(editor.diff!.changed[0].path)
    expect(editor.changeCount).toBe(0)
    expect(editor.identical).toBe(true)
  })

  it('an added value is removed, and a container it created is pruned', () => {
    editor.load(official, 'Baseline.XML') // official 4.0.1 writes no <stutter>
    if (!isSound(editor.preset!)) throw new Error('fixture is a synth')
    setAttr(ensureChild(editor.preset, 'stutter'), 'quantized', '1')
    const added = editor.diff!.added
    expect(added.length).toBeGreaterThan(0)
    for (const p of [...added]) editor.revert(p)
    expect(editor.changeCount).toBe(0)
    expect(editor.identical).toBe(true)
  })

  it('a built kit collapses to one entry per row, and a group revert removes the row whole', () => {
    editor.newKit()
    if (!isKit(editor.preset!)) throw new Error('template is a kit')
    addSampleRows(editor.preset, rowTemplateFrom(blankKit), [
      { fileName: 'SAMPLES/T/Kick.wav', frames: 100 },
      { fileName: 'SAMPLES/T/Snare.wav', frames: 200 },
    ])
    // two rows added, the blank row gone: three entries, not hundreds
    expect(editor.changeCount).toBe(3)
    expect(editor.grouped!.addedGroups.map((g) => g.prefix)).toEqual([
      'kit/soundSources/sound[0]',
      'kit/soundSources/sound[1]',
    ])
    // the blank row can't be put back among the built rows: an appended copy
    // would land on a different indexed path and read as a new element
    expect(editor.canRestoreGroup('kit/soundSources/sound')).toBe(false)
    editor.revertGroup('kit/soundSources/sound[1]', 'added')
    expect(drumRows(editor.preset).map((r) => r.attrs.name)).toEqual(['Kick'])
    // one row on each side now: the paths line up again and the diff turns
    // per-value — the Kick row against the blank row, no groups left
    expect(editor.grouped!.addedGroups).toEqual([])
    expect(editor.grouped!.missingGroups).toEqual([])
    expect(editor.grouped!.changed.map((c) => c.path)).toContain('kit/soundSources/sound@name')
  })

  it('a removed element is rebuilt from the file, value-identically', () => {
    editor.load(community, 'Default Synth.XML')
    if (!isSound(editor.preset!)) throw new Error('fixture is a synth')
    removeChild(editor.preset, child(editor.preset, 'arpeggiator')!)
    expect(editor.grouped!.missingGroups.map((g) => g.prefix)).toEqual(['sound/arpeggiator'])
    expect(editor.canRestoreGroup('sound/arpeggiator')).toBe(true)
    editor.revertGroup('sound/arpeggiator', 'missing')
    expect(editor.changeCount).toBe(0) // every value is the file's again; only layout may differ
  })

  it('a removed value is restored from the file', () => {
    editor.load(community, 'Default Synth.XML')
    if (!isSound(editor.preset!)) throw new Error('fixture is a synth')
    const osc1 = child(editor.preset, 'osc1')!
    removeAttr(osc1, 'transpose')
    expect(editor.diff!.missing).toEqual(['sound/osc1@transpose'])
    editor.revert('sound/osc1@transpose')
    expect(editor.changeCount).toBe(0)
  })
})
