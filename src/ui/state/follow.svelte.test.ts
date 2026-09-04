/**
 * Follow Mode's rules about *what a received CC does* (issue #9): the map
 * follows the selected firmware, a kit routes by the target switch, an
 * unmapped CC is reported but changes nothing, and nothing is applied while
 * the mode is off.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import synthXml from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML?raw'
import kitXml from '../../../tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML?raw'
import { FOLLOW_SOUND_CC_C13, paramValueToCc } from '../../core/midi/follow'
import { hexToInt } from '../../core/params/hex'
import { SOUND_FOLLOW_SLOTS, KIT_FOLLOW_SLOTS, slotHex, slotScale } from '../../core/preset/follow'
import { setEnvelopeMenu, setParamHex } from '../../core/preset/sound'
import type { HexParam } from '../../core/params/hex'
import { isKit } from '../../core/preset'
import { editor, FALLBACK_FIRMWARE } from './editor.svelte'
import { follow } from './follow.svelte'

/** One CC on channel 1, as a port would deliver it. */
const cc = (n: number, value: number, channel = 1): MIDIMessageEvent =>
  ({ data: new Uint8Array([0xb0 + channel - 1, n, value]) }) as MIDIMessageEvent

/** A MIDI port as the store sees one: a name, `open()`, `send()`, and the listener surface. */
class FakePort extends EventTarget {
  constructor(
    readonly name: string,
    private readonly sent: Uint8Array[] = [],
  ) {
    super()
  }
  open() {
    return Promise.resolve(this)
  }
  send(b: Uint8Array) {
    this.sent.push(b)
  }
}

/** Hand the store a MIDIAccess with these ports; it picks among them as it would the browser's. */
const attachWith = (ins: string[], outs: string[], sent: Uint8Array[] = []) =>
  follow.attachTo({
    inputs: new Map(ins.map((n, i) => [String(i), new FakePort(n)])),
    outputs: new Map(outs.map((n, i) => [String(i), new FakePort(n, sent)])),
  } as unknown as MIDIAccess)

/**
 * The store picks its output port in `attach()`, which needs a MIDIAccess;
 * these tests drive `push()` directly, so they hand it one Deluge port and
 * collect what it sends.
 */
function fakeOutput(): Uint8Array[] {
  const sent: Uint8Array[] = []
  attachWith(['Deluge Port 3'], ['Deluge Port 3'], sent)
  return sent
}

/** The CC value every mapped parameter currently holds, as `FollowView` computes it. */
function snapshot(): Map<number, number> {
  const m = new Map<number, number>()
  const root = follow.onBus ? editor.preset! : editor.sound!
  for (const e of follow.slots) {
    const hex = slotHex(root, e.slot)
    if (hex === undefined) continue
    m.set(e.cc, paramValueToCc(hexToInt(hex), slotScale(e.slot) === 'half'))
  }
  return m
}

beforeEach(() => {
  follow.stop()
  follow.sending = false
  follow.sendChannel = 1
  follow.heardChannel = null
  follow.channel = 0
  follow.target = 'row'
  editor.deviceFirmware = null
  editor.firmware = FALLBACK_FIRMWARE
  editor.preset = null
  editor.source = null
})

describe('availability', () => {
  it('is offered only where the firmware has MIDI Follow', () => {
    editor.load(synthXml, 'Default Synth.XML')
    editor.firmware = '4.1.4'
    expect(follow.available).toBe(false)
    editor.firmware = 'c1.0.1'
    expect(follow.available).toBe(false)
    editor.firmware = 'c1.3.0'
    expect(follow.available).toBe(true)
  })

  /*
   * With nothing loaded there is no firmware to ask about: the target defaults
   * to the last official build, which has no MIDI Follow at all, and gating on
   * that would hide the mode from exactly the person it suits — someone whose
   * sound is already on the instrument and who has opened nothing here.
   * Entering the mode opens the init synth, which is a c1.3.0 file.
   */
  it('is offered with nothing loaded, whatever the fallback firmware is', () => {
    expect(editor.preset).toBe(null)
    expect(editor.firmware).toBe(FALLBACK_FIRMWARE)
    expect(follow.available).toBe(true)
  })

  it('shows the parameters the selected firmware maps, and no others', () => {
    editor.load(synthXml, 'Default Synth.XML') // c1.3.0
    const names = () => follow.slots.map((s) => s.name)
    expect(names()).toContain('env3Attack')
    editor.firmware = 'c1.2.1'
    expect(names()).not.toContain('env3Attack')
    expect(names()).toContain('lpfFrequency')
  })
})

/*
 * Which ports the mode uses. Listening is broadcast-safe, so it falls back to
 * every input; sending is not, so it does not fall back at all.
 */
