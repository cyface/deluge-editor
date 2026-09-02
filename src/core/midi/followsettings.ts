/**
 * The Deluge's own MIDI-Follow settings, read from the card.
 *
 * Follow Mode's hardest question is not answerable over MIDI: which channel is
 * MIDI-Follow actually on? The instrument's menu answers in its own terms —
 * A, B or C — and each of those can be a plain channel *or an MPE zone*, which
 * is not a number the user can read off the screen at all. Guessing it is how
 * a follow CC ends up somewhere it was never meant to go.
 *
 * It is written down, though. `SETTINGS/MIDIFollow.XML` holds the lot, and
 * this editor can already read a file off the card over SysEx, so the settings
 * can simply be looked up rather than guessed at.
 *
 * The file is `MidiFollow::writeDefaultsToFile`
 * (`src/deluge/io/midi/midi_follow.cpp`, SynthstromAudible/DelugeFirmware
 * upstream/community bef6d9df):
 *
 *   <defaults>
 *     <cc_mappings>…</cc_mappings>
 *     <settings>
 *       <channels><a><channel>17</channel></a><b>…</b><c>…</c>…</channels>
 *       <kit_root_note><note>36</note></kit_root_note>
 *       <feedback><channel>a</channel><automation>…</automation><filter>Off</filter></feedback>
 *       <display_param><popup>…</popup></display_param>
 *     </settings>
 *   </defaults>
 *
 * The one trap is that `<channel>` is stored as `channelOrZone + 1`
 * (`writeSpecificChannelSettingsToFile`), and `channelOrZone` is not a channel
 * number when it is a zone: `MIDI_CHANNEL_MPE_LOWER_ZONE` is 16 and
 * `MIDI_CHANNEL_MPE_UPPER_ZONE` is 17 (`definitions_cxx.hpp`), unassigned is
 * `MIDI_CHANNEL_NONE`, 255. So the file holds 17 for the lower zone, 18 for
 * the upper, 256 for unassigned, and 1 to 16 for a plain channel.
 */

import { parseTree } from '../xml/parse'
import { child } from '../xml/element'
import type { XmlElement } from '../xml/element'

/** What one of MIDI-Follow's three channel slots is set to. */
export interface FollowChannelSetting {
  /** `a`, `b` or `c`, as the instrument's menu names them. */
  slot: 'a' | 'b' | 'c'
  kind: 'unassigned' | 'channel' | 'mpeLower' | 'mpeUpper'
  /**
   * The MIDI channel, 1–16, that this slot speaks on: its own number for a
   * plain channel, and the zone's master channel for a zone, which is where
   * the instrument sends that zone's feedback
   * (`sendCCForMidiFollowFeedback`: `channel = getMasterChannel()`, 0 for the
   * lower zone and 15 for the upper). Null when the slot is unassigned.
   */
  channel: number | null
  /** As the instrument's own menu shows it (`FollowChannel::drawValue`). */
  label: string
  /** Bound to one MIDI device rather than any, which narrows the match further. */
  device: string | null
}

export interface FollowSettings {
  channels: FollowChannelSetting[]
  /** `none`, `a`, `b`, `c`, `track`, `track_a`… (`feedbackChannelTypeMap`). */
  feedback: string
  /** `midiFollowFeedbackFilter`: drops an incoming CC within a second of sending that CC. */
  feedbackFilter: boolean
}

const MPE_LOWER_STORED = 17
const MPE_UPPER_STORED = 18
const UNASSIGNED_STORED = 256

function readChannel(el: XmlElement | undefined, slot: 'a' | 'b' | 'c'): FollowChannelSetting {
  const raw = el?.attrs.channel
  const stored = raw === undefined ? UNASSIGNED_STORED : Number(raw)
  // `<device …/>` carries the reference as attributes, so the parser keeps it
  // as a child element rather than folding it into a value.
  const deviceEl = el === undefined ? undefined : child(el, 'device')
  const device = deviceEl === undefined ? null : (deviceEl.attrs.name ?? Object.values(deviceEl.attrs)[0] ?? 'a specific device')
  if (stored === MPE_LOWER_STORED) {
    return { slot, kind: 'mpeLower', channel: 1, label: 'MPE lower zone', device }
  }
  if (stored === MPE_UPPER_STORED) {
    return { slot, kind: 'mpeUpper', channel: 16, label: 'MPE upper zone', device }
  }
  if (Number.isFinite(stored) && stored >= 1 && stored <= 16) {
    return { slot, kind: 'channel', channel: stored, label: `Channel ${stored}`, device }
  }
  return { slot, kind: 'unassigned', channel: null, label: 'Unassigned', device }
}

