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
which controls exist — and the values behind hidden controls still round-trip.
Once a real device has been seen, the file's attribute stops being a default at
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
  the right name and size proves nothing; only the read-back does, and the
  panel says "read back byte-identical" because that is literally the test.

The client is framework-free and its tests run against a fake Deluge
(`src/core/sysex/fake-deluge.ts`) transcribed from `smsysex.cpp` — the fake
drops oversized frames, short-writes, and pages directories at 25 lines,
because those are the firmware behaviours worth testing against. Loading from
the card goes through the same `editor.load` as drag-drop, so the round-trip
guarantees are identical.

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