describe('choosing ports', () => {
  it('sends only to a port that names itself a Deluge', () => {
    attachWith(['Deluge Port 3'], ['Scarlett 2i2', 'Deluge Port 3'])
    expect(follow.sendPort).toBe('Deluge Port 3')
  })

  /*
   * The one that mattered: with no Deluge output the old code took whatever
   * port happened to be first. A CC is not a no-op on the wrong instrument —
   * it can trip a learned command or be recorded into whatever is armed — so
   * there is no fallback here, and Send goes unavailable instead.
   */
  it('refuses to send anywhere when no output is a Deluge', () => {
    follow.sending = true
    attachWith(['Deluge Port 3'], ['Scarlett 2i2', 'IAC Driver Bus 1'])
    expect(follow.sendPort).toBe(null)
    expect(follow.sending).toBe(false)
  })

  it('still listens to every input when none names a Deluge', () => {
    attachWith(['MIDISPORT 1x1'], [])
    expect(follow.ports).toEqual(['MIDISPORT 1x1'])
  })
})

/*
 * Where a send is aimed. A MIDI-Follow channel is not always a number: set to
 * an MPE zone, `LearnedMIDI::checkMatch` accepts any channel the port maps
 * into that zone, and the instrument's own feedback goes out on the zone's
 * master channel — MIDI 1 for the lower zone, 16 for the upper
 * (`getMasterChannel`, `sendCCForMidiFollowFeedback`). Nobody should have to
 * work that out, so the default aims where the instrument was heard.
 */
