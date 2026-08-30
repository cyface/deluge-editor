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
