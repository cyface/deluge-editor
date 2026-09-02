# Decisions

Things that look like bugs or omissions but are deliberate. Add the *why*; cite
firmware source where the Deluge's behaviour is the reason.

## Firmware-gated UI, not "CFW" badges

Every feature that isn't in all firmware the editor targets is declared in
`src/core/firmware/features.ts` with the minimum version that supports it, per
lineage (official `4.x.y` / community `c1.x.y`). The UI asks
`supports(selectedFirmware, feature)` and **omits** the control entirely when
the answer is no. No badges, no greyed-out rows, no "community firmware only"
labels sprinkled through the UI.

Why: the Deluge accepts unknown XML silently and does something else with it
(see the upstream editor's decisions log — `lpfMode="SVF"` turning the filter
off is the canonical case). A control the selected firmware can't honour is a
trap, and a badge is a warning the user has to read every time. Removing the
control is the only version that can't be misread.

Consequences:
- The selected firmware is UI state, defaulting to the loaded preset's
  `firmwareVersion` attribute. A preset can be *re-targeted* by changing it,
  which may drop controls; the values behind them still round-trip untouched
  via pass-through.
- Feature entries cite the firmware commit, table, or release note that
  introduced them. An entry without a citation is a guess and gets reverted.
- Versions compare only within a lineage. A feature that lists only a
  `community` minimum is unsupported on every official build, and vice versa.

## Core is framework-free

`src/core/` imports nothing from Svelte or the DOM beyond `DOMParser`, which
`happy-dom` provides under test. This is what makes the round-trip test run in
Node on every commit instead of by hand against an SD card.

## Round-trip compares values, not names

`tests/roundtrip.test.ts` flattens both documents to path→value maps and
requires zero missing, added, or changed entries, then a byte-identical second
save. Name-only comparison has passed while values were being corrupted.

## State is the file's strings, in the file's order

`parseXML` returns an ordered element tree (`src/core/xml/element.ts`) whose
attribute values are exactly the strings the file had — `0x7FFFFFFF`, `-12`,
`1`, `saw`. The typed shapes in `src/core/preset/types.ts` name what the
firmware writes so the UI can bind without casts, but they are views over
that tree, not a second copy of the data. Numbers are converted at the edge
(`hexToInt`/`intToHex`, `Number`/`String`).

Why: everything the editor does not model still has to come back out
unchanged and in place, and the firmware treats an attribute and a child
element with text as the same thing (`readTagOrAttributeValue`). One
representation that *is* the document, plus types over it, can't lose a value
the UI never touched. Attribute and element order are the document's order;
a new attribute assigned in the UI lands at the end, and where the firmware's
order matters the UI is expected to place it (the writer order is recorded in
`src/core/preset/params.ts` and the `types.ts` field order).

Consequences:
- Every attribute in the typed shapes is optional. The firmware omits many at
  their defaults and older firmware never wrote the newer ones; an absent
  attribute means "the firmware's default".
- The pre-3.0 nested format is read into the same tree (a leaf element
  becomes an attribute of its parent; `<firmwareVersion>` beside `<sound>`
  becomes its first attribute) and is never written. The round-trip
  comparator applies the same equivalence, independently.
- Files the firmware wrote in the attribute format come back **byte for
  byte** (`tests/roundtrip.test.ts`), because `src/core/xml/generate.ts`
  reproduces `XMLSerializer`'s layout, including which attributes it puts on
  the tag line. That table is a firmware fact with a citation, like the
  feature table.

## No XML escaping

The firmware writes attribute values verbatim (`XMLSerializer::writeAttribute`,
`src/deluge/storage/Serializer.cpp`) and reads them verbatim; a sample under
`SAMPLES/Drums & Perc/` is written with a bare `&`, and `&amp;` in a file
would load as the literal text `&amp;`. The editor does the same: every `&` is
literal on the way in and written raw on the way out. Producing "valid" XML
here would corrupt names on the instrument.

## Numbers are shown as the Deluge shows them

