/**
 * The sticky device-firmware rule (issue #7): connecting selects the device's
 * firmware, the selection survives disconnect and file loads, and the user
 * can still override. Fixtures are Deluge-authored, as always.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import community from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML?raw' // firmwareVersion="c1.3.0"
import official from '../../../tests/fixtures/official-4.0.1/Attribute Format Baseline.XML?raw' // firmwareVersion="4.0.1"
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

describe('per-change revert', () => {
  it('a changed value goes back to the file, byte-identically', async () => {
    const { setParamMenu } = await import('../../core/preset/sound')
    const { isSound } = await import('../../core/preset')
    editor.load(community, 'Default Synth.XML')
    const sound = editor.preset!
    if (!isSound(sound)) throw new Error('fixture is a synth')
    setParamMenu(sound, 'lpfFrequency', 10)
    expect(editor.changeCount).toBe(1)
    editor.revert(editor.diff!.changed[0].path)
    expect(editor.changeCount).toBe(0)
    expect(editor.identical).toBe(true)
  })

  it('an added value is removed, and a container it created is pruned', async () => {
    const { ensureChild, setAttr } = await import('../../core/xml')
    const { isSound } = await import('../../core/preset')
    editor.load(official, 'Baseline.XML') // official 4.0.1 writes no <stutter>
    if (!isSound(editor.preset!)) throw new Error('fixture is a synth')
    setAttr(ensureChild(editor.preset, 'stutter'), 'quantized', '1')
    const added = editor.diff!.added
    expect(added.length).toBeGreaterThan(0)
    for (const p of [...added]) editor.revert(p)
    expect(editor.changeCount).toBe(0)
    expect(editor.identical).toBe(true)
  })

  it('a removed value is restored from the file', async () => {
    const { removeAttr, child } = await import('../../core/xml')
    const { isSound } = await import('../../core/preset')
    editor.load(community, 'Default Synth.XML')
    if (!isSound(editor.preset!)) throw new Error('fixture is a synth')
    const osc1 = child(editor.preset, 'osc1')!
    removeAttr(osc1, 'transpose')
    expect(editor.diff!.missing).toEqual(['sound/osc1@transpose'])
    editor.revert('sound/osc1@transpose')
    expect(editor.changeCount).toBe(0)
  })
})
