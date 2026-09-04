/**
 * Reading `SETTINGS/MIDIFollow.XML`, in the shape
 * `MidiFollow::writeDefaultsToFile` writes it. The values are the ones the
 * firmware stores, not tidy ones: `<channel>` is `channelOrZone + 1`, so a
 * plain channel 1 is 1, the MPE lower zone is 17, the upper is 18, and
 * unassigned is 256.
 */

import { describe, expect, it } from 'vitest'
import {
  type Advice,
  feedbackSlot,
  followAdvice,
  hasLowerZone,
  parseFollowSettings,
  accepts,
  chooseSendTarget,
  parseMpeInputs,
  usbInputZones,
} from './followsettings'

/** Every advice line as one string, for tests about what is said rather than where. */
const text = (lines: Advice[]) => lines.map((l) => l.text).join(' ')

const file = (a: string, b = '256', c = '256', feedback = 'a', filter = 'Off') => `<?xml version="1.0" encoding="UTF-8"?>
<defaults>
	<cc_mappings>
		<pitch>3</pitch>
	</cc_mappings>
	<settings>
		<channels>
			<a>
				<channel>${a}</channel>
			</a>
			<b>
				<channel>${b}</channel>
			</b>
			<c>
				<channel>${c}</channel>
			</c>
		</channels>
		<kit_root_note>
			<note>36</note>
		</kit_root_note>
		<feedback>
			<channel>${feedback}</channel>
			<automation>disabled</automation>
			<filter>${filter}</filter>
		</feedback>
		<display_param>
			<popup>Off</popup>
		</display_param>
	</settings>
</defaults>
`

describe('reading the instrument’s follow channels', () => {
  it('reads a plain channel as its own number', () => {
    const s = parseFollowSettings(file('1'))
    expect(s.channels[0]).toMatchObject({ slot: 'a', kind: 'channel', channel: 1, label: 'Channel 1' })
  })

  it('reads the top plain channel', () => {
    expect(parseFollowSettings(file('16')).channels[0]).toMatchObject({ kind: 'channel', channel: 16 })
  })

  /*
   * The case this whole module exists for. 17 is `MIDI_CHANNEL_MPE_LOWER_ZONE`
   * plus one, and the zone speaks on its master channel, which is MIDI 1.
   */
  it('reads the MPE lower zone, and gives its master channel', () => {
    const s = parseFollowSettings(file('17'))
    expect(s.channels[0]).toMatchObject({ kind: 'mpeLower', channel: 1, label: 'MPE lower zone' })
  })

  it('reads the MPE upper zone, whose master is MIDI 16', () => {
    expect(parseFollowSettings(file('18')).channels[0]).toMatchObject({ kind: 'mpeUpper', channel: 16 })
  })

  it('reads an unassigned slot', () => {
    const s = parseFollowSettings(file('256'))
    expect(s.channels[0]).toMatchObject({ kind: 'unassigned', channel: null, label: 'Unassigned' })
    expect(s.channels[1].kind).toBe('unassigned')
  })

  it('reads the feedback slot and the filter', () => {
    const s = parseFollowSettings(file('17', '256', '256', 'b', 'On'))
    expect(s.feedback).toBe('b')
    expect(s.feedbackFilter).toBe(true)
  })

  it('treats a file without a settings block as feedback off', () => {
    const s = parseFollowSettings('<defaults><cc_mappings><pitch>3</pitch></cc_mappings></defaults>')
    expect(s.feedback).toBe('none')
    expect(s.channels.every((c) => c.kind === 'unassigned')).toBe(true)
  })

  it('finds the slot feedback is routed through, track combinations included', () => {
    expect(feedbackSlot(parseFollowSettings(file('5', '256', '256', 'a')))?.channel).toBe(5)
    expect(feedbackSlot(parseFollowSettings(file('256', '9', '256', 'track_b')))?.channel).toBe(9)
    expect(feedbackSlot(parseFollowSettings(file('5', '256', '256', 'none')))).toBeUndefined()
  })
})

describe('what the settings mean for this editor', () => {
  it('says which MIDI channel the mirroring will arrive on', () => {
    const lines = followAdvice(parseFollowSettings(file('17')))
    expect(lines[0].text).toContain('MPE lower zone')
    expect(lines[0].text).toContain('MIDI channel 1')
  })

  /*
   * The asymmetry that reads as "send is broken": a zone still sends feedback
   * on its master channel whatever the input port is doing, but a CC only
   * *matches* a zone when the input port has that zone configured.
   */
  it('names the port an MPE follow channel needs', () => {
    const lines = followAdvice(parseFollowSettings(file('17')))
    expect(text(lines)).toContain('Deluge Port 2, MIDI channel 1')
  })

  /*
   * The feedback slot is tried first, so with A working there is no reason to
   * reach for B even though B would also work.
   */
  it('keeps both directions on the feedback slot when it works', () => {
    const lines = followAdvice(parseFollowSettings(file('17', '3')))
    expect(text(lines)).toContain('Sending: Channel A is MPE lower zone')
  })

  it('says when feedback is off at all', () => {
    const first = followAdvice(parseFollowSettings(file('1', '256', '256', 'none')))[0]
    expect(first.text).toContain('feedback is off')
    expect(first.level).toBe('warn')
  })

  it('says which port and channel a send will be accepted on', () => {
    const second = followAdvice(parseFollowSettings(file('9')))[1]
    expect(second.text).toContain('Deluge Port 1, MIDI channel 9')
    expect(second.level).toBe('info')
  })

  it('names the one-second filter, which makes a drag look dead', () => {
    const lines = followAdvice(parseFollowSettings(file('1', '256', '256', 'a', 'On')))
    const filter = lines.find((l) => l.text.includes('Filter Responses'))
    expect(filter?.text).toContain('within the last second')
    expect(filter?.level).toBe('warn')
  })

  it('says nothing about the filter when it is off', () => {
    expect(text(followAdvice(parseFollowSettings(file('1'))))).not.toContain('Filter Responses')
  })
})