describe('aiming a send', () => {
  beforeEach(() => {
    editor.load(synthXml, 'Default Synth.XML')
    follow.on = true
    follow.sending = true
    follow.sendChannel = 'auto'
  })

  /** Move a value here, the way a knob drag would. */
  const moveLpf = (hex: HexParam) => setParamHex(editor.sound!, 'lpfFrequency', hex)

  it('sends nothing at all until the instrument has been heard', () => {
    const sent = fakeOutput()
    expect(follow.outChannel).toBe(null)
    follow.push(snapshot(), 'a')
    moveLpf('0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect(sent).toEqual([])
  })

  it('aims at the channel the feedback arrived on, MPE zone or not', () => {
    const sent = fakeOutput()
    // An upper-zone follow channel reports on MIDI 16; a lower-zone one on 1.
    follow.receive(cc(81, 40, 16))
    expect(follow.outChannel).toBe(16)
    follow.push(snapshot(), 'a')
    moveLpf('0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect(sent.map((b) => b[0])).toEqual([0xbf])
  })

  it('lets a number override the heard channel', () => {
    const sent = fakeOutput()
    follow.receive(cc(81, 40, 16))
    follow.sendChannel = 3
    expect(follow.outChannel).toBe(3)
    follow.push(snapshot(), 'a')
    moveLpf('0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect(sent.map((b) => b[0])).toEqual([0xb2])
  })
})

describe('mirroring a synth', () => {
  beforeEach(() => {
    editor.load(synthXml, 'Default Synth.XML')
    follow.on = true
  })

  it('applies a mapped CC to the parameter it addresses', () => {
    follow.receive(cc(74, 127)) // LPF frequency
    expect(slotHex(editor.preset!, SOUND_FOLLOW_SLOTS.lpfFrequency)).toBe('0x7FFFFFFF')
    expect(follow.applied).toBe(1)
    expect(follow.last).toMatchObject({ channel: 1, cc: 74, value: 127, param: 'lpfFrequency' })
  })

  it('reports an unmapped CC without touching the preset', () => {
    const before = editor.output
    follow.receive(cc(1, 100)) // mod wheel: not in the follow map
    expect(follow.last).toMatchObject({ cc: 1, param: null })
    expect(follow.applied).toBe(0)
    expect(editor.output).toBe(before)
  })

  it('ignores other channels once one is chosen', () => {
    follow.channel = 5
    const before = editor.output
    follow.receive(cc(74, 0, 1))
    expect(editor.output).toBe(before)
    expect(follow.last).toBeNull()
    follow.receive(cc(74, 0, 5))
    expect(editor.output).not.toBe(before)
  })

  it('does nothing at all while the mode is off', () => {
    follow.stop()
    const before = editor.output
    follow.receive(cc(74, 0))
    expect(editor.output).toBe(before)
    expect(follow.last).toBeNull()
  })

  it('marks the parameter as just moved', () => {
    follow.receive(cc(81, 40)) // HPF frequency
    expect(follow.glow.hpfFrequency).toBeTypeOf('number')
  })
})

describe('mirroring a kit', () => {
  beforeEach(() => {
    editor.load(kitXml, 'Kit.XML')
    follow.on = true
  })

  it('sends CCs to the selected row by default', () => {
    follow.receive(cc(74, 0))
    expect(slotHex(editor.sound!, SOUND_FOLLOW_SLOTS.lpfFrequency)).toBe('0x80000000')
  })

  it('sends CCs to the kit bus when AFFECT ENTIRE is mirrored', () => {
    follow.target = 'bus'
    const kit = editor.preset!
    expect(isKit(kit)).toBe(true)
    follow.receive(cc(74, 0))
    expect(slotHex(kit, KIT_FOLLOW_SLOTS.lpfFrequency)).toBe('0x80000000')
  })

  // MidiFollow::getModelStackWithParamForKitClip refuses portamento for kits.
  it('drops portamento, which a kit clip cannot control', () => {
    expect(follow.slots.map((s) => s.name)).not.toContain('portamento')
    const before = editor.output
    follow.receive(cc(5, 100))
    expect(editor.output).toBe(before)
    expect(follow.last).toMatchObject({ cc: 5, param: null })
  })

  it('offers the bus parameters only when following the bus', () => {
    follow.target = 'bus'
    expect(follow.slots.map((s) => s.name)).toContain('sidechainCompressorVolume')
    follow.target = 'row'
    expect(follow.slots.map((s) => s.name)).not.toContain('sidechainCompressorVolume')
  })
})

describe('sending moves back to the instrument', () => {
  beforeEach(() => {
    editor.load(synthXml, 'Default Synth.XML')
    follow.on = true
  })

  it('sends nothing until asked to', () => {
    const sent = fakeOutput()
    follow.push(snapshot(), 'a')
    setParamHex(editor.sound!, 'lpfFrequency', '0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect(sent).toEqual([])
    expect(follow.sent).toBe(0)
  })

  it('sends the CC for a value that moved, and only that one', () => {
    const sent = fakeOutput()
    follow.sending = true
    follow.push(snapshot(), 'a') // first offer is the baseline, never a send
    expect(sent).toEqual([])
    setParamHex(editor.sound!, 'lpfFrequency', '0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect(sent.map((b) => [...b])).toEqual([[0xb0, 74, 127]])
    expect(follow.sent).toBe(1)
  })

  it('sends on the chosen channel', () => {
    const sent = fakeOutput()
    follow.sending = true
    follow.sendChannel = 9
    follow.push(snapshot(), 'a')
    setParamHex(editor.sound!, 'pan', '0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect([...sent[0]]).toEqual([0xb8, 10, 127])
  })

  // Switching row, bus or file replaces every value at once; playing that at
  // the instrument would rewrite its live sound from a file it never asked for.
  it('adopts a new target silently instead of sending all of it', () => {
    const sent = fakeOutput()
    follow.sending = true
    follow.push(snapshot(), 'a')
    editor.load(kitXml, 'Kit.XML')
    follow.push(snapshot(), 'b')
    expect(sent).toEqual([])
  })

  // The instrument echoes an accepted value straight back as feedback.
  it('does not bounce its own echo back into the preset', () => {
    const sent = fakeOutput()
    follow.sending = true
    follow.push(snapshot(), 'a')
    setParamHex(editor.sound!, 'lpfFrequency', '0x7FFFFFFF')
    follow.push(snapshot(), 'a')
    expect(follow.sent).toBe(1)
    follow.receive(cc(74, 127)) // the echo
    expect(follow.applied).toBe(0)
    expect(follow.glow.lpfFrequency).toBeUndefined()
    // A different value on the same CC is a real move and still lands.
    follow.receive(cc(74, 0))
    expect(follow.applied).toBe(1)
  })

  // Mirroring must not re-send what it just received, or two editors and a
  // Deluge would ring.
  it('does not send a value it mirrored', () => {
    const sent = fakeOutput()
    follow.sending = true
    follow.push(snapshot(), 'a')
    follow.receive(cc(74, 100))
    follow.push(snapshot(), 'a')
    expect(sent).toEqual([])
  })

  it('covers every mapped parameter, not just the ones with knobs of their own', () => {
    const sent = fakeOutput()
    follow.sending = true
    follow.push(snapshot(), 'a')
    // An envelope stage lives inside <envelope1>; the snapshot reaches it.
    setEnvelopeMenu(editor.sound!, 1, 'attack', 50) // menu 50 is INT32_MAX, 0x7FFFFFFF
    follow.push(snapshot(), 'a')
    const attackCc = Number(Object.keys(FOLLOW_SOUND_CC_C13).find((k) => FOLLOW_SOUND_CC_C13[Number(k)] === 'env1Attack'))
    expect(sent.map((b) => [...b])).toEqual([[0xb0, attackCc, 127]])
  })
})
