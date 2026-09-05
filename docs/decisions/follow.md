# Follow Mode

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

## Follow Mode is a mode, and sending is a second switch inside it

Community firmware's MIDI Follow sends a CC out whenever a value changes in
the *active context* (`MidiFollow::sendCCForMidiFollowFeedback`,
`io/midi/midi_follow.cpp`). The editor can hear those and move the matching
control — but a follow CC never says *which sound* it belongs to. If the
loaded preset is not what the Deluge has open, mirroring silently writes the
instrument's numbers into an unrelated file.

So it is a mode you switch on, not a background behaviour, and while it is on
the page shows only the parameters MIDI Follow can reach — the firmware's own
default CC map, in the same blocks and the same knobs as the full editor. The
subset is the honesty: what is on screen is exactly what the instrument can
move, and a control follow cannot address is absent rather than inert. The
help sheet says in words whose file the edits are landing in (it moved out of
the header; see "Follow Mode's header is controls"), and nothing is committed
until you save, as everywhere else here.

**Sending is on, and aimed rather than switched off.** Listening is
broadcast-safe — any number of tabs can mirror at once and the instrument's
state is never at risk, so it is simply what the mode does. The other
direction writes into the sound the Deluge has live, and it used to be a
switch you turned on, off by default, because that was the only protection it
had. It now has two better ones, so the switch stays but starts on: sends go
only to a port that names itself a Deluge, and only on a channel the
instrument has actually been heard on. A CC can therefore reach a Deluge that
is talking MIDI-Follow, or nothing at all. It still wears the warning colour
the card panel uses for "this may not stay as you left it", and it still says
on screen which port and channel it is using.

Two firmware facts shape it:

- **A CC only reaches the follow handler on a follow channel, and that is not
  always a number.** `MidiFollow::checkMidiFollowMatch` tests the incoming
  channel against MIDI-Follow's own A/B/C, and each of those is a `LearnedMIDI`
  whose `channelOrZone` can be an MPE zone instead of a channel
  (`isForMPEZone`: `channelOrZone >= 16`). For a zone, `checkMatch` accepts any
  channel the input port maps into it (`MIDIPort::channelToZone`), and the
  instrument's own feedback goes out on the zone's master channel —
  `sendCCForMidiFollowFeedback` does `channel = getMasterChannel()`, which is 0
  for the lower zone and 15 for the upper, so MIDI channel 1 or 16. The menu
  shows "MPE Lower Zone", not a number, so asking the user for a number was
  asking them to derive one. The send channel therefore defaults to **Heard**:
  whatever channel the feedback arrived on. That is correct for a plain follow
  channel and for either zone, and it means nothing is sent before the
  instrument has proved which channel it is talking on. A number can still be
  set by hand.
- **Takeover mode decides what the instrument does with the value.**
  `MidiTakeover::calculateKnobPos` (`io/midi/midi_takeover.cpp`): on JUMP —
  the default (`midiTakeover = MIDITakeoverMode::JUMP`, `midi_engine.cpp:58`) —
  the parameter takes the value outright. On PICKUP or SCALE it waits until
  the incoming and current positions meet. On RELATIVE it reads the value as a
  signed increment, so absolute sends run away. Nothing on the wire reports the
  setting, so the note says what each mode will do rather than pretending.

Consequences of sending:

- **It sends on one port, never all of them.** The mirror listens on every
  Deluge input because an absolute value applied twice is applied once; an
  increment applied three times is not, so the same message on three cables
  would triple a RELATIVE move.
- **Changes go out, not the whole preset.** Entering the mode does not push the
  loaded file at the instrument — that would be a load, from an editor that
  cannot know what it is overwriting. Only values that move while sending is on
  are sent, and the first snapshot of any target is adopted as the baseline
  rather than played. Switching kit row, the bus, or the file replaces every value at once
  and is adopted silently for the same reason.
- **Our own echo is filtered.** The instrument sends an accepted value straight
  back as feedback; applying that would count as a move nobody made. The last
  value sent per CC is remembered for one second and ignored on the way back —
  the same window the firmware's own `midiFollowFeedbackFilter` uses
  (`kSampleRate` ticks, `MidiFollow::midiCCReceived`). A mirrored value is
  likewise not re-sent.
- **The send watcher reads values, it does not hook controls.** The view
  derives the CC value of every mapped parameter and offers the lot on each
  change; anything that moved goes out. So a value dragged on the filter curve
  or an ADSR handle travels exactly like one turned on its knob, and there is
  no control that can be added later and quietly forgotten.

Consequences of the mode:

- **The mirrored value is the instrument's own int32, not the nearest menu
  step.** The wire carries a knob position (`knobPos + kKnobPosOffset`), which
  reverses through `ParamCollection::knobPosToParamValue` — the same
  conversion the Deluge applies to a follow CC it receives. A gold encoder has
  128 positions and the menu 51, so a mirrored value usually lands between two
  menu steps; the knob shows the nearer one and leaves the stored value alone,
  which is the rule this editor already follows for every value a file
  arrives with ("Numbers are shown as the Deluge shows them"). Quantising to
  the menu instead would mean a file saved here could not hold what the
  instrument holds.
- **CC 127 is read as the top, because that is how the instrument reads it.**
  `MidiEngine::sendCC` clamps to 127 while the offset makes a full knob 128, so
  127 is ambiguous on the wire — and `MidiTakeover::calculateKnobPos` resolves
  it upwards, starting at `midiKnobPos = 64` and only assigning `ccValue - 64`
  when `ccValue < kMaxMIDIValue`. Reading it any other way would put the editor
  a knob step below the instrument, and would break the round trip that lets a
  value sent out come back as the same CC.
- **The CC map is per firmware era, and transcribed warts and all.** c1.1.0
  through c1.2.1 mapped CCs by shortcut pad (`defaultParamToCCMapping` against
  the `*ParamShortcuts` grids); c1.3.0 replaced that with lookup tables
  (0d79ad6f #3257), adding the Arpeggiator 3.0 probabilities, envelopes 3–4,
  LFOs 3–4, stutter rate and the compressor threshold. That refactor also
  pointed CC 30 at osc A's wavetable position, doubling CC 25 and leaving osc
  B's with no CC; 9a74e162 (#4528, on `beta` since 2026-06-11) put osc B back
  at 30, and the table follows `beta`, not the `community` branch that still
  predates the fix. Both tables were generated from the firmware sources and
  cross-checked against a `MIDIFollow.XML` the firmware itself wrote.
- **A kit needs a switch the wire does not carry.**
  `MidiFollow::getModelStackWithParamForKitClip` routes a kit clip's follow
  CCs by AFFECT ENTIRE: on, they reach the kit bus's own parameters; off, the
  selected row's sound, minus portamento, which it refuses for kits. Nothing
  in the CC says which, so the follow view has the switch and the row list
  stays on screen to pick the row.
- **Envelopes and LFOs are tabbed, and the tabs follow the instrument.** Four
  envelopes and four LFOs are twenty of the eighty mapped parameters; showing
  them all at once buries everything else, so the view tabs them as the full
  editor does. A mirrored move on a hidden tab would be a move nobody saw, so
  a CC for envelope 3 selects envelope 3 — which is what the mode is for.
- **It listens on every Deluge input port.** `MidiEngine::sendUsbMidi` sends
  to all cables, so the same CC arrives two or three times; applying an
  absolute value twice is the same as applying it once, which beats guessing
  which port the user left enabled for output. A port whose name says nothing
  about a Deluge is still listened to when no port names one, so a Deluge
  reached over DIN through another interface still works.

## Follow Mode's header is controls, and its prose is behind a button

The mode used to explain itself in a paragraph wedged under its own controls.
On a wide screen that was one long line nobody read; on a narrow one it pushed
the controls down. The text was not wrong, it was in the way. It now lives
behind the header's **Help** button at a size worth reading, and the header carries
only what you operate: the listening channel, Send and its channel beside it,
the kit target, and the last CC heard. The applied and sent counters went with
the paragraph — they were a comfort readout, not information anyone acts on.

One line survives in the header, and only while sending is on, because that is
the only state here that can change something outside the page.

**Sending goes to a Deluge or to nowhere.** It used to fall back to the first
MIDI output when no port named itself a Deluge. That was wrong in the
dangerous direction: a CC is not a no-op on the wrong instrument. Every number
the editor sends is one of MIDI-Follow's own — the map is verified against
`MidiFollow::initDefaultMappings` CC for CC — but a follow CC that misses
MIDI-Follow's A/B/C channels, or lands on some other device entirely, falls
through to ordinary MIDI handling, where it can trip a learned command or be
recorded into whatever is armed. So listening still falls back to every input,
because hearing the wrong port costs nothing, and sending does not fall back
at all: with no Deluge output the Send button is disabled and says why. The
channel default above is the other half of the same guard.

## Follow Mode asks the Deluge what its channel actually is

Which channel MIDI-Follow is on is the one thing this mode cannot learn from
the wire. A follow CC carries a channel number, so listening can be set to Any
and simply work, but sending has to be aimed, and the instrument's menu answers
the question in terms that are not a number: the setting is **A**, **B** or
**C**, and each of those can itself be an MPE zone rather than a channel.

Worse, the two directions do not fail together. `sendCCForMidiFollowFeedback`
takes a zone's master channel from `getMasterChannel()` and nothing else, so
feedback goes out on MIDI 1 for the lower zone and 16 for the upper whatever
the port is configured to do. Receiving is stricter: `LearnedMIDI::checkMatch`
compares the slot's `channelOrZone` against `MIDIPort::channelToZone(incoming)`,
and that only returns a zone when the *input port* has that zone set up
(`mpeLowerZoneLastMemberChannel` non-zero). A Deluge whose follow channel is a
zone but whose USB input has no zone configured will mirror perfectly and
accept nothing at all. From this end that is indistinguishable from sending
being broken.

So the editor stops guessing and reads `SETTINGS/MIDIFollow.XML` off the card
over the SysEx protocol it already speaks (`src/core/midi/followsettings.ts`).
The file holds all three channel slots, the feedback slot and the feedback
filter. The one trap in it is that `<channel>` stores `channelOrZone + 1`, and
`channelOrZone` is not a channel when it is a zone: 17 in the file is the MPE
lower zone, 18 the upper, 256 unassigned, and 1 to 16 a plain channel.

It reads `SETTINGS/MIDIDevices.XML` too, because the follow file alone cannot
settle the question. That one holds the MPE zones each port has configured
(`MIDIPort::writeToFile`, `<mpeLowerZone numMemberChannels="…"/>` under
`<input>`), and only with both files in hand can the editor say whether a
follow channel set to a zone will actually match. The firmware writes that
file only when something is worth writing and deletes it otherwise, so "no
such file" is an answer rather than a failure — but only that specific FatFS
result. Any other transfer error leaves the verdict hedged rather than
asserting something the card never confirmed.

**Which USB port a send goes out on is half the answer.** The Deluge presents
three USB MIDI cables and they are not configured alike: only cable 2 is built
with MPE zones. `upstreamUSBMIDICable2{1, true, false}` passes `mpe = true` to
`MIDICableUSBUpstream`, whose constructor sets every port's
`mpeLowerZoneLastMemberChannel` to 7 and `mpeUpperZoneLastMemberChannel` to 8;
cables 1 and 3 pass false and get nothing
(`midi_device_manager.cpp`, `io/midi/cable_types/usb_device_cable.h`).

So on Deluge Port 2, MIDI channel 1 is not channel 1 — `channelToZone` maps it
into the lower zone — and a follow channel set to a plain 1 can never match it.
On Ports 1 and 3 the reverse holds, and a follow channel set to the MPE lower
zone can never match. Port 2's two zones between them cover all sixteen
channels, so no plain channel matches there at any number. Picking the first
Deluge output the browser lists is picking one of these at random, and it was
the whole bug: a correctly configured instrument, mirroring perfectly, ignoring
everything sent to it. The upstream fork's own help text had the trap written
down, which is exactly what reading it is for.

The editor now chooses the port and the channel together, from the settings it
read, and re-picks its output when it learns them.

**Listening and sending are answered separately, because they fail
separately.** Where feedback arrives from is not where a send is accepted.
Naming one channel for both is what made an MPE configuration look like broken
sending. And the way out of that configuration does not cost the MPE setup at
all: `MidiFollow::checkMidiFollowMatch` loops over all three slots
(`kNumMIDIFollowChannelTypes` is 3), so a spare slot set to a plain channel
carries sending while the zone slot goes on being where feedback comes from.
The readout says which slots are free and recommends exactly that, rather than
telling anyone to give up their zone.

The readout sits in the help sheet rather than the header, because it is a
thing you consult once when something is wrong. Once it has run, the
instrument's own settings become the authority for the send channel, in place
of the channel feedback happened to arrive on. A plain slot is preferred over
a zone even when both would work, because `checkMatch` returns CHANNEL for it
outright while a zone counts only on its master channel — MPE_MEMBER is
dropped before it reaches any parameter. When nothing can accept, the send
channel is null and nothing goes out, which is the honest state rather than a
guess.

**The feedback filter is worth naming too.** With it on, the firmware ignores
an incoming CC within one second of having sent that same CC number as
feedback (`midiCCReceivedForSelectedOrActiveClip`, comparing
`AudioEngine::audioSampleTimer - timeLastCCSent[ccNumber]` against
`kSampleRate`). Since the instrument echoes every value it accepts, a knob
dragged here moves the parameter once and then goes quiet for a second. That
reads as a broken send rather than as a filter doing its job, so the readout
says so.

## Follow Mode does not need a file first

Every other top-bar button acts on a loaded preset, so it is disabled without
one. This one is a way to *start* a preset: the sound is already on the
instrument, and the mode's whole job is to bring it here. So the button is
live with nothing loaded, opens the Deluge's own init synth for the CCs to
land in, and the empty state says so. The firmware gate still applies to a
loaded file — MIDI Follow exists on no official build and below community
1.1.0 — but with nothing loaded there is no firmware to ask about yet, and the
init synth is a c1.3.0 file.