/** Read `SETTINGS/MIDIFollow.XML`. Throws only if the file is not XML at all. */
export function parseFollowSettings(xml: string): FollowSettings {
  const [root] = parseTree(xml)
  const settings = child(root, 'settings')
  const channels = settings ? child(settings, 'channels') : undefined
  const feedbackEl = settings ? child(settings, 'feedback') : undefined
  return {
    channels: (['a', 'b', 'c'] as const).map((s) => readChannel(channels ? child(channels, s) : undefined, s)),
    feedback: (feedbackEl?.attrs.channel as string | undefined)?.toLowerCase() ?? 'none',
    // `getNameFromBool` writes On/Off; anything else reads as off.
    feedbackFilter: (feedbackEl?.attrs.filter as string | undefined)?.toLowerCase() === 'on',
  }
}

/** The slot the instrument sends feedback through, or undefined when feedback is off. */
export function feedbackSlot(s: FollowSettings): FollowChannelSetting | undefined {
  const name = s.feedback.replace(/^track_?/, '')
  return s.channels.find((c) => c.slot === name)
}

/**
 * The MPE zones a Deluge has configured on its inputs, from
 * `SETTINGS/MIDIDevices.XML` (`MIDIDeviceManager::writeDevicesToFile`,
 * `MIDIPort::writeToFile`):
 *
 *   <midiDevices>
 *     <dinPorts><input><mpeLowerZone numMemberChannels="7"/></input></dinPorts>
 *     <upstreamUSBDevice …><input>…</input><output>…</output></upstreamUSBDevice>
 *   </midiDevices>
 *
 * The block is written only when a zone exists, so an absent `<input>` — or an
 * absent file, which the firmware deletes when there is nothing worth
 * writing — means no zones at all. That is the fact that decides whether a
 * follow channel set to a zone can ever match anything.
 *
 * The one oddity is that `numMemberChannels` is not the same quantity in the
 * two zones. For the lower it is `mpeLowerZoneLastMemberChannel` outright; for
 * the upper it is `15 - mpeUpperZoneLastMemberChannel`, a count.
 */
export interface MpeZones {
  /** Last member channel of the lower zone, 0-based. 0 means no lower zone. */
  lowerLast: number
  /** First member channel of the upper zone, 0-based. 15 means no upper zone. */
  upperFirst: number
}

export const hasLowerZone = (z: MpeZones): boolean => z.lowerLast !== 0
export const hasUpperZone = (z: MpeZones): boolean => z.upperFirst !== 15

/** Input zones per cable, keyed by the tag the firmware writes for that cable. */
export function parseMpeInputs(xml: string): Record<string, MpeZones> {
  const [root] = parseTree(xml)
  const out: Record<string, MpeZones> = {}
  for (const cable of root.children) {
    const input = child(cable, 'input')
    if (input === undefined) continue
    const lower = child(input, 'mpeLowerZone')
    const upper = child(input, 'mpeUpperZone')
    const lowerLast = Number(lower?.attrs.numMemberChannels ?? 0)
    const upperCount = Number(upper?.attrs.numMemberChannels ?? 0)
    out[cable.tag] = {
      lowerLast: Number.isFinite(lowerLast) ? lowerLast : 0,
      upperFirst: 15 - (Number.isFinite(upperCount) ? upperCount : 0),
    }
  }
  return out
}

/**
 * The zones on the cable this editor is talking over. A browser reaches the
 * Deluge as its upstream USB connection, so that is the port whose zones
 * decide whether a CC sent from here can match an MPE follow channel.
 */
export function usbInputZones(byCable: Record<string, MpeZones>): MpeZones {
  return byCable.upstreamUSBDevice ?? byCable.upstreamUSBDevice2 ?? { lowerLast: 0, upperFirst: 15 }
}

