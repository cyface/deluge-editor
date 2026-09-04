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
 * `beta` e7bae539):
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

import { child, type XmlElement } from '../xml/element'
import { parseTree } from '../xml/parse'

/** The three follow channel slots, as the instrument's menu names them. */
export type FollowSlotName = 'a' | 'b' | 'c'

/** What one of MIDI-Follow's three channel slots is set to. */
export interface FollowChannelSetting {
  slot: FollowSlotName
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

/**
 * `<feedback><channel>` values — `feedbackChannelTypeMap`
 * (`io/midi/midi_follow.cpp:97-105`, `beta` e7bae539), verbatim.
 */
export const FEEDBACK_CHANNEL_TYPES = ['none', 'a', 'b', 'c', 'track', 'track_a', 'track_b', 'track_c'] as const
export type FeedbackChannelType = (typeof FEEDBACK_CHANNEL_TYPES)[number]

const isFeedbackChannelType = (s: string): s is FeedbackChannelType =>
  (FEEDBACK_CHANNEL_TYPES as readonly string[]).includes(s)

export interface FollowSettings {
  channels: FollowChannelSetting[]
  /** Which slot feedback goes out through, if any; `track*` follows the clip's own output channel as well. */
  feedback: FeedbackChannelType
  /** `midiFollowFeedbackFilter`: drops an incoming CC within a second of sending that CC. */
  feedbackFilter: boolean
}

const MPE_LOWER_STORED = 17
const MPE_UPPER_STORED = 18
const UNASSIGNED_STORED = 256

function readChannel(el: XmlElement | undefined, slot: FollowSlotName): FollowChannelSetting {
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
  const feedback = (feedbackEl?.attrs.channel as string | undefined)?.toLowerCase() ?? 'none'
  return {
    channels: (['a', 'b', 'c'] as const).map((s) => readChannel(channels ? child(channels, s) : undefined, s)),
    // A value outside the table reads as off, which is what a slot that can never match amounts to.
    feedback: isFeedbackChannelType(feedback) ? feedback : 'none',
    // `getNameFromBool` writes On/Off; anything else reads as off.
    feedbackFilter: (feedbackEl?.attrs.filter as string | undefined)?.toLowerCase() === 'on',
  }
}

/** The slot the instrument sends feedback through, or undefined when feedback is off. */
export function feedbackSlot(s: FollowSettings): FollowChannelSetting | undefined {
  const name = s.feedback.replace(/^track_?/, '')
  return s.channels.find((c) => c.slot === name)
}