/**
 * `SETTINGS/MIDIDevices.XML`. The `<input>` block exists only when a zone
 * does, so its absence is the answer rather than a gap.
 */
const devices = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<midiDevices firmwareVersion="c1.3.0" earliestCompatibleFirmware="4.0.0">
${inner}
</midiDevices>
`

describe('reading the MPE zones on the Deluge’s inputs', () => {
  it('reads a lower zone on the upstream USB input', () => {
    const z = usbInputZones(
      parseMpeInputs(devices('<upstreamUSBDevice><input><mpeLowerZone numMemberChannels="7"/></input></upstreamUSBDevice>')),
    )
    expect(z.lowerLast).toBe(7)
    expect(hasLowerZone(z)).toBe(true)
  })

  it('reads no zone at all when the port block is absent', () => {
    const z = usbInputZones(parseMpeInputs(devices('<dinPorts><input><mpeLowerZone numMemberChannels="7"/></input></dinPorts>')))
    expect(hasLowerZone(z)).toBe(false)
  })

  it('converts the upper zone’s member count into its first channel', () => {
    const z = usbInputZones(
      parseMpeInputs(devices('<upstreamUSBDevice><input><mpeUpperZone numMemberChannels="4"/></input></upstreamUSBDevice>')),
    )
    expect(z.upperFirst).toBe(11)
  })
})

/*
 * The configuration that produced this whole investigation: follow channel A
 * set to the MPE lower zone, B and C unassigned, feedback routed through A.
 * Mirroring works and sending does not, and the reason is not the settings at
 * all — it is which of the Deluge's three USB cables the CC goes out on.
 */
describe('an MPE follow channel, and which USB cable it needs', () => {
  const settings = parseFollowSettings(file('17'))

  /*
   * Only cable 2 is built with MPE zones (`MICableUSBUpstream{1, true, false}`
   * in `midi_device_manager.cpp`), so it is the only port where MIDI channel 1
   * is read as the lower zone rather than as channel 1.
   */
  it('accepts an MPE-lower follow channel on port 2 and nowhere else', () => {
    const a = settings.channels[0]
    expect(accepts(a, 2, 1)).toBe(true)
    expect(accepts(a, 1, 1)).toBe(false)
    expect(accepts(a, 3, 1)).toBe(false)
  })

  it('picks port 2, channel 1', () => {
    expect(chooseSendTarget(settings)).toMatchObject({ port: 2, channel: 1, slot: 'a' })
  })

  it('says which port the editor has to use, and why', () => {
    const joined = text(followAdvice(settings))
    expect(joined).toContain('Deluge Port 2, MIDI channel 1')
    expect(joined).toContain('Only that USB cable has MPE zones')
  })

  /*
   * And the exact inverse, which is the trap in the other direction: a plain
   * follow channel of 1 cannot work on port 2, because that port maps channel
   * 1 into the lower zone before the comparison happens.
   */
  it('refuses a plain channel 1 on port 2, and takes port 1 instead', () => {
    const plain = parseFollowSettings(file('1'))
    expect(accepts(plain.channels[0], 2, 1)).toBe(false)
    expect(accepts(plain.channels[0], 1, 1)).toBe(true)
    expect(chooseSendTarget(plain)).toMatchObject({ port: 1, channel: 1 })
  })

  /*
   * Port 2's two zones between them cover every channel — lower 0 to 7, upper
   * 8 to 15 — so no plain follow channel can ever match there, whatever number
   * it is set to.
   */
  it('never matches a plain channel on port 2, at any number', () => {
    const plain = parseFollowSettings(file('12'))
    expect(accepts(plain.channels[0], 2, 12)).toBe(false)
    expect(chooseSendTarget(plain)).toMatchObject({ port: 1, channel: 12 })
  })

  it('honours the devices file over the built-in defaults', () => {
    // A card that has had the zone moved onto cable 1 instead.
    const byCable = parseMpeInputs(
      devices('<upstreamUSBDevice><input><mpeLowerZone numMemberChannels="7"/></input></upstreamUSBDevice>'),
    )
    expect(accepts(settings.channels[0], 1, 1, byCable)).toBe(true)
    expect(chooseSendTarget(settings, byCable)).toMatchObject({ port: 1 })
  })

  it('says nothing will be accepted when no slot can match anywhere', () => {
    const none = parseFollowSettings(file('256'))
    expect(chooseSendTarget(none)).toBe(null)
    const lines = followAdvice(none)
    expect(text(lines)).toContain('none of Channel A, B or C is assigned')
    expect(lines.every((l) => l.level === 'warn')).toBe(true)
  })
})
