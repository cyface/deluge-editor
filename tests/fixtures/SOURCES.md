# Fixture sources

Every file here was written by Deluge firmware. This records which firmware
wrote each one and how it was obtained. Folders are named after the writer;
files are named for what they exercise, with the original card name recorded
here. Synth presets carry no internal name, so only the filename changes.

Provenance shortcut: the Deluge has no clock, so files it writes carry a
`1969-12-31` FAT timestamp on the card; a real date means a computer wrote it.

## `community-c1.3.0-beta-3f898e9/` — DelugEmu, community beta 1.3.0 (2026-08-29)

Firmware: `deluge-v1_3_0-beta+2026_08_29-3f898e9.bin` from the
`beta` release of SynthstromAudible/DelugeFirmware (commit `3f898e9`; writes
`firmwareVersion="c1.3.0"`). Captured with `.claude/skills/deluge-fixtures/`:
the emulator boots with only that preset on the card, the firmware loads it,
then hold SAVE + SYNTH/KIT, SELECT, SELECT (overwrite). The file is therefore the
beta's own serialisation; the *input* format is irrelevant.

| File | Input the firmware loaded | Covers |
|---|---|---|
| `Default Synth.XML` | nothing — empty `SYNTHS/`, firmware built its default synth (`Song::setupDefault` → `setupAsDefaultSynth`) and saved it as `0.XML` | init synth |
| `FM Modulators Patch Cables.XML` | factory `SYNTHS/091 FM Ricochet.XML` (old nested format, 2018) | FM mode, `<modulator1/2>`, 16 patch cables |
| `Subtractive Many Patch Cables.XML` | factory `SYNTHS/130 Dark Strings.XML` (old format) | subtractive, 20 patch cables (most of any factory preset) |
| `Sample Ranges.XML` | factory `SYNTHS/168 Hang Drum.XML` (old format), samples renamed to `SAMPLES/Fixtures/range-*.wav` | `type="sample"` with sample ranges |
| `Ringmod.XML` | factory `SYNTHS/032 Bandpass Choir.XML` (old format) | ringmod mode |
| `Wavetable DX7.XML` | Tim's `SYNTHS/Tim/WAVE5.XML` (hardware c1.3.0), wavetable renamed to `SAMPLES/Fixtures/wavetable.wav` | `type="wavetable"` + `type="dx7"` with `dx7patch` |
| `Kit Sample Rows.XML` | factory `KITS/012 HR-II.XML` (old format), samples renamed to `SAMPLES/Fixtures/{kick,snare,hat-closed,hat-open,crash}.wav` | `<kit>` with sample drum rows, one row with an empty `fileName` |
| `Gold Knob Reassigned.XML` | `Default Synth.XML` with four gold-knob reassignments written by the editor's `setModKnob` (issue #23): knob 3 → `hpfFrequency`, knob 1 → `volume` ← `lfo2`, knob 11 → `pitch` ← `lfo1` + second source `envelope1`, knob 12 → `noteProbability` | firmware re-save of edited `<modKnobs>` — an unknown string would have come back as the stock assignment; only `notePattern` differs from the input |

The factory inputs are Synthstrom's sound design; only the XML structure is of
interest here and the count is kept small. Sample-based inputs were pointed at
neutrally named copies of their WAVs before capture (see
`docs/fixture-capture.md`), so the paths the firmware wrote carry no library
or artist names. Two things to know when comparing captures:

- `notePattern` under `<arpeggiator>` is a random pattern the firmware
  generates per session, so two captures of the same input differ there.
- This beta orders `<delay>`/`<sidechain>` after `<midiOutput>` and writes
  patch-cable `amount` before `polarity`; the c1.3.0 build that wrote Tim's
  hardware files (below) put `<delay>`/`<sidechain>` before `<defaultParams>`
  and `polarity` first. Same version string, different serialiser — the
  editor must not assume element order from `firmwareVersion`.

## `community-c1.3.0/` — real hardware, community 1.3.0

Tim's own presets, saved on his Deluge and copied from the card
(`SYNTHS/Tim/`, 1969 timestamps). Exact 1.3.0 build unknown (the file only says
`c1.3.0`); saved during August 2026.

| File | Original name on the card | Covers |
|---|---|---|
| `Sine AnalogSaw Patch Cables.XML` | `Tim.XML` | sine + `analogSaw`, 6 patch cables |
| `Kit Row Sound.XML` | `TIM Sn1.XML` | a kit-row sound saved as a synth preset (`polyphonic="auto"`, `12dB` filter) |
| `Wavetable DX7 OscSync Warbler.XML` | `WAVE4.XML` | `wavetable` + `dx7` (`dx7patch`, `oscillatorSync`), `warbler` LFO, 5 cables |

## `official-4.0.1/` — real hardware, official 4.0.1

