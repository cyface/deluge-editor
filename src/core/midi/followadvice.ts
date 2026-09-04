/**
 * What a Deluge's MIDI-Follow configuration means for this editor: whether a
 * CC sent from here will be accepted, on which port and channel, and the
 * lines of advice the follow sheet shows.
 *
 * Listening and sending are answered separately because they fail separately.
 * `sendCCForMidiFollowFeedback` takes a zone's master channel from
 * `getMasterChannel()` and sends to every cable, so mirroring works almost
 * regardless. Sending has to satisfy `LearnedMIDI::checkMatch` on the one
 * cable it goes out on, and the three cables are not configured alike
 * (`mpezones.ts`).
 */

import { feedbackSlot, type FollowChannelSetting, type FollowSettings, type FollowSlotName } from './followfile'
import { cableZones, channelToZone, isMasterChannel, type MpeZones } from './mpezones'

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
  slot: FollowSlotName
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
 * One line of advice. `warn` is a configuration that stops something working
 * and names the menu item to change; `info` states what the configuration
 * means. The level travels with the text so the sheet colours a line by what
 * it is, not by what it happens to say.
 */
export interface Advice {
  level: 'info' | 'warn'
  text: string
}

/**
 * Menu paths are written as the OLED shows them at community 1.3.0
 * (`STRING_FOR_FOLLOW_TITLE` "Midi-Follow", `STRING_FOR_FOLLOW_FEEDBACK`
 * "Feedback", `STRING_FOR_FOLLOW_FEEDBACK_FILTER` "Filter Responses",
 * `l10n/english.json` at the `beta` tag). A 7-segment Deluge abbreviates the
 * title to FOLO.
 */
export function followAdvice(s: FollowSettings, byCable?: Record<string, MpeZones>): Advice[] {
  const out: Advice[] = []
  const info = (text: string) => out.push({ level: 'info', text })
  const warn = (text: string) => out.push({ level: 'warn', text })
  const fb = feedbackSlot(s)

  if (s.feedback === 'none' || fb === undefined) {
    warn('Listening: Midi-Follow feedback is off, so nothing will arrive here. Set Settings › MIDI › Midi-Follow › Feedback › Channel to Channel A, B or C.')
  } else if (fb.kind === 'unassigned') {
    warn(`Listening: feedback is routed through Channel ${fb.slot.toUpperCase()}, which is unassigned, so nothing will be sent. Give it a channel under Midi-Follow › Channel.`)
  } else {
    info(`Listening: feedback comes from Channel ${fb.slot.toUpperCase()}, which is ${fb.label}, so it arrives on MIDI channel ${fb.channel}.`)
  }

  const target = chooseSendTarget(s, byCable)
  const assigned = s.channels.filter((c) => c.kind !== 'unassigned')

  if (target !== null) {
    info(
      `Sending: Channel ${target.slot.toUpperCase()} is ${target.label}, so a CC has to go out on Deluge Port ${target.port}, MIDI channel ${target.channel}. The editor is using that.`,
    )
    if (target.label.startsWith('MPE')) {
      warn(
        `Port ${target.port} is the one that matters here. Only that USB cable has MPE zones set up, so it is the only one where MIDI channel ${target.channel} counts as the zone this follow channel is set to. Sending the same CC on another port would be ignored.`,
      )
    }
  } else if (assigned.length === 0) {
    warn('Sending: none of Channel A, B or C is assigned, so the Deluge will accept nothing sent from here.')
  } else {
    warn(
      `Sending: nothing will be accepted on any port. ${assigned.map((c) => `Channel ${c.slot.toUpperCase()} is ${c.label}`).join('; ')}. Assign a follow channel that one of the three USB cables can match, under Settings › MIDI › Midi-Follow › Channel.`,
    )
  }

  const bound = s.channels.filter((c) => c.kind !== 'unassigned' && c.device !== null)
  if (bound.length) {
    info(`Channel ${bound.map((c) => c.slot.toUpperCase()).join(', ')} is bound to one MIDI device, so only that device is followed.`)
  }

  if (s.feedbackFilter) {
    warn('Filter Responses is on under Feedback, so the Deluge ignores any CC it sent itself within the last second: a knob dragged here moves the sound once and then goes quiet for a second. Turn it off for two-way editing.')
  }

  return out
}
