/**
 * The Playwright init script that plays a Deluge in the page: `FakeDeluge`
 * (the one transcription of smsysex.cpp, unit-tested against the client) behind
 * a Web MIDI shim, plus the identity inquiry the app sends first. Bundled by
 * `pnpm test:e2e` (the `pretest:e2e` script) into `tests/e2e/fake-deluge.js`,
 * which is generated and gitignored — edit this file, never that one.
 *
 * Card contents are seeded from `window.__cardSeed` (set by the spec, with
 * Deluge-authored fixture text — never hand-written XML) and exposed on
 * `window.__fakeCard` for assertions.
 */

import { FakeDeluge, type FakeOptions } from '../../src/core/sysex/fake-deluge'
import { IDENTITY_REQUEST } from '../../src/core/sysex/frame'

/** Firmware version bytes 1.3.0 at offsets 12–14, as `midiSysexReceived` answers a device inquiry. */
const IDENTITY_REPLY = Uint8Array.from([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x21, 0x7b, 0x01, 0, 0, 0, 1, 3, 0, 0, 0xf7])

interface FakeInput {
  name: string
  onmidimessage: ((e: { data: Uint8Array }) => void) | null
}

let input: FakeInput | null = null
/** Deliver on a later tick, as a MIDI stack would — never re-entrantly from `send`. */
const reply = (bytes: Uint8Array): void => {
  const target = input
  if (target?.onmidimessage) setTimeout(() => target.onmidimessage?.({ data: bytes }), 0)
}

const page = globalThis as unknown as {
  navigator: { requestMIDIAccess: () => Promise<unknown> }
  __cardSeed?: Record<string, string>
  __fakeOpts?: FakeOptions
  __fakeCard: unknown
}

// `sessionPipe: 2`: the grant of a firmware with the #43 send-ring fix, so the
// save path users on fixed firmware get — two requests in flight — is the one
// the specs exercise. `liveEdit: 'on'`: the fork's grant, with the Live Edit
// ops answering. A spec that wants another Deluge sets `window.__fakeOpts`
// before this script runs.
const deluge = new FakeDeluge(reply, { sessionPipe: 2, liveEdit: 'on', ...page.__fakeOpts })

const isIdentityRequest = (frame: Uint8Array): boolean =>
  frame.length === IDENTITY_REQUEST.length && frame.every((b, i) => b === IDENTITY_REQUEST[i])

const handle = (frame: Uint8Array): void => {
  if (isIdentityRequest(frame)) reply(IDENTITY_REPLY)
  else deluge.receive(frame)
}

page.navigator.requestMIDIAccess = async () => {
  const output = { name: 'Deluge Port 3', send: (b: ArrayLike<number>) => handle(Uint8Array.from(b)) }
  input = { name: 'Deluge Port 3', onmidimessage: null }
  return { outputs: new Map([['out', output]]), inputs: new Map([['in', input]]) }
}

for (const [p, text] of Object.entries(page.__cardSeed ?? {})) deluge.putFile(p, text)

page.__fakeCard = {
  files: deluge.files,
  dirs: deluge.dirs,
  text: (p: string): string | null => (deluge.files.has(p) ? new TextDecoder().decode(deluge.files.get(p)) : null),
  paths: (): string[] => [...deluge.files.keys()].sort(),
  // Play a second editor on the same Deluge: a reply answered to another
  // session's msgId block (sid 2 → 17…23). The OS MIDI stacks multiplex, so
  // every open tab hears it — that is the whole detection (issue #8).
  otherEditor: (): void => deluge.otherClientReply(17),
  /** The fake itself, for assertions on what the app sent (`requests`, `msgIds`, `maxFrameSeen`). */
  deluge,
}
