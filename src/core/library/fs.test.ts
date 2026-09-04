/**
 * The card as the library code sees it: paths in the protocol's form, the
 * XML's form, and what FAT accepts as a name.
 */
import { describe, expect, it } from 'vitest'
import { SysexError } from '../sysex'
import { CardError, baseName, cardErrorCode, cardPath, decodeXml, encodeXml, isNotFound, joinPath, parentOf, xmlPath } from './fs'
import { nameProblem } from './move'

describe('paths', () => {
  it('splits a protocol path into folder and name', () => {
    expect(parentOf('/SAMPLES/Drums/Kick.wav')).toBe('/SAMPLES/Drums')
    expect(parentOf('/SAMPLES')).toBe('/')
    expect(parentOf('/')).toBe('/')
    expect(baseName('/SAMPLES/Drums/Kick.wav')).toBe('Kick.wav')
    expect(baseName('/SAMPLES')).toBe('SAMPLES')
  })

  it('joins without doubling the root slash', () => {
    expect(joinPath('/', 'SAMPLES')).toBe('/SAMPLES')
    expect(joinPath('/SAMPLES/Drums', 'Kick.wav')).toBe('/SAMPLES/Drums/Kick.wav')
    expect(parentOf(joinPath('/SAMPLES/Drums', 'Kick.wav'))).toBe('/SAMPLES/Drums')
  })

  it('converts between the XML form and the protocol form, whatever the slashes', () => {
    // The XML carries `SAMPLES/…` with no leading slash; the protocol wants one.
    expect(cardPath('SAMPLES/Drums/Kick.wav')).toBe('/SAMPLES/Drums/Kick.wav')
    expect(cardPath('/SAMPLES/Drums/Kick.wav')).toBe('/SAMPLES/Drums/Kick.wav')
    expect(cardPath('//SAMPLES')).toBe('/SAMPLES')
    expect(cardPath('SAMPLES\\Drums\\Kick.wav')).toBe('/SAMPLES/Drums/Kick.wav')
    expect(xmlPath('/SAMPLES/Drums/Kick.wav')).toBe('SAMPLES/Drums/Kick.wav')
    expect(xmlPath('SAMPLES/Drums/Kick.wav')).toBe('SAMPLES/Drums/Kick.wav')
    expect(xmlPath(cardPath('SAMPLES/Drums/Kick.wav'))).toBe('SAMPLES/Drums/Kick.wav')
  })
})

describe('text on the card', () => {
  it('round-trips UTF-8 as UTF-8', () => {
    const { text, encoding } = decodeXml(new TextEncoder().encode('<sound name="Pïano — ✓" />'))
    expect(encoding).toBe('utf-8')
    expect(text).toBe('<sound name="Pïano — ✓" />')
    expect([...encodeXml(text, encoding)]).toEqual([...new TextEncoder().encode(text)])
  })

  it('carries bytes that are not UTF-8 as latin1, so every byte comes back where it was', () => {
    // A name the card holds in some other code page: 0xE9 alone is not UTF-8.
    const bytes = Uint8Array.from([0x3c, 0x61, 0x20, 0x6e, 0x3d, 0x22, 0xe9, 0x22, 0x2f, 0x3e])
    const { text, encoding } = decodeXml(bytes)
    expect(encoding).toBe('latin1')
    expect(text).toBe('<a n="é"/>')
    expect([...encodeXml(text, encoding)]).toEqual([...bytes])
  })
})

describe('errors', () => {
  it('maps the three FatFS codes callers act on, and everything else to io', () => {
    expect(cardErrorCode(4)).toBe('notFound') // FR_NO_FILE
    expect(cardErrorCode(5)).toBe('notFound') // FR_NO_PATH
    expect(cardErrorCode(8)).toBe('exists') // FR_EXIST
    for (const other of [1, 2, 3, 6, 7, 9, 15, 16]) expect(cardErrorCode(other)).toBe('io')
  })

  it('recognises absence from either backend, and nothing else as absence', () => {
    expect(isNotFound(new CardError('notFound', 'gone'))).toBe(true)
    expect(isNotFound(new CardError('io', 'timed out'))).toBe(false)
    expect(isNotFound(new SysexError('open', '/SYNTHS/X.XML', 4))).toBe(true)
    expect(isNotFound(new SysexError('dir', '/NOPE', 5))).toBe(true)
    expect(isNotFound(new SysexError('dir', '/SYNTHS', 1))).toBe(false)
    expect(isNotFound(new Error('nope'))).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
  })

  it('a CardError keeps its cause', () => {
    const cause = new SysexError('dir', '/SYNTHS', 1)
    const e = new CardError('io', 'listing failed', { cause })
    expect(e.name).toBe('CardError')
    expect(e.cause).toBe(cause)
  })
})

describe('nameProblem', () => {
  it.each([
    ['Kick.wav', null],
    ['Kick 808.wav', null],
    ['kick-808_v2 (final).wav', null],
    ['Pïano.wav', null],
    ['', 'a name is needed'],
    ['   ', 'a name is needed'],
    [' Kick.wav', 'a name cannot start or end with a space'],
    ['Kick.wav ', 'a name cannot start or end with a space'],
    ['Drums/Kick.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['Drums\\Kick.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['Kick:1.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['Kick*.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['Kick?.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['"Kick".wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['<Kick>.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['Kick|Snare.wav', 'a name cannot contain \\ / : * ? " < > |'],
    ['.', 'not a name'],
    ['..', 'not a name'],
    ['.hidden.wav', null], // a leading dot is a legal FAT long name
  ])('%j → %j', (name, problem) => {
    expect(nameProblem(name)).toBe(problem)
  })
})