/**
 * The MPE zones each of the Deluge's three USB cables starts with.
 *
 * This is the fact that makes the whole thing confusing, and it is not in any
 * file: **cable 2 has MPE zones and the other two do not.** The cables are
 * constructed as `upstreamUSBMIDICable1{0, false, true}`,
 * `upstreamUSBMIDICable2{1, true, false}` and
 * `upstreamUSBMIDICable3{2, false, false}` (`midi_device_manager.cpp`), and
 * the middle argument is `mpe`, which in `MIDICableUSBUpstream`'s constructor
 * (`io/midi/cable_types/usb_device_cable.h`) sets every port's
 * `mpeLowerZoneLastMemberChannel` to 7 and `mpeUpperZoneLastMemberChannel` to
 * 8.
 *
 * So on Deluge Port 2, MIDI channel 1 is not channel 1: `channelToZone` maps
 * it into the lower zone, and a follow channel set to a plain 1 will never
 * match it. On Ports 1 and 3 the reverse holds — channel 1 is channel 1, and a
 * follow channel set to the MPE lower zone will never match. Which port the
 * editor sends on therefore decides which follow settings can work, and
 * picking the first Deluge output in the list is picking one at random.
 *
 * `SETTINGS/MIDIDevices.XML` overrides these when it exists, but it is only
 * written when there is something worth writing, so these defaults are what an
 * untouched Deluge is running.
 */
export const DEFAULT_CABLE_ZONES: Readonly<Record<number, MpeZones>> = {
  1: { lowerLast: 0, upperFirst: 15 },
  2: { lowerLast: 7, upperFirst: 8 },
  3: { lowerLast: 0, upperFirst: 15 },
}

/** The tag `MIDIDeviceManager::writeDevicesToFile` uses for each USB port. */
const CABLE_TAG: Readonly<Record<number, string>> = {
  1: 'upstreamUSBDevice',
  2: 'upstreamUSBDevice2',
}

/** The zones on one USB port: the file's if it says, otherwise the built-in default. */
export function cableZones(port: number, byCable?: Record<string, MpeZones>): MpeZones {
  const tag = CABLE_TAG[port]
  const fromFile = tag === undefined ? undefined : byCable?.[tag]
  return fromFile ?? DEFAULT_CABLE_ZONES[port] ?? { lowerLast: 0, upperFirst: 15 }
}

/** `MIDIPort::channelToZone`, on a 0-based channel. 16 is the lower zone, 17 the upper. */
export function channelToZone(channel0: number, z: MpeZones): number {
  if (z.lowerLast !== 0 && z.lowerLast >= channel0) return 16
  if (z.upperFirst < 15 && z.upperFirst <= channel0) return 17
  return channel0
}

/** `MIDIPort::isMasterChannel`. */
export function isMasterChannel(channel0: number, z: MpeZones): boolean {
  if (z.lowerLast !== 0 && channel0 === 0) return true
  return z.upperFirst < 15 && channel0 === 15
}

/**
 * Whether a CC on this port and channel reaches the parameters through this
 * slot.
 *
 * Both gates, in the firmware's order. `LearnedMIDI::checkMatch` needs the
 * slot's `channelOrZone` to equal `channelToZone(incoming)`, and then
 * `midiCCReceivedForSelectedOrActiveClip` only passes MPE_MASTER and CHANNEL
 * through to a parameter — MPE_MEMBER is dropped — so a zone match has to be
 * on the zone's master channel.
 */
export function accepts(c: FollowChannelSetting, port: number, channel: number, byCable?: Record<string, MpeZones>): boolean {
  if (c.kind === 'unassigned') return false
  const z = cableZones(port, byCable)
  const c0 = channel - 1
  const corz = channelToZone(c0, z)
  if (c.kind === 'channel') return corz === c0 && c.channel === channel
  const want = c.kind === 'mpeLower' ? 16 : 17
  return corz === want && isMasterChannel(c0, z)
}

/** Where a send has to go for this instrument to act on it. */
export interface SendTarget {
  /** Deluge USB port, 1-based, as the port names number them. */
  port: number
  channel: number
  slot: 'a' | 'b' | 'c'
  label: string
}

/**
 * The port and channel a send will actually be accepted on, or null when no
 * combination works.
 *
 * Every port and every assigned slot is tried, because the two choices are not
 * independent: a plain follow channel of 1 works on Port 1 and cannot work on
 * Port 2, and an MPE-lower follow channel is the exact opposite. The slot
 * feedback comes from is tried first, so the same slot carries both directions
 * when it can.
 */
export function chooseSendTarget(s: FollowSettings, byCable?: Record<string, MpeZones>): SendTarget | null {
  const fb = feedbackSlot(s)
  const slots = [...(fb ? [fb] : []), ...s.channels.filter((c) => c !== fb)]
  for (const c of slots) {
    if (c.kind === 'unassigned' || c.channel === null) continue
    for (const port of [1, 2, 3]) {
      if (accepts(c, port, c.channel, byCable)) {
        return { port, channel: c.channel, slot: c.slot, label: c.label }
      }
    }
  }
  return null
}

