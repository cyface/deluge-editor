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
