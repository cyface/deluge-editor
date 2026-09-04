/**
 * What a caught error says on screen. Errors from the card protocol carry a
 * FatFS name for the log (`SysexError.message` reads `open /X: no such file
 * (FR_NO_FILE)`); a person reading the panel wants the sentence without the
 * code. Every store's catch goes through here, so the shape is one shape:
 * sentence case, no trailing period, the path named when there is one.
 */

import { CardError } from '../core/library'
import { SysexError } from '../core/sysex'

/** The protocol op as the verb a user did. */
const VERBS: Record<string, string> = {
  open: 'open',
  read: 'read',
  write: 'write',
  close: 'close',
  dir: 'list',
  rename: 'rename',
  delete: 'delete',
  mkdir: 'create',
}

const sentence = (s: string): string => {
  const t = s.trim().replace(/\.$/, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function errorText(e: unknown): string {
  // The library's `CardFS` over SysEx wraps the protocol error and copies its
  // message, FatFS name and all; the original underneath has the sentence.
  // A mounted card's `CardError` has no cause and a message of its own.
  if (e instanceof CardError) return e.cause instanceof SysexError ? errorText(e.cause) : sentence(e.message)
  if (e instanceof SysexError) {
    // `ping` has no path and its only failure is silence.
    if (!e.path) return sentence(e.reason)
    return `Could not ${VERBS[e.op] ?? e.op} ${e.path}: ${e.reason}`
  }
  if (e instanceof Error && e.message) return sentence(e.message)
  return 'Something went wrong'
}
