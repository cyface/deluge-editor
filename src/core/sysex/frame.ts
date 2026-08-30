/**
 * SysEx framing for the community firmware's smSysex protocol: JSON commands
 * and replies, with an optional 7-bit-packed binary block after a 0x00
 * separator.
 *
 *   request:  F0 00 21 7B 01 04 <msgId> <json…> [00 <packed…>] F7
 *   reply:    F0 00 21 7B 01 05 <msgId> <json…> [00 <packed…>] F7
 *
 * Source: `src/deluge/io/midi/sysex.h` (manufacturer ID and `SysexCommands`),
 * `midi_engine.cpp` `midiSysexReceived` (dispatch, payload offsets) and
 * `storage/smsysex.cpp` (`startReply` echoes the request's msgId with command
 * `JsonReply`; the one exception is the `^session` reply, sent by
 * `startDirect` with command `Json` and msgId 0). All upstream/main 3f898e95.
 */

import { pack8to7, unpack7to8 } from './pack'

export const SYSEX_START = 0xf0
export const SYSEX_END = 0xf7
/** Synthstrom Deluge, `DELUGE_SYSEX_ID_BYTE0..3` in io/midi/sysex.h. */
export const DELUGE_ID = [0x00, 0x21, 0x7b, 0x01] as const

/** `SysexCommands` in io/midi/sysex.h. */
export const CMD_JSON = 0x04
export const CMD_JSON_REPLY = 0x05

/**
 * The whole request must fit the firmware's per-cable receive buffer,
 * `incomingSysexBuffer[1024]` (io/midi/midi_device.h:160). An oversized
 * request is dropped without any reply.
 */
export const MAX_REQUEST_BYTES = 1024

export interface SysexReply {
  msgId: number
  json: Record<string, unknown>
  binary?: Uint8Array
}

/** A JSON command frame. Throws if the JSON is not 7-bit clean (SysEx data bytes must be ≤ 0x7F). */
export function buildJsonFrame(msgId: number, command: object, binary?: Uint8Array): Uint8Array {
  const text = JSON.stringify(command)
  const packed = binary === undefined ? null : pack8to7(binary)
  const out = new Uint8Array(7 + text.length + (packed ? packed.length + 1 : 0) + 1)
  out[0] = SYSEX_START
  out.set(DELUGE_ID, 1)
  out[5] = CMD_JSON
  out[6] = msgId
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) {
      throw new Error(`SysEx JSON must be printable ASCII, got U+${c.toString(16).toUpperCase()} in ${text}`)
    }
    out[7 + i] = c
  }
  let o = 7 + text.length
  if (packed) {
    out[o++] = 0 // separator between JSON and packed data
    out.set(packed, o)
    o += packed.length
  }
  out[o] = SYSEX_END
  return out
}

/**
 * Parse an incoming SysEx as an smSysex reply. Returns null for anything
 * else (other manufacturers, non-JSON commands, malformed frames). A frame
 * with command `Json` is only a reply when its msgId is 0 (the `^session`
 * handshake from `startDirect`); everything real arrives as `JsonReply`.
 */
export function parseReply(data: Uint8Array): SysexReply | null {
  if (data.length < 9 || data[0] !== SYSEX_START) return null
  if (data[1] !== DELUGE_ID[0] || data[2] !== DELUGE_ID[1] || data[3] !== DELUGE_ID[2] || data[4] !== DELUGE_ID[3])
    return null
  const command = data[5]
  const msgId = data[6]
  if (command !== CMD_JSON_REPLY && !(command === CMD_JSON && msgId === 0)) return null
  const end = data.lastIndexOf(SYSEX_END)
  if (end < 7) return null
  let sep = -1
  for (let i = 7; i < end; i++) {
    if (data[i] === 0) {
      sep = i
      break
    }
  }
  let text = ''
  for (let i = 7; i < (sep === -1 ? end : sep); i++) text += String.fromCharCode(data[i])
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (json === null || typeof json !== 'object') return null
  const reply: SysexReply = { msgId, json }
  if (sep !== -1) reply.binary = unpack7to8(data.subarray(sep + 1, end))
  return reply
}

/**
 * Universal device inquiry. The firmware answers with its manufacturer ID
 * and firmware version bytes (`midiSysexReceived` in midi_engine.cpp:
 * `FIRMWARE_VERSION_MAJOR, MINOR, PATCH` at offsets 12–14 of the reply).
 */
export const IDENTITY_REQUEST = new Uint8Array([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])

export interface Identity {
  major: number
  minor: number
  patch: number
}

export function parseIdentityReply(data: Uint8Array): Identity | null {
  if (data.length < 16 || data[0] !== SYSEX_START || data[1] !== 0x7e) return null
  if (data[3] !== 0x06 || data[4] !== 0x02) return null
  if (data[5] !== DELUGE_ID[0] || data[6] !== DELUGE_ID[1] || data[7] !== DELUGE_ID[2]) return null
  return { major: data[12], minor: data[13], patch: data[14] }
}