A knob reads 0–50 (pan −25..25, a cable −50.00..50.00, a sidechain rate 0–50,
a compressor value 0–127) because that is what the instrument's menu shows for
the same stored value, computed with the same integer arithmetic
(`src/core/params/scale.ts`, from `gui/menu_item/value_scaling.cpp` and the
menu items that call it). Setting a knob to 25 stores the int32 the Deluge
would store for 25.

Why: two editors that disagree about what "25" means make presets that drift
when re-saved on the other. The firmware is the only reference that can't be
argued with, and its conversions are small and lossless per menu step.

Consequences:
- A stored value between two menu steps reads as the nearer step and is only
  rewritten when the knob is moved, so an untouched knob never changes a file.
- A value the file omits reads as `—` and the knob's arc is empty: the
  firmware's default applies and the editor does not guess what it is.
  Moving the knob creates the attribute where the firmware writes it
  (`src/core/preset/order.ts`).
- `syncLevel` names (`16th`, `1-bar`) follow `syncValueToString` for the file
  value, which is absolute; `syncType` is written as the enum value 0/10/19.

## The selected firmware defaults to the file's, else to 4.1.4

The controls are gated for the version in the top-bar pill. It starts as the
loaded file's `firmwareVersion`; a file without one (the pre-3.0 nested format)
or with one the editor can't parse starts at official `4.1.4`, the most
conservative target, so no community-only control is offered for a file
whose origin is unknown. Changing the pill changes nothing in the file — only
which controls exist — and the values behind hidden controls still round-trip,
including the file's own version attributes (see "A save never restamps the
file's firmware attributes"). Once a real device has been seen, the file's attribute stops being a default at
all — see "The connected Deluge outranks the file's firmware attribute".

## The summariser is a pure function in core

The OLED sentence and its chips come from `src/core/preset/summary.ts`,
tested against the fixtures, and the UI renders the result verbatim. It reads
the model through the same accessors the panels edit with, so it can't
disagree with a knob. Its thresholds are judgement calls ("half-open" below 32)
but each is one number in one place.

## A save to the card is verified, not assumed

Card access speaks the community firmware's smSysex protocol
(`src/core/sysex/`, from `storage/smsysex.cpp`; community 1.3.0+, cited in
the `smSysex` feature entry). Three of its behaviours are easy to build a
data-loser on, so the client treats the card as hostile:

- A request can vanish with no reply — the firmware silently drops SysEx over
  its 1024-byte receive buffer and queues requests behind card access — so
  every command runs on a timeout ladder and a resend takes a fresh message
  id. Write chunks are 512 bytes (~645 packed), never near the buffer.
- A short write is **not an error**: the firmware commits what arrived and
  replies `err=0` with the real count in `size`. The count is checked and the
  chunk rewritten, or the file would be silently holed with zeros.
- After the last chunk, the file is read back and byte-compared. A file with
  the right name and size proves nothing; only the read-back does. The panel
  reports a plain "written" — but it never says it before the read-back
  matched.

The browser those saves happen in is a **modal**, not a panel hanging off its
button. It is a file browser — path bar, listing, save name — somewhere you
work for a moment rather than a menu you glance at, and as a popover it
floated over the very editor it was about while the page behind it stayed
live. Loading a file has always closed it; a verified save now closes it too,
and the confirmation moves to the page for a few seconds rather than dying
with the dialog that earned it. That line still carries the second-editor
qualifier below, because "this may not stay written" is the last thing a
dismissal should swallow. The button that opened the dialog no longer doubles
as its close, since it sits behind the veil: the × and Escape do that, as they
do for every other dialog here.

The client is framework-free and its tests run against a fake Deluge
(`src/core/sysex/fake-deluge.ts`) transcribed from `smsysex.cpp` — the fake
drops oversized frames, short-writes, and pages directories at 25 lines,
because those are the firmware behaviours worth testing against. Loading from
the card goes through the same `editor.load` as drag-drop, so the round-trip
guarantees are identical.

