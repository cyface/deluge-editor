# Capturing Deluge-authored fixtures

The round-trip suite only means something if the fixtures were written by the
Deluge firmware. This is how to get such files, in order of preference, and
the facts that make the emulator route work. `tests/fixtures/SOURCES.md` lists
what was captured this way and from which firmware.

## 1. Make DelugEmu write them (preferred)

[DelugEmu](https://github.com/gramster/delugemu) runs real firmware binaries
under QEMU. A preset the emulator's firmware *saves* is Deluge-authored by
definition, and the run is reproducible for any firmware build. The script in
`.claude/skills/deluge-fixtures/emu_fixtures.py` automates it:

```sh
python3 .claude/skills/deluge-fixtures/emu_fixtures.py \
  --fw fw/deluge-v1_3_0-beta+2026_08_29-3f898e9.bin \
  --out tests/fixtures/community-c1.3.0-beta-3f898e9 \
  init 'synth:SYNTHS/Factory/091 FM Ricochet.XML' 'kit:KITS/012 HR-II.XML'
```

Each job is one emulator run, about 75 seconds:

1. Build a throwaway card folder containing `SETTINGS/`, the one preset, and
   every sample it references (copied from the source card folder, default
   `~/Library/Application Support/DelugEmu/sdcard_rw`).
2. Launch `DelugEmu <bin> --sd <folder>_rw --display none -- -qmp unix:<sock>,server,nowait`.
3. Wait for `Launching deluge machine` in `~/Library/Application Support/DelugEmu/delugemu.log`,
   then ~60 s for the firmware to boot. Its boot song loads the first synth
   found in `SYNTHS/`, so the preset is already loaded.
4. Over QMP `input-send-event`: for a kit, press `w` (KIT) first, which turns
   the clip into a kit and loads the first kit. Then hold `s` (SAVE), press `q`
   (SYNTH) or `w` (KIT), release — the "SAVE SYNTH" / "SAVE KIT" screen opens
   with the current name filled in. `ret` (SELECT) saves; the file exists, so
   an `OVERWRITE? / OK` menu appears; `ret` again accepts it.
5. QMP `quit`. The emulator's launcher writes the card image back to the
   `_rw` folder (rsync, timestamps preserved), and the script copies the
   preset out. The input has been replaced by the firmware's serialisation of
   it, so the input's format never matters — this is also how to migrate an
   old-format preset without editing it by hand.

The `init` job leaves `SYNTHS/` empty; the firmware then builds its built-in
default synth, names it `0`, and the same gesture saves it as `0.XML`.

**Sample paths.** A preset that uses samples comes back with whatever
`fileName` paths the input had, and the tests only ever treat them as strings.
To keep library and artist names out of the fixtures, point the *input* at
neutral names and let the firmware write those: make a private source card
folder (`--src-sd`) with the WAVs copied to `SAMPLES/Fixtures/<role>.wav`
(`kick.wav`, `range-low.wav`, `wavetable.wav`, …) and the preset's `fileName`
values edited to match. Editing the input is fine — the input is never the
fixture — and the samples must actually be present so loading behaves exactly
as it would on a real card. The captured file is still 100% firmware-written.

Captures are not byte-reproducible: `<arpeggiator notePattern>` is a random
pattern the firmware generates per session.

A screendump is taken at each step into `$TMPDIR/deluge-fixtures/shots/`
(`*-oled.png` is the display, cropped). The script warns when a result is not
both firmware-stamped (see below) and different from the input; look at the
shots when that happens.

### Firmware behaviour this relies on

Verified in the `beta` tag of SynthstromAudible/DelugeFirmware, 2026-08-29:

- Boot without a startup song: `Song::setupDefault` (`src/deluge/model/song/song.cpp`)
  loads the first preset the browser finds under `SYNTHS/` (subfolders
  included); if none, `createNewInstrument` + `setupAsDefaultSynth`, named `0`.
- In an instrument clip, SAVE alone saves the **song**. Holding SAVE
  (`UI_MODE_HOLDING_SAVE_BUTTON`) and pressing the SYNTH/KIT button that
  matches the clip type opens `saveInstrumentPresetUI`
  (`src/deluge/model/clip/instrument_clip_minder.cpp`).
- Saving onto an existing name opens `gui::context_menu::overwriteFile`, which
  has exactly one option; SELECT accepts it
  (`src/deluge/gui/ui/save/save_instrument_preset_ui.cpp`, `performSave`).
- The firmware has no clock: `get_fattime()` returns 0, so every file it
  writes is stamped **1969-12-31**. On any card that is how to tell a
  Deluge-written file from a computer-written one.

### Emulator behaviour this relies on

- `--sd <dir>`: the launcher (`Contents/Resources/scripts/run.sh`) builds a
  FAT image from the folder. Only a folder name ending in `_rw` is written
  back, and only on a clean exit — `pkill` loses everything the firmware
  wrote. The write-back is `rsync -a`, whose quick check **skips a file whose
  size and mtime are unchanged**. An input that already carries the firmware's
  1969 stamp (a file copied off a card) and comes back the same size keeps its
  old bytes, and it looks exactly like a deterministic re-save. The script
  refreshes the input's mtime before launch so this cannot happen; do the
  same if you drive the emulator by hand. A running emulator also writes its snapshot back when it exits, so
  never edit the folder while one is up; the script refuses to start when a
  `qemu-system-arm` is already running.
- App-mode launches (no TTY) log to `~/Library/Application Support/DelugEmu/delugemu.log`,
  overwritten per run. Arguments after `--` go straight to QEMU; that is how
  the QMP socket is added. Unix socket paths must be short.
- Key map (`src/hw/input/deluge_input.c` in the delugemu repo): `q` SYNTH,
  `w` KIT, `e` MIDI, `s` SAVE, `l` LOAD, `ret` SELECT click, `backspace` BACK,
  `c` CLIP view, `tab` SESSION, space PLAY. QMP `input-send-event` with
  `"down": true/false` holds a key, which is what the SAVE chord needs.
- `human-monitor-command screendump <file>.ppm` works with `--display none`;
  `sips -s format png` converts it. The monitor splits its argument on
  spaces, so the path must not contain any. The OLED sits at roughly x 150–1150,
  y 630–890 of the 2256×1584 panel.

### Firmware binaries

- Community releases and the rolling beta:
  `gh release download beta -R SynthstromAudible/DelugeFirmware -p '*.zip'`.
  `strings deluge.bin | grep -E '^c?1\.[0-9]'` prints the version and commit
  (e.g. `1.3.0-beta-3f898e9`) — check it before trusting any `.bin`.
- DelugEmu ships `deluge-c1_2_1.bin` in its `firmware/` folder.
- A local build of `~/WebstormProjects/DelugeFirmwareTW` works too, but its
  `local-fixes` branch has fork-only features; a fixture from it does not show
  what stock firmware writes. Say which binary in SOURCES.md.
- **Official 4.x binaries are not available** to the emulator (they were
  distributed by Synthstrom as card downloads and are not in the GitHub
  releases). 4.x coverage comes only from files real hardware wrote.

## 2. Files real hardware wrote

Any `*.XML` on a Deluge card with a 1969-12-31 timestamp. Tim's card copy on
this machine (`~/Library/Application Support/DelugEmu/sdcard_rw`) has:

- `SYNTHS/Tim/*` — Tim's own presets, community 1.3.0.
- `SYNTHS/Famous/**` — a third-party preset pack, official 4.0.1.
- `SONGS/Tim/*` — 82 songs, community 1.3.0 (songs embed instruments; useful
  once the editor reads songs).

Saving a preset on a Deluge running official 4.1.4 is the only way to get a
4.1.x fixture.

## 3. Factory presets

`SYNTHS/Factory/*` and `KITS/*` as shipped on the card are Synthstrom's
content, mostly in the pre-3.0 nested-tag format (some with no
`firmwareVersion` element at all). They are the only source for that format.
Keep to a few, and prefer re-saving them through the emulator (route 1) when
what you need is the *current* format rather than the old one.

## Recording what you captured

The script writes each file under the name the firmware gave it (the card
name, or `0.XML` for the default synth). Rename it for what it exercises —
`Sample Ranges.XML`, `Kit Sample Rows.XML` — so the fixture list reads as a
coverage list; synth presets carry no internal name, so only the filename
changes. Then add a row to `tests/fixtures/SOURCES.md`: the folder is named
after the writer (`<lineage>-<version>[-<commit>]`), and the row records the
original name, what the firmware loaded, how, and which XML features the file
covers.
