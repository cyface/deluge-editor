# Round-trip fixtures

Put **Deluge-authored** preset XML here (`*.XML`, any subfolder). Every file is
picked up by `tests/roundtrip.test.ts`, which parses it, generates it back, and
requires the flattened path→value maps to match exactly, then requires a second
generate to be byte-identical to the first.

"Deluge-authored" is the point: the firmware is the ground truth for the format,
and hand-written XML only tests our own assumptions. Sources, in order of
preference:

1. Presets saved by **DelugEmu** running the target firmware — reproducible, no
   redistribution question.
2. Presets you saved on real hardware.
3. Factory presets copied from the SD card's `SYNTHS/` — useful for breadth, but
   they're Synthstrom's content; keep to a few.

Nothing here yet. With no fixtures the round-trip suite registers a single
`todo` so the gap stays visible in every test run.