## A second editor is detected and named, not locked out

Web MIDI is not exclusive. CoreMIDI and the other OS stacks multiplex, so
every open tab, browser and app receives **every** reply the Deluge sends,
and any of them can send. Most of that is harmless by construction: sessions
are allocated fresh per `session` request (`assignSession`, smsysex.cpp), so
each client gets its own block of seven message ids, and replies are matched
against the ids we are actually waiting on.

Two things had to change (issue #8). The `^session` grant is the exception to
the id rule — it comes back on msgId 0 (`startDirect`), identical in shape
whoever asked — so with the old static tag two tabs negotiating at once could
each adopt the other's grant, land on one session, and read each other's
replies as their own. The tag is now drawn per client and the firmware's echo
of it is checked, so only the grant we asked for is adopted. And a reply on
another session's ids is now reported (`onOtherClient`) instead of quietly
dropped, which is a free and reliable tell that a second editor is live.

The response is a warning, not a lock. `open` with write:1 is
`FA_CREATE_ALWAYS` — a truncate — so two editors saving one path corrupt it,
and nothing on this side can prevent that: even a save whose read-back
verified can be overwritten a second later. So the card panel and the kit
builder carry an advisory while another editor is heard, a save that
completes says it may not stay written, and both keep working. The flag is
sticky for the connection because "it went quiet" is not reassurance.

## The connected Deluge outranks the file's firmware attribute

`firmwareVersion` in a preset says who *wrote* the file; a connected device
says what will *run* it. When a Deluge answers the identity inquiry, the
firmware selector locks to its version — a static pill, no dropdown, because
the device is the ground truth and overriding it would only mislead. The lock
**sticks**: after disconnect the dropdown returns with the last-connected
version still selected, and loading a file no longer resets it from its
attribute (the "saved by firmware …" label still shows provenance). The Connect
button becomes "Device" with a green dot while connected.

Two firmware facts make this sound: the identity reply carries
`FIRMWARE_VERSION_MAJOR/MINOR/PATCH` (`src/deluge/io/midi/midi_engine.cpp:784`),
and official 4.1.4 throws away all incoming SysEx (`synthstrom-official`
`src/midiengine.cpp:531`), so a Deluge that answers at all runs community
firmware — mapping the reply to lineage `c` is cited, not guessed. Unplugging
is noticed via `MIDIAccess.onstatechange`, which drops the card panel to an
error with a retry rather than letting a dead connection look alive.

## A save never restamps the file's firmware attributes

Retargeting the pill changes which controls exist. It does not change what a
save writes for `firmwareVersion` or `earliestCompatibleFirmware` (issue #28):
both pass through like any other unmodelled value, so a New Synth saved
against a 4.1.4 target still says `c1.3.0` — the firmware that actually wrote
those bytes. That looks like an oversight and is the reverse: restamping
either one silently changes the file's values on the instrument.

**`earliestCompatibleFirmware` is not provenance.** Every family writes the
same hardcoded string for an instrument, whatever version it is: `4.1.0-alpha`
in community 1.0 through 1.3 (`model/output.cpp:234` and
`processing/sound/sound_drum.cpp:123` on `beta`, the same literal back at
`release_1_0`) and in official 4.1.4 (`synthstrom-official`
`src/Output.cpp:180`); official 4.0.1 wrote `4.0.0`, and the fixtures carry
both. It is the reader's refuse-to-load floor, not a stamp:
`tryReadingFirmwareTagFromFile` returns `FILE_FIRMWARE_VERSION_TOO_NEW` when
it is newer than the running firmware (`storage/Deserializer.cpp:874`).
Raising it to the selected target can only lock out firmware that reads the
file fine, and a community string there locks out *every* official build,
whose `stringToFirmwareVersion` maps anything it doesn't recognise to
`FIRMWARE_TOO_NEW` (`synthstrom-official` `src/functions.cpp:1977`).

**`firmwareVersion` is the reader's conversion key.** It becomes
`song_firmware_version`, and the reader applies legacy fixups below fixed
thresholds: filter modes cleared on an FM patch below community 1.2.0
(`processing/sound/sound.cpp:3238`), resonance volume compensation below
official 1.2.0 (`sound.cpp:3245`), default expression patching below official
4.0.0-beta (`sound.cpp:263`). Firmware ordering compares lineage *first* — a
defaulted `operator<=>` over fields with `type_` declared first, and
`COMMUNITY = 254` (`util/firmware_version.h.in:9,45`) — so every official
version is "older" than every community one. Restamping a community-authored
FM preset to `4.1.4` would therefore have community firmware force `hpfMode`
and `lpfMode` to OFF as it loads. That is the `lpfMode="SVF"` trap again, with
the editor writing it this time.

Passing the file's own value through is not just the safe default here, it is
the correct one, and for a reason particular to this editor: we carry values
through rather than rebuilding them, so a 2.x preset still holds 2.x values
and the fixups its stamp asks for are exactly the ones those values still
need. A file with no `firmwareVersion` keeps none — the reader starts at
official 0.0.0 (`Deserializer.cpp:77`), which is what an unstamped pre-3.0
file means. (The upstream editor pins a literal `c1.3.0` instead, for the
opposite and equally correct reason: it regenerates every file from a modern
template, so it has nothing old left to convert.)

The consequence for the UI is that the pill promises less than its name
suggests, and says so: it gates controls, and the top bar keeps showing "saved
by firmware …" beside it because that is the attribute a save preserves.

**What would change this:** a fixup threshold *above* c1.3.0, which would
start converting values in files we write. Check the `song_firmware_version`
comparisons in the reader before assuming the pass-through is still free.

## Kit rows built from samples are clones of the blank kit's row

The kit builder (issue #10) never authors a sound. Every row it adds is a
deep clone of the one row in `src/assets/templates/Default Kit.XML` — the row
the firmware itself creates for the new-kit gesture — with exactly four
things set: the row name, `osc1`'s `fileName`, the zone, and the loop mode.
The zone end is the WAV's exact frame count, data-chunk bytes over block
align, which is the same arithmetic the firmware runs on load
(`Sample::finalizeAfterLoad`, `model/sample/sample.cpp:1715-1729`,
upstream/community bef6d9df) and what it re-saves after a manual sample
selection (`SampleHolder::setAudioFile`). Loop mode is `1` — ONCE
(`SampleRepeatMode`, `definitions_cxx.hpp:495`) — like every factory drum
row and the firmware-authored `Kit Sample Rows.XML` fixture.

Row order is guessed from file names alone (regex, no audio analysis):
kick on the bottom pad — first in the file, like the factory kits — then
snare, closed hat, open hat, clap, rim, toms, cymbals, percussion, rest.
It is a guess by design; the rows table makes reordering cheap (drag or ▲▼).

The share zip (`src/core/kit/share.ts`) stores entries uncompressed — the
payload is WAV audio and one small XML, so deflate would buy little and cost
a dependency — and all metadata (author, licensing, source) goes in the
README, never into the kit XML, so the packaged kit stays byte-identical to
the saved one.

## A range edit writes the file the instrument would have written

The multisample range list (`src/core/preset/ranges.ts`) is one list whichever
of the two shapes a file uses: the `<sampleRanges>` array, or the single range
the firmware flattens onto the `<osc>` itself. Which shape gets written follows
the count, the way the serializer's own `numRanges > 1` does, so adding a
second sample or deleting back down to one moves `fileName`/`transpose`/`cents`
and the `<zone>` across on its own.

Every write then holds the invariants the firmware's reader and writer require
together: top notes strictly ascending and unique (a duplicate is
`Error::FILE_CORRUPTED` and the whole preset fails to load), exactly one range
without a `rangeTopNote` and it is the last, never the literal 32767 the
absent attribute means, and every range at least one note wide. The bounds an
edit clamps to are the instrument's own (`MultiRange::selectEncoderAction`),
as are the splits an insert makes and the space a delete hands back.

Two consequences worth naming:

- Ranges are **reordered on the first edit, never on load**. The firmware's
  reader inserts them sorted whatever order the file listed them in, so
  document order carries no information — but leaving a file out of order
  would make it differ from the one the instrument writes. A well-formed
  preset is untouched: on the 769 presets of a real card backup, normalising
  changes only 11, all written by some other tool, all of them carrying a
  redundant `rangeTopNote` on the topmost range that the instrument itself
  drops when it re-saves.
- **Velocity-keyed ranges are passed through, not edited.** Stock firmware
  keys ranges by note and writes `rangeTopNote` only; a fork that adds
  velocity layers to drum rows writes `rangeTopVelocity` in its place, and
  those files are on real cards. Such a range has no top *note*, so ordering
  or repairing it would invent bounds the file never had. `isVelocityKeyed`
  makes every write refuse and the ranges come back out untouched — the same
  answer pass-through gives everything else the editor does not model. The
  fixture that proves it (`fork-c1.3.0-local-fixes-fbba6b4f/`) was captured
  from that fork build rather than copied off the card, because the card's
  velocity kits turn out to be computer-written; see `tests/fixtures/SOURCES.md`.

## The range editor is as wide as the page

Every other section is a masonry panel a few hundred pixels wide. The range
editor is not: its point is the **key map**, and a violin patch with seventy
key zones needs the whole page before the bands are anything but stripes. So
the oscillator panel keeps a thumbnail map and a button, and the editor itself
opens full width between the flow strip and the panels (`RangeEditor.svelte`).
The map's arithmetic is pure and tested in Node (`src/ui/keymap.ts`), including
what a band can say at a given width — span and sample, sample alone, span
alone, or nothing.

Three things follow from the model rather than from taste:

- **Root note is a field; `transpose`/`cents` are not.** The file already
  carries the root losslessly (`root = 60 - transpose - cents / 100`), so the
  editor shows and writes the root and stores nothing extra — no sidecar, no
  editor-only attribute the device's next save would drop. The stored pair is
  still shown, in the list, because a preset can carry deliberate detuning.
- **A range given a new sample gets a fresh zone.** The old `endSamplePos`
  belongs to the old file's length. Browsing the card reads the new WAV's
  header over SysEx for its frame count; a path typed by hand writes
  `endSamplePos="0"`, which the firmware reads as the whole file
  (`SampleHolder::setAudioFile`).
- **Dragging a split reports the note under the pointer and nothing more.**
  Every clamp is the instrument's, in `setRangeTopNote`, so no gesture on the
  map can ask for a file the Deluge would refuse to load.

## New starts from a Deluge-authored template, not a built preset

There is no code that "builds" a default preset. The New Synth button loads
`src/assets/templates/Default Synth.XML` — the firmware's own init synth,
captured with the `deluge-fixtures` skill from the same beta that wrote the
fixtures — exactly as if the user had opened the file. That keeps the
project's rule intact (presets are Deluge-authored, never hand-written): the
round-trip baseline is the template itself, the changes dock and the
byte-identical indicator work from the first click, and every displayed value
is one the firmware actually wrote. The template is a purpose-captured copy
with its own `SOURCES.md`, not an import from `tests/fixtures/` — the UI
bundle doesn't reach into the test tree — and the round-trip suite globs the
templates folder so they are held to the fixtures' bar. The name starts
empty (shown as UNNAMED) so the card panel's save flow forces a real one.
New Kit waits for the kit editor (#10); its template, the blank kit the
new-kit gesture creates, is already captured alongside.

## A multi-sample import that reads names and asks, instead of guessing

The instrument builds a multi-sampled synth from a folder with an FFT
(`Sample::determinePitch`, `model/sample/sample.cpp:1269`) because it cannot
read a filename as text and cannot ask anyone. We can do both, so the import
(issue #33) ships **no pitch detector**. What it takes from the firmware is
the knowledge rather than the necessity: the embedded root note from the WAV's
`smpl`/`inst` chunks, read the device's way (`storage/audio/audio_file.cpp`),
and the device's own discard rule — every file in a folder declaring the *same*
note means a lazy exporter tagged them all, so the whole set is thrown away
(`SampleBrowser::loadAllSamplesInFolder`, `sample_browser.cpp:1360`). On Tim's
card that rule fires on about a third of the library; it is load-bearing.

Below the tags, file names carry the import — never at face value. One integer
offset is fitted for the whole folder against whatever files do declare a
root, and the folder offset stays visible and adjustable, because Salamander
names middle C as C4 and would otherwise land a whole piano an octave out.
Rows nothing places are **flagged, never dropped**, which is the firmware's
worst behaviour here, and every row says where its answer came from. Measured
against the card backup, the cascade puts 728 of 832 ranges on the root the
device stored (`tests/corpus-roots.test.ts`, which skips when the backup isn't
there); the shortfall is folders with neither a tag nor a note name, and the
test pins them by name.

**One panel, no Build button.** The import had both at first — a review table
of its own and a button to commit it — and the first preset built that way was
saved silent, because the panel had been opened, the folder read and the file
downloaded without the confirming click. Nothing else in this editor works
like that: a knob writes when you turn it, and the only commit is saving. So
the import is one question — where are the samples, this computer or the
Deluge — and the answer lands as ranges in the range editor. There is no
second panel to reconcile with the first, because the range editor already is
the review: it lists every range with its file, root, keys and zone.

What the import knows that the range editor cannot work out for itself sits in
a row above the table for as long as it is useful: the folder it came from,
where each root came from (a column, spelled out in a legend — provenance is
the point, so it cannot depend on a tooltip), and **the files it could not
place**, which the firmware drops silently and this lists with a note field
and an Add button. The folder offset became `shiftRanges`: it moves every root
and every boundary by whole semitones, so it repairs a library named against a
different middle C — and, being an ordinary range edit, works on any
multi-sampled oscillator, imported or loaded from a card.

Asking the question turns the target into a sample oscillator straight away,
so the panel and the waveform never disagree, and dismissing it without
choosing a folder puts the waveform back: a sample oscillator with no sample
is silent on the instrument, and that silence is now called out in amber in
the oscillator panel wherever it occurs.

Everything downstream of the roots is the firmware's arithmetic, in
`src/core/preset/multisample.ts`: midpoint boundaries, the zone a freshly
chosen sample gets (a loop with a shorter tail than the loop itself becomes
the zone end, `sample_holder_for_voice.cpp:170-203`), and the repeat mode a
set implies. The review table shows the same `fitSamples` result the writer
consumes, so what the user is shown and what the oscillator gets cannot drift
apart. Boundaries are computed **only** at import — across the same 36 presets
the midpoint rule holds for 716 of 783 adjacent pairs, and every clear miss is
a preset a human touched, so a boundary that isn't the midpoint is a decision,
not a defect.

**Re-detecting the roots of a preset that already has them.** The same reading
runs the other way round, on ranges that are already on an oscillator: read
the files they point at — held bytes first, then over SysEx from the card —
and offer what the cascade makes of them. The instrument cannot do this at
all. Its only route to the question is a whole-folder re-import that deletes
every range first, so a preset with hand-placed splits cannot be re-rooted on
the hardware; here it is a proposal that says what would move, from where to
where and on what evidence, and is applied or turned down.

Three things it deliberately does not do. It does not touch boundaries — the
midpoint rule is an import-time answer and a split that disagrees with it is a
decision. It does not anchor the folder's offset to the roots already stored:
fitting the answer to what is there would report "nothing to change" for
exactly the library that is uniformly an octave out, which is the case this
exists for, so a folder with no tags of its own gets an assumed offset that
says so and Shift all moves the lot afterwards. And it never silently leaves a
range unexplained: one the cascade cannot place keeps the root it has and is
captioned `kept`. Folders are resolved one at a time, because both the discard
rule and the offset are properties of a library rather than of a preset.

Two consequences elsewhere. The bytes of locally sourced samples moved out of
the kit builder into a shared stash (`src/ui/state/samples.svelte.ts`): a
sample-based synth needs the same preview, card push, retarget-on-save and
missing-file warning a kit does, and none of that was ever about kits. And a
save now writes **samples first, preset second** — the Deluge loads a preset
whose samples are absent without complaining and plays it silently
(`Source::loadAllSamples` ignores the per-range error, `processing/source.cpp:105`),
so the preset must never be the thing that lands first.

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
header says in words whose file the edits are landing in, and nothing is
committed until you save, as everywhere else here.

**Sending is off until asked for.** Listening is broadcast-safe — any number
of tabs can mirror at once and the instrument's state is never at risk, so
it is simply what the mode does. The other direction writes into the sound the
Deluge has live, so it is a separate switch, wearing the same warning colour
the card panel uses for "this may not stay as you left it", and it says on
screen which port and channel it is using.

Two firmware facts shape it:

- **A CC only reaches the follow handler on a follow channel.**
  `MidiFollow::checkMidiFollowMatch` tests the incoming channel against
  MIDI-Follow's own A/B/C. So the send channel is a number, not "any" — the
  header's listening selector has an Any and this one cannot.
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
- **Changes go out, not the whole preset.** Turning Send on does not push the
  loaded file at the instrument — that would be a load, from an editor that
  cannot know what it is overwriting. Only values that move while it is on are
  sent. Switching kit row, the bus, or the file replaces every value at once
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
  LFOs 3–4, stutter rate and the compressor threshold — and moving CC 30 from
  osc B's wavetable position to osc A's, which leaves osc B's with no default
  CC at all. The editor shows what the selected firmware actually does, so on
  c1.3.0 osc B's wave position is absent from the follow view. Both tables
  were generated from the firmware sources and cross-checked against a
  `MIDIFollow.XML` the firmware itself wrote.
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

## Tooltip copy is one cited table, keyed the way the file names parameters

Every control says what it does on hover (issue #20), and all of that copy
lives in `src/ui/help.ts` rather than beside the markup. Two reasons, both
about keeping it true.

The first is the citation bar. A tooltip is a claim about the instrument, so
it is held to the same standard as `FEATURES` and `params/scale.ts`: it says
what *this firmware* does, cited in the table's comments — the firmware's own
menu documentation (`docs/menus/**`, upstream/community) where it exists, and
firmware source where it doesn't. "Analog delay darkens the repeats" is a
fact about `delay.analog`; "warm analogue character" is synth-shop copy and
does not belong. Entries that would be guesses were left out rather than
filled in, the same rule an uncited `FEATURES` entry gets.

The second is the key. Knob copy is keyed by the **parameter name a file uses
for that parameter** — a cable's `destination`, a gold knob's `controlsParam`
(`core/preset/params.ts`) — and `HexKnob` looks up its own destination. So one
entry covers LPF Freq wherever it is shown, the numbered envelopes and LFOs
are matched rather than written out four times each (`paramHelp`), and a
description can never drift between two panels showing the same parameter.
Everything that isn't a patchable parameter — selects, toggles, number fields,
the polarity buttons, the panels themselves — is keyed by a slug in the same
file. The kit bus is the one place the same knob means something different, so
`KitGroup` appends one sentence (`KIT_BUS_NOTE`) instead of keeping a second
copy of the text.

**Descriptions stack with the default markers, they don't replace them.** What
a control does and what its blank means are different facts, and a control the
file omits has both: the knob and the number field join the two with a blank
line. Before this pass a `title` silently hid the "not in the file" hint, and
the wavefolder knob — the one control that had a description — had no way to
say both.

The test is the sweep, not a sample: `help.test.ts` asserts every parameter
name the UI can show has copy and that none of it grows past a hint, and the
e2e walks every knob, select, toggle and number field in the rendered panels
of a synth and a kit and fails on the first one with nothing to say.

## A graph is drawn where a picture is the control, and it is a sketch

Four panels draw what their controls do rather than only numbering them: the
filter response, the ADSR overlay, the LFO shapes (issue #35) and the
oscillators' pulse width (issue #36). All four are the same components in the
full editor and in Follow Mode, over the same values, and all four are
draggable, so a knob that moved on the instrument redraws its own picture.

All four are worked the same way: a handle is grabbed and dragged, and
pressing the drawing itself does nothing — the two new ones put theirs on a
track along the bottom edge rather than floating it in the plot, because their
x axis is time and a value cannot share it.

The maths behind each is *illustrative*, and each says so in its header
comment — `FilterGraph` set the precedent ("menu value → 20 Hz…20 kHz, not the
firmware's filter model"), and the LFO's random shapes and the pulse graph's
band-limiting are the same kind of approximation. What is **not** a sketch is
anything the graph puts a number on. Those come from
`src/core/params/lfo.ts` and `src/core/params/pulse.ts`, which are the
firmware's own integer arithmetic under test, held to the same bar as
`params/scale.ts`.

**An LFO rate is shown in hertz, which the Deluge never shows.** The
instrument's menu says 0–50 like every other patched parameter. The frequency
is derived, not invented: `getExp(121739, presetValue × 2^30 >> 32)` is the
phase increment `LFO::render` advances a uint32 phase by each sample
(`Sound::getGlobalLFOPhaseIncrement`, `Voice::getLocalLFOPhaseIncrement`,
`Patcher::recalculateFinalValueForParamWithNoCables`, `getParamNeutralValue`),
so at 44.1 kHz one cycle is 2^32 / that many samples. It comes out at just
under sixteen octaves: menu 0 is one cycle in 205 seconds, menu 25 is 1.25 Hz,
menu 50 is 320 Hz. The knob still reads 0–50; the graph is the only place the
derived number appears, and the tests pin it to the firmware's own values.

**A synced LFO gets no frequency at all.** Its phase increment comes from
`playbackHandler.getTimePerInternalTickInverse()`, so the speed is the song's
tempo and a preset file does not carry one. Rather than guess a tempo, the
graph draws its axis in cycles and names the sync note length.

**And its Rate knob is disabled, not just annotated.** While a sync level is
set the firmware never reads the rate parameter — `getGlobalLFOPhaseIncrement`
and `getLocalLFOPhaseIncrement` return the tempo-derived increment instead —
and it refuses cables to it (`Sound::maySourcePatchToParam`,
`GLOBAL_LFO_FREQ_1` → DISALLOWED), so the right-click cable menu goes too.
This is the one place the editor greys a control rather than removing it, and
the exception is deliberate: the value is still in the file and still
round-trips, and the difference between "there is no such control" and "this
control is not being read right now" is exactly what the user needs to know.
Removing it would leave the sync setting looking like it had eaten the rate.
A knob that turns and changes nothing is the worst of the three.

**Pulse width is drawn because its name misleads.** On the Deluge it is not a
square-wave control and, for the shapes that are not squares, not a duty cycle:
`Oscillator::renderOsc` runs the wave at `1 + pulseWidth / 2^31` times the
note's rate and hard-syncs it back, so a saw at full pulse width is two saws in
the space of one. Zero is *off* rather than a 50% square
(`doPulseWave = (pulseWidth != 0)`), and Osc Sync takes the control away from
every shape but the mathematical square (`doPulseWave = (pulseWidth &&
!doOscSync)`) — the knob stays, because the firmware's menu keeps offering it,
and the graph says why it does nothing.

The same pass made the knob follow `PulseWidth::isRelevant` instead of its own
list: no pulse width in FM mode, none for a sample or an audio input, and a
wavetable gets one only once it has a file. DX7 is left out although the menu
offers it, because a DX7 oscillator never reaches this renderer at all —
`Voice::render` hands it to `dxVoice->compute`, so the control is inert.
