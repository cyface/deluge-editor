# Template sources

The New button starts a preset from these files (issue #25). Like the test
fixtures, they were written by Deluge firmware, never by hand — New loads the
bytes exactly as if the user had opened the file, so the round-trip baseline
is the template itself. They are purpose-captured copies, not imports from
`tests/fixtures/` (the UI bundle doesn't reach into the test tree). The kit
was captured with `.claude/skills/deluge-fixtures/` the same way and from the
same binary as `tests/fixtures/community-c1.3.0-beta-3f898e9/`: DelugEmu
booting `deluge-v1_3_0-beta+2026_08_29-3f898e9.bin` (the `beta` release of
SynthstromAudible/DelugeFirmware, commit `3f898e9`, writes
`firmwareVersion="c1.3.0"`) on an empty card, captured 2026-08-30. The synth
was written by Tim's real Deluge hardware, also on a c1.3.0 beta build
(writes `firmwareVersion="c1.3.0"`), captured 2026-08-31.

| File | How the firmware made it | Loaded by |
|---|---|---|
| `Default Synth.XML` | new-synth gesture in a clip ("NEW SYNTH CREATED", `InstrumentClipMinder::createNewInstrument` → `Sound::setupAsBlankSynth`), saved from real hardware as `Newtest.XML` | `editor.newSynth()` (New Synth) |
| `Default Kit.XML` | empty `KITS/`: SHIFT+KIT built a new blank kit (`InstrumentClipView::handleInstrumentChange` → `createNewInstrument`, "NEW KIT CREATED"), saved as `KIT1.XML` | `editor.newKit()` (New Kit), and `core/kit/build.ts` builds rows onto it |

Both templates are in the round-trip suite (`tests/roundtrip.test.ts` globs
this folder), so they are held to the same byte-for-byte bar as the fixtures.
Capture facts worth knowing:

- `notePattern` under `<arpeggiator>` is a random pattern the firmware
  generates per session, so it differs between captures of the same patch.
- Both templates come from the same *new-instrument* gesture
  (`createNewInstrument` → blank synth / blank kit), so New in the app matches
  what the device itself builds — LPF wide open (50), square osc, unison 1.
  The firmware's *other* init synth, the boot-song default
  (`Song::setupDefault` → `setupAsDefaultSynth`, saved when `SYNTHS/` is
  empty), is a different, more musical patch (saw, 4-voice unison, LPF at 28
  with filter cables); it lives in the fixtures as
  `community-c1.3.0-beta-3f898e9/Default Synth.XML` and was this template's
  source before 2026-08-31 — an earlier capture confused the two.
- The blank kit was the first Deluge-authored file on hand to exercise two
  serializer shapes: a childless sample-type oscillator written open/close
  rather than self-closed, and `<selectedDrumIndex>` as a text element in an
  attribute-format file. Both are handled (with citations) in
  `src/core/xml/generate.ts`.
