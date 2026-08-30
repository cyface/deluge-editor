# Round-trip fixtures

**Deluge-authored** preset XML (`*.XML`, any subfolder). Every file is picked
up by `tests/roundtrip.test.ts`, which parses it, generates it back, and
requires the flattened path→value maps to match exactly, then requires a second
generate to be byte-identical to the first.

"Deluge-authored" is the point: the firmware is the ground truth for the format,
and hand-written XML only tests our own assumptions. Sources, in order of
preference:

1. Presets saved by **DelugEmu** running the target firmware — reproducible, no
   redistribution question. `docs/fixture-capture.md` describes the process;
   `.claude/skills/deluge-fixtures/` automates it.
2. Presets you saved on real hardware.
3. Factory presets copied from the SD card's `SYNTHS/` — useful for breadth, but
   they're Synthstrom's content; keep to a few.

Folders are named after the firmware that wrote the files; `SOURCES.md` records
each file's provenance and what it covers. Add a row there for every file you
add here. Files the firmware wrote carry a `1969-12-31` timestamp on the card
(no RTC) — that is how to tell them from ones a computer wrote.
