import { describe, expect, it } from 'vitest'
import { CardError } from '../core/library'
import { NO_REPLY, SHORT_WRITE, SysexError } from '../core/sysex'
import { errorText } from './errtext'

describe('errorText', () => {
  it('a FatFS failure is a sentence about the file, with the FR_ name kept for the log only', () => {
    const e = new SysexError('open', '/SYNTHS/NOPE.XML', 4)
    expect(e.message).toContain('FR_NO_FILE')
    expect(errorText(e)).toBe('Could not open /SYNTHS/NOPE.XML: no such file')
  })

  it('a listing failure uses the verb a user did, not the protocol op', () => {
    expect(errorText(new SysexError('dir', '/NOPE', 5))).toBe('Could not list /NOPE: no such folder')
  })

  it('every FatFS code renders without its FR_ name', () => {
    for (let code = 1; code < 20; code++) {
      expect(errorText(new SysexError('open', '/X', code))).not.toMatch(/FR_|FRESULT/)
    }
  })

  it('a persistent short write blames the transport, not the card', () => {
    const e = new SysexError('write', '/SAMPLES/K.wav', SHORT_WRITE)
    expect(e.fromCard).toBe(false)
    expect(errorText(e)).toBe('Could not write /SAMPLES/K.wav: the Deluge accepted fewer bytes than were sent')
    expect(errorText(e)).not.toMatch(/SD card|FR_/)
  })

  it('a silent Deluge on ping, which has no path', () => {
    expect(errorText(new SysexError('ping', '', NO_REPLY))).toBe('No reply from the Deluge')
  })

  it('a CardError over SysEx is read through to the protocol error underneath', () => {
    const cause = new SysexError('rename', '/SAMPLES/A.wav → /SAMPLES/B.wav', 8)
    const e = new CardError('exists', cause.message, { cause })
    expect(e.message).toContain('FR_EXIST')
    expect(errorText(e)).toBe('Could not rename /SAMPLES/A.wav → /SAMPLES/B.wav: a file or folder with that name already exists')
  })

  it('a CardError from a mounted card is its own message', () => {
    expect(errorText(new CardError('notFound', '/SAMPLES/X.wav: no such file or folder on the card'))).toBe(
      '/SAMPLES/X.wav: no such file or folder on the card',
    )
  })

  it('a plain Error is its message in sentence case without a trailing period', () => {
    expect(errorText(new Error('no Deluge MIDI port found — connect the Deluge over USB.'))).toBe(
      'No Deluge MIDI port found — connect the Deluge over USB',
    )
  })

  it('anything that is not an Error gets the fixed fallback', () => {
    expect(errorText('boom')).toBe('Something went wrong')
    expect(errorText(undefined)).toBe('Something went wrong')
    expect(errorText(new Error(''))).toBe('Something went wrong')
  })
})
