import { describe, expect, it } from 'vitest'
import {
  buildJsonFrame,
  CMD_JSON,
  CMD_JSON_REPLY,
  IDENTITY_REQUEST,
  parseIdentityReply,
  parseReply,
  SYSEX_END,
  SYSEX_START,
} from './frame'

const enc = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0))

describe('buildJsonFrame', () => {
  it('frames a JSON command: F0 00 21 7B 01 04 msgId json F7', () => {
    const f = buildJsonFrame(9, { ping: {} })
    expect(Array.from(f)).toEqual([0xf0, 0x00, 0x21, 0x7b, 0x01, CMD_JSON, 9, ...enc('{"ping":{}}'), 0xf7])
  })

  it('appends packed binary after a 0x00 separator', () => {
    const f = buildJsonFrame(10, { write: { fid: 1, addr: 0, size: 2 } }, new Uint8Array([0x80, 0x01]))
    const json = JSON.stringify({ write: { fid: 1, addr: 0, size: 2 } })
    expect(Array.from(f)).toEqual([
      0xf0, 0x00, 0x21, 0x7b, 0x01, CMD_JSON, 10, ...enc(json), 0x00, 0x01, 0x00, 0x01, 0xf7,
    ])
  })

  it('refuses JSON that is not 7-bit clean — SysEx data bytes must be ≤ 0x7F', () => {
    expect(() => buildJsonFrame(9, { open: { path: '/SYNTHS/tschüß.XML', write: 0 } })).toThrow(/ASCII/)
  })

  it('every frame byte between F0 and F7 is a valid data byte', () => {
    const f = buildJsonFrame(9, { read: { fid: 3, addr: 512, size: 1024 } }, new Uint8Array([0xff, 0x00, 0x80]))
    for (const b of f.subarray(1, f.length - 1)) expect(b).toBeLessThan(0x80)
  })
})

describe('parseReply', () => {
  const reply = (cmd: number, msgId: number, body: string, packed: number[] = []): Uint8Array =>
    new Uint8Array([
      SYSEX_START, 0x00, 0x21, 0x7b, 0x01, cmd, msgId,
      ...enc(body),
      ...(packed.length ? [0, ...packed] : []),
      SYSEX_END,
    ])

  it('parses a JsonReply with the firmware serializer newlines', () => {
    const r = parseReply(reply(CMD_JSON_REPLY, 11, '\n{"^open": {\n"fid": 3,\n"size": 100,\n"err": 0}}'))
    expect(r?.msgId).toBe(11)
    expect(r?.json).toEqual({ '^open': { fid: 3, size: 100, err: 0 } })
    expect(r?.binary).toBeUndefined()
  })

  it('unpacks the binary block after the 0x00 separator', () => {
    const r = parseReply(reply(CMD_JSON_REPLY, 11, '{"^read": {"fid": 3, "addr": 0, "size": 2, "err": 0}}', [0x01, 0x00, 0x01]))
    expect(Array.from(r!.binary!)).toEqual([0x80, 0x01])
  })

  it('accepts the ^session reply, which alone arrives as command Json with msgId 0', () => {
    const r = parseReply(reply(CMD_JSON, 0, '{"^session": {"sid": 1, "midMin": 9, "midMax": 15}}'))
    expect(r?.json['^session']).toBeTruthy()
  })

  it('rejects command Json with a non-zero msgId — that is a request, not a reply', () => {
    expect(parseReply(reply(CMD_JSON, 9, '{"ping": {}}'))).toBeNull()
  })

  it('rejects other manufacturers, garbage JSON, and unterminated frames', () => {
    expect(parseReply(new Uint8Array([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]))).toBeNull()
    expect(parseReply(reply(CMD_JSON_REPLY, 9, 'not json'))).toBeNull()
    const cut = reply(CMD_JSON_REPLY, 9, '{"^ping": {}}').slice(0, -1)
    expect(parseReply(cut)).toBeNull()
  })
})

describe('identity (universal device inquiry)', () => {
  it('is the standard non-realtime inquiry', () => {
    expect(Array.from(IDENTITY_REQUEST)).toEqual([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])
  })

  it('reads the firmware version bytes from the reply midi_engine.cpp sends', () => {
    const r = parseIdentityReply(
      new Uint8Array([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x21, 0x7b, 0x01, 0, 0, 0, 1, 3, 0, 0, 0xf7]),
    )
    expect(r).toEqual({ major: 1, minor: 3, patch: 0 })
  })

  it('rejects other identity replies', () => {
    expect(
      parseIdentityReply(new Uint8Array([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x41, 0x00, 0x00, 0, 0, 0, 0, 1, 0, 0, 0, 0xf7])),
    ).toBeNull()
  })
})