/**
 * Whether this slot can actually accept a CC sent from here.
 *
 * A plain channel always can. A zone can only when the *input* port has that
 * zone configured, because `LearnedMIDI::checkMatch` compares the slot's
 * `channelOrZone` against `MIDIPort::channelToZone(incoming)`, and that
 * returns a zone only for a port that has one. Unknown when the zones could
 * not be read.
 */
export function slotAccepts(c: FollowChannelSetting, mpe?: MpeZones): boolean | null {
  if (c.kind === 'unassigned') return false
  if (c.kind === 'channel') return true
  if (mpe === undefined) return null
  return c.kind === 'mpeLower' ? hasLowerZone(mpe) : hasUpperZone(mpe)
}

/**
 * The channel to send on: the first slot that will actually accept a CC.
 *
 * A plain channel is preferred over a zone even when both would work, because
 * `checkMatch` returns CHANNEL for it outright while a zone has to be the
 * master channel to count — `midiCCReceivedForSelectedOrActiveClip` only
 * passes MPE_MASTER and CHANNEL through to the parameters, and drops
 * MPE_MEMBER. Null when nothing can accept, which is a real answer and not a
 * missing one: sending is impossible until the instrument is changed.
 */
export function sendableChannel(s: FollowSettings, mpe?: MpeZones): number | null {
  const plain = s.channels.find((c) => c.kind === 'channel')
  if (plain?.channel != null) return plain.channel
  const zone = s.channels.find((c) => slotAccepts(c, mpe) === true)
  return zone?.channel ?? null
}

/**
 * What this configuration means for the editor.
 *
 * Listening and sending are answered separately because they fail separately.
 * `sendCCForMidiFollowFeedback` takes a zone's master channel from
 * `getMasterChannel()` and sends to every cable, so mirroring works almost
 * regardless. Sending has to satisfy `LearnedMIDI::checkMatch` on the one
 * cable it goes out on, and the three cables are not configured alike.
 */
export function followAdvice(s: FollowSettings, byCable?: Record<string, MpeZones>): string[] {
  const out: string[] = []
  const fb = feedbackSlot(s)

  if (s.feedback === 'none' || fb === undefined) {
    out.push('Mirroring: MIDI-Follow feedback is off, so nothing will arrive here. Set SETTINGS > MIDI > MIDI-Follow > Feedback > Channel to A, B or C.')
  } else if (fb.kind === 'unassigned') {
    out.push(`Mirroring: feedback is routed through channel ${fb.slot.toUpperCase()}, which is unassigned, so nothing will be sent.`)
  } else {
    out.push(`Mirroring: feedback comes from channel ${fb.slot.toUpperCase()}, which is ${fb.label}, so it arrives on MIDI channel ${fb.channel}.`)
  }

  const target = chooseSendTarget(s, byCable)
  const assigned = s.channels.filter((c) => c.kind !== 'unassigned')

  if (target !== null) {
    out.push(
      `Sending: channel ${target.slot.toUpperCase()} is ${target.label}, so a CC has to go out on Deluge Port ${target.port}, MIDI channel ${target.channel}. The editor is using that.`,
    )
    if (target.label.startsWith('MPE')) {
      out.push(
        `Port ${target.port} is the one that matters here. Only that USB cable has MPE zones set up, so it is the only one where MIDI channel ${target.channel} counts as the zone this follow channel is set to. Sending the same CC on another port would be ignored.`,
      )
    }
  } else if (assigned.length === 0) {
    out.push('Sending: none of A, B or C is assigned, so the Deluge will accept nothing sent from here.')
  } else {
    out.push(
      `Sending: nothing will be accepted on any port. ${assigned.map((c) => `Channel ${c.slot.toUpperCase()} is ${c.label}`).join('; ')}. Assign a follow channel that one of the three USB cables can match, under SETTINGS > MIDI > MIDI-Follow > Channel.`,
    )
  }

  const bound = s.channels.filter((c) => c.kind !== 'unassigned' && c.device !== null)
  if (bound.length) {
    out.push(`Channel ${bound.map((c) => c.slot.toUpperCase()).join(', ')} is bound to one MIDI device, so only that device is followed.`)
  }

  if (s.feedbackFilter) {
    out.push('The feedback filter is on, so the Deluge ignores an incoming CC within a second of having sent that same CC. A knob dragged here will move the instrument once and then go quiet until it settles.')
  }

  return out
}