Two presets from a freely distributed pack on Tim's card, written by official
firmware 4.0.1 (1969 timestamps, `firmwareVersion="4.0.1"`,
`earliestCompatibleFirmware="4.0.0"`). Renamed here for what they exercise;
the files carry no internal name (only kit rows have a `name` attribute).
Originals: `SYNTHS/Famous/KRAF/MODE/BASS.XML` and `LEAD.XML`.

| File | Covers |
|---|---|
| `Attribute Format Baseline.XML` | the 4.x attribute format as written before `hpfMode`/`filterRoute`/`maxVoices` existed, `<compressor>` instead of `<sidechain>`; saw/saw poly, 5 cables |
| `AnalogSaw Patch Cables.XML` | same format, `analogSaw` oscillators, 9 patch cables |

## `official-2.x-old-format/` — factory card, firmware 1.x–2.1.0

Synthstrom's factory presets as shipped on the SD card (2017–2018 file dates,
copied from the card; `<firmwareVersion>2.0.0-beta</firmwareVersion>` or
`<firmwareVersion>2.1.0</firmwareVersion>` as a *sibling* of `<sound>`, or no
version element at all in the oldest files; every value a nested element). This is the old format
the firmware still reads. Three files, Synthstrom's content.

| File | Original name on the card | Covers |
|---|---|---|
| `Nested Subtractive.XML` | `002 Basic Square Bass.XML` | smallest old-format subtractive preset |
| `Nested FM No Version.XML` | `049 Basic FM.XML` | old-format FM with `<modulator1/2>`; March 2017 file with **no** `firmwareVersion` anywhere |
| `Nested Sample Ranges.XML` | `170 Sitar.XML` | old-format multisample (`<sampleRanges>`), written by 2.1.0 |

## `fork-c1.3.0-local-fixes-fbba6b4f/` — DelugEmu, Tim's fork build

**Not stock firmware.** Written by `build/Release/deluge.bin` from
`~/WebstormProjects/DelugeFirmwareTW`, branch `local-fixes` at commit
`fbba6b4f` (2026-08-31), which reports `firmwareVersion="c1.3.0"` like the
community build it tracks. It exists for one feature the community firmware
does not have: **Drum Velocity Layers**
(`SETTINGS/CommunityFeatures.XML`, `drumVelocityLayers="1"`). With it on, a
drum row's ranges are keyed by velocity and the serializer writes
`rangeTopVelocity` where it otherwise writes `rangeTopNote`
(`Sound::writeSourceToFile`, sound.cpp:3618; the reader accepts either name,
sound.cpp:3523).

The editor does not model the feature and never will on this evidence — it is
one fork's, not the format's. The fixture is here so that *passing such a file
through untouched* is tested against a file the firmware really wrote instead
of against our idea of one (`src/core/preset/ranges.test.ts`,
`tests/e2e/ranges.spec.ts`).

| File | Input the firmware loaded | Covers |
|---|---|---|
| `Kit Velocity Layers.XML` | the first two rows of Tim's `KITS/Tim/Virtuosity Drums.XML`, with the sample paths pointed at `SAMPLES/Fixtures/vel-{kick,snare}-N.wav` (12 generated WAVs of distinct lengths, so every zone end differs) | a `<kit>` whose drum rows key their ranges by velocity — 4 layers and 8 layers, `rangeTopVelocity` on all but the last of each |

The input was assembled on the emulator's card as `KITS/Velocity Layers.XML`
and captured with the usual command:

```sh
python3 .claude/skills/deluge-fixtures/emu_fixtures.py \
  --fw ~/WebstormProjects/DelugeFirmwareTW/build/Release/deluge.bin \
  --out tests/fixtures/fork-c1.3.0-local-fixes-fbba6b4f 'kit:KITS/Velocity Layers.XML'
```

Worth knowing about the *input*: the card kits that use velocity layers
(`KITS/Tim/Crocell Kit.XML`, `KITS/Tim/Virtuosity Drums.XML`) were written by
a computer, not by a Deluge — 2026 file dates, single-line `<zone>` elements,
and pre-3.0 nested `<defaultParams>` mixed with attribute-style `<sound>`,
which the firmware's serializer never emits. Only songs the device re-saved
(`SONGS/Tim/Kaunaz 2.XML` and friends, 1969 stamps) carry firmware-written
velocity ranges. Hence the capture: the fixture had to be made, not copied.

## Not covered

- **Official 4.1.x** — no 4.1.x-written file exists on this machine and there
  is no official binary DelugEmu can run. Needs a preset saved on a Deluge
  running 4.1.4 (Tim's is on community firmware).
- **Community 1.2.x release** — DelugEmu ships `deluge-c1_2_1.bin`; add with
  the skill if a 1.2-specific difference ever matters.
