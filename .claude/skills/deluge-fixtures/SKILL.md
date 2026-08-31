---
name: deluge-fixtures
description: Capture Deluge-authored preset XML for tests/fixtures/ by driving DelugEmu over QMP - boot a given firmware, load a preset, make the firmware save it back. Use when a fixture is needed for a firmware version or feature the suite doesn't cover yet.
allowed-tools: Bash, Read
---

# deluge-fixtures

Fixtures must be written by the Deluge firmware, never by hand (see
`tests/fixtures/README.md`). This skill makes DelugEmu do the writing, so a new
fixture for any firmware build is one command away.

```sh
python3 .claude/skills/deluge-fixtures/emu_fixtures.py \
  --fw /path/to/deluge.bin --out tests/fixtures/<writer-label> \
  init 'synth:SYNTHS/Factory/091 FM Ricochet.XML' 'kit:KITS/012 HR-II.XML'
```

- `init` saves the firmware's built-in default synth (what you get with no
  presets on the card) as `0.XML`.
- `init-kit` makes the firmware build a new blank kit on an empty card
  (SHIFT+KIT, "NEW KIT CREATED") and saves it.
- `synth:<path>` / `kit:<path>` take a preset from the source card folder
  (default `~/Library/Application Support/DelugEmu/sdcard_rw`), let the firmware
  load it, and save it back over itself. Input format does not matter — old
  nested-tag files come back in the firmware's current attribute format — so
  this is also how to migrate a preset's format without touching it by hand.
- Each job is its own emulator run on a card holding just that preset and its
  samples (~75 s per job). Output files carry the firmware's 1969-12-31 stamp;
  the script warns if a result is not both firmware-stamped and changed.
- Screenshots of each step land in `$TMPDIR/deluge-fixtures/shots/`
  (`*-oled.png` is the display, cropped). Look at them when a run misbehaves.
- Then record the writer (firmware version, commit, how obtained) and the
  source preset in `tests/fixtures/SOURCES.md`.

## Details

`docs/fixture-capture.md` is the full write-up: the firmware and emulator
behaviour the script relies on (with source citations), where to get firmware
binaries, and the other two fixture sources (real hardware, factory card).
Read it before changing the gesture sequence or the SD handling.
