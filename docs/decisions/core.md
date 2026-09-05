# Core and round-trip fidelity

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

## Core is framework-free

`src/core/` imports nothing from Svelte or the DOM beyond `DOMParser`, which
`happy-dom` provides under test. This is what makes the round-trip test run in
Node on every commit instead of by hand against an SD card.

## Round-trip compares values, not names

`tests/roundtrip.test.ts` flattens both documents to path→value maps and
requires zero missing, added, or changed entries, then a byte-identical second
save. Name-only comparison has passed while values were being corrupted.

The flattener (`src/core/xml/flatten.ts`) walks the DOM itself rather than
reusing `parse.ts`: a parser bug applied to both sides of the comparison would
cancel out, and the test exists to catch exactly that.

The changes dock shows the same diff **grouped**: an element that is wholly
new or wholly gone (a kit row built from a sample, a cable) is one entry, not
one per attribute, and the count on the button counts it that way — a built
kit reads "17 changes", not 2340. Each attribute is still listed, and still
revertible, inside the group.

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
`src/core/preset/order.ts`).

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

One deliberate departure, in spelling only: pan. The instrument's 7-segment
display prints the magnitude with the side after it — `25L`, `12R`, and a
bare `0` at centre (`Pan::drawValue`, `gui/menu_item/patched_param/pan.cpp:30-43`,
`beta` e7bae539) — and the OLED draws a signed number over a bar, negative
left. The editor's knob, its change list and the kit table put the letter
first and name the centre: `L25`, `R12`, `CTR` (`HexKnob.svelte`,
`src/core/preset/describe.ts`, and the kit table's pan cell).
Why: beside a knob, a trailing letter or a minus sign reads as an amount
before it reads as a side, and `-25` next to a 0–50 scale looks like "less"
rather than "left". The number itself is the Deluge's (`panToMenu`), and
typing any spelling — `L12`, `12L`, `-12`, `C` — is accepted (`parsePan`,
`src/core/params/scale.ts`), so nothing a user reads off the instrument is
refused.

## The summariser is a pure function in core

The OLED sentence and its chips come from `src/core/preset/summary.ts`,
tested against the fixtures, and the UI renders the result verbatim. It reads
the model through the same accessors the panels edit with, so it can't
disagree with a knob. Its thresholds are judgement calls ("half-open" below 32)
but each is one number in one place.

## New starts from a Deluge-authored template, not a built preset

There is no code that "builds" a default preset. The New Synth button loads
`src/assets/templates/Default Synth.XML` — the blank synth the new-synth
gesture creates, saved by real c1.3.0 hardware (the emulator's version of the
same file is not what a Deluge writes; `src/assets/templates/SOURCES.md` has
the story), held to the same round-trip bar as the fixtures that came from the
`deluge-fixtures` skill and the same beta that wrote the
fixtures — exactly as if the user had opened the file. That keeps the
project's rule intact (presets are Deluge-authored, never hand-written): the
round-trip baseline is the template itself, the changes dock and the
byte-identical indicator work from the first click, and every displayed value
is one the firmware actually wrote. The template is a purpose-captured copy
with its own `SOURCES.md`, not an import from `tests/fixtures/` — the UI
bundle doesn't reach into the test tree — and the round-trip suite globs the
templates folder so they are held to the fixtures' bar. The name starts
empty (shown as (unnamed)) so the card panel's save flow forces a real one —
except that a preset built from samples is offered the name its samples
suggest when it comes to be saved (`guessPresetName`: the folder they share,
else the folder most of them came from, else the stem they share, else the
one file's stem with its note dropped). A name already on the card still
only arms on the first click, so the offer is never an overwrite by itself.
New Kit loads `Default Kit.XML` the same way: the blank kit the new-kit
gesture creates, captured alongside. The kit builder (#10) builds its rows on
that template (`src/core/kit/build.ts`).
