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
or artist names. Things to know when comparing captures:

- `notePattern` under `<arpeggiator>` is a random pattern the firmware
  generates per session, so two captures of the same input differ there.
- The version string does not fix the layout. The fixtures show four
  serialiser layouts, two of them both stamped `c1.3.0`; `firmwareVersion`
  tells none of them apart. `src/core/preset/order.test.ts` spells each
  variance out as a named alternative table and requires every alternative
  to be one some fixture actually uses:
  - **This beta** (`community-c1.3.0-beta-*`, and `community-c1.3.0/Kit Row
    Sound.XML`, which a beta build wrote): `<sound>` children run
    `<defaultParams>`, `<arpeggiator>`, `<midiOutput>`, then `<delay>` and
    `<sidechain>`; a cable's `polarity` comes before its `amount`; the
    arpeggiator's `syncLevel` before `numOctaves`; the sidechain's `attack`/
    `release` before its sync; and in `<defaultParams>` `arpeggiatorGate`
    follows `compressorThreshold`, with the morphs and `waveFold` after it.
    This is the layout `order.ts` writes by.
  - **Tim's hardware c1.3.0 build** (`community-c1.3.0/Sine AnalogSaw Patch
    Cables.XML`, `Wavetable DX7 OscSync Warbler.XML`): `<delay>`/`<sidechain>`
    before `<defaultParams>`; `amount` before `polarity`; the sidechain's
    `syncLevel`/`syncType` before `attack`/`release`; `arpeggiatorGate` first
    in `<defaultParams>`, each morph beside its filter and `waveFold` after
    `modFXFeedback` ("sound children, delay/sidechain before defaultParams",
    "cable, amount before polarity", "sidechain, sync before attack/release",
    "defaultParams, arpeggiatorGate first and morphs beside their filters").
  - **Community 1.2.1** (`community-c1.2.1-release_1_2_1/`): the beta's
    child order without `<midiOutput>` and no `polarity` yet, but the
    arpeggiator's `numOctaves` before `syncLevel`, and `arpeggiatorGate` first
    with the morphs and `waveFold` after `compressorThreshold` ("arpeggiator,
    numOctaves before syncLevel", "defaultParams, arpeggiatorGate first and
    morphs after compressorThreshold").
  - **Official 3.x/4.x** (`official-4.0.1/`): `lpfMode` before `modFXType` on
    `<sound>`; `<delay>`/`<compressor>` before `<defaultParams>`; sidechain
    sync first; `numOctaves` before `syncLevel`; `arpeggiatorGate` first and
    no morphs at all ("sound attrs, lpfMode before modFXType" plus the
    hardware-build alternatives above).

  A loaded file keeps its own order (`tests/roundtrip.test.ts`); the tables
  only decide where an attribute the editor *adds* lands. The editor must not
  infer either order from `firmwareVersion`.

## `community-c1.3.0-beta-6e5f2b2/` — DelugEmu, community beta 1.3.0 (2026-09-04)

Firmware: `deluge-v1_3_0-beta+2026_09_04-6e5f2b2.bin` from the rolling `beta`
release of SynthstromAudible/DelugeFirmware as downloaded on 2026-09-04
(`strings` reports `1.3.0-beta-6e5f2b2`; writes `firmwareVersion="c1.3.0"`).
The 3f898e9 binary above is no longer on this machine and the `beta` release
only ever holds its latest build, hence the second folder. Same capture
process (`.claude/skills/deluge-fixtures/`, `synth:`/`kit:` jobs). This build
serialises exactly as 3f898e9 did: every synth below came back byte-identical
to its input apart from `notePattern` (and, in one case, patch-cable order).

The point of these files is the **enum string tables**: every value here is one
no earlier fixture wrote, so a transcription typo in `src/core/preset/enums.ts`
would otherwise pass every test. The inputs were `Default Synth.XML` with the
enum attributes edited (editing the input is fine — the input is never the
fixture); the firmware loaded them and wrote each string back as it spells it.
One `modFXType`, `lpfMode`, `hpfMode`, `filterRoute` and `polyphonic` fits per
file, so the values are spread across five. `tests/enums.test.ts` and
`src/core/firmware/gates.test.ts` ("says which gated values no firmware-written
file exercises yet") are what these serve.

| File | Values the firmware wrote (all as given in the input) | Also |
|---|---|---|
| `Community Enums.XML` | `polyphonic="legato"`, `modFXType="grainFX"`, `lpfMode="SVF_Band"`, `hpfMode="SVF_Notch"`, `filterRoute="L2H"`, LFOs `sah`/`rwalk`/`saw`/`square`, arp on (`mode="arp"`, `arpMode="arp"`) with `noteMode="down"`, `octaveMode="alt"`, `mpeVelocity="y"` | |
| `Community Enums Input Osc.XML` | `osc1 type="inLeft"`, `osc2 type="inStereo"`, `polyphonic="mono"`, `modFXType="phaser"`, `lpfMode="SVF_Notch"`, `hpfMode="SVF_Band"`, `filterRoute="PARA"`, LFOs `sine`/`saw`/`sah`/`rwalk`, `noteMode="upDown"`, `octaveMode="random"`, `mpeVelocity="z"` | a synth whose oscillators are the audio inputs loads and saves in the emulator with no audio hardware |
| `Community Enums More.XML` | `osc1 type="inRight"`, `osc2 type="analogSquare"`, `polyphonic="choke"` (accepted and written back for a synth), `modFXType="TapeWarble"`, `lpfMode="Off"`, `hpfMode="Off"`, LFOs `square`/`sine`/`warbler`/`sine`, `noteMode="pattern"`, `octaveMode="upDown"` | the firmware **reordered the four patch cables** on save (the two `lpfFrequency` cables moved after the `volume` ones — both filters are `Off`); the editor must not assume cable order survives a Deluge save |
| `Community Enums Dimension.XML` | `osc1 type="analogSquare"`, `modFXType="dimension"`, `lpfMode="24dBDrive"`, `noteMode="asPlayed"`, `octaveMode="down"` | |
| `Community Enums StereoChorus.XML` | `modFXType="StereoChorus"`, `lpfMode="12dB"` with `hpfMode="SVF_Notch"`, `filterRoute="PARA"`, LFOs `warbler`/`sah`/`rwalk`/`saw`, `noteMode="walk1"` | |
| `Kit MIDI CV Rows.XML` | a `<kit>` with one sample row (`KICK`, `Kit Sample Rows.XML`'s first row over `SAMPLES/Fixtures/kick.wav`), one MIDI row `<midiOutput name="CLAP" channel="9" note="39">` and one CV/gate row `<gateOutput name="GATE" channel="2">`; kit-level `modFXCurrentParam="offset"`, `currentFilterType="hpf"`, `modFXType="phaser"`, `lpfMode="SVF_Notch"`, `hpfMode="SVF_Band"`, `filterRoute="L2H"` | the input rows were bare `<midiOutput name channel note />` / `<gateOutput name channel />`; the firmware writes each with a nested `<arpeggiator>` (`MIDIDrum::writeToFile`, `GateDrum::writeToFile` → `NonAudioDrum::writeArpeggiatorToFile`, with `gate`/`rate`/probability attributes the sound rows keep in `<defaultParams>`), so the element is open/close, not self-closing — `src/core/xml/generate.test.ts` "lays out a kit MIDI row" models the childless case only |

## `community-c1.2.1-release_1_2_1/` — DelugEmu, community release 1.2.1

Firmware: `deluge-c1_2_1.bin` as shipped inside DelugEmu
(`~/Library/Application Support/DelugEmu/firmware/`; the launcher calls it
"Deluge community firmware 1.2.1 (Chopin)"; `strings` reports only `c1.2.1`,
which is what it writes as `firmwareVersion`). Tag `release_1_2_1` in
SynthstromAudible/DelugeFirmware is `c23bc2fe`. Captured with the skill's
`init` job: empty `SYNTHS/`, the firmware built its default synth and saved it
as `0.XML`. It pins the 1.2→1.3 line in `src/core/firmware/features.ts` from
the writing side.

| File | Input the firmware loaded | Covers |
|---|---|---|
| `Init Synth.XML` | nothing — the built-in default synth | what 1.2.1 does **not** write: no `<lfo3>`/`<lfo4>`, `<envelope3>`/`<envelope4>`, `lfo3Rate`/`lfo4Rate`, no `polarity` on patch cables, no `<midiOutput>` or `<stutter>` in a synth, no note/bass/swap/glide/reverse/chord probabilities or spreads and no `chordPolyphony` (only `ratchetProbability`, `ratchetAmount`, `sequenceLength`, `rhythm`); an `<arpeggiator>` of just `mode numOctaves syncLevel syncType arpMode noteMode octaveMode mpeVelocity`. Its layout is neither the 3f898e9 beta's nor the hardware c1.3.0 one (`src/core/preset/order.test.ts`, `UNPLACED`) |

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

## `official-3.1.1/` — real hardware, official 3.1.1

One preset from a third-party pack on Tim's card (`SYNTHS/Muted IO/Dream.XML`,
1969 timestamp, `firmwareVersion="3.1.1"`,
`earliestCompatibleFirmware="3.1.0-beta"`). It is the only pre-3.2 attribute-
format file on this machine and is here for one idiom: before 3.2 a cable's
depth was itself patched with `destination="range"`, paired with
`rangeAdjustable="1"` on the cable it deepens. `src/core/preset/summary.test.ts`
("a pre-3.2 range destination") describes that shape from this file;
`tests/enums.test.ts` allows `range` for this folder only. The pack is another
sound designer's content; Tim confirmed on 2026-09-04 that this one file may be
redistributed here.

| File | Original name on the card | Covers |
|---|---|---|
| `Range Destination.XML` | `Muted IO/Dream.XML` | 3.1.1 attribute format: `<compressor>` not `<sidechain>`, no `hpfMode`/`filterRoute`, `lfo1 → range` cable + `rangeAdjustable="1"` on `lfo1 → pitch`, `analogSaw`, 5 unison |

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

## `settings/` — real hardware, community 1.3.0 (card `SETTINGS/`)

Not presets: the two files a Deluge writes into `SETTINGS/` that
`src/core/midi/followsettings.ts` reads. Copied from Tim's card backup
(`~/Documents/Music/Deluge/TimCardBU/SETTINGS/`, backup folder dated
2026-08-27; both files carry the 1969 stamp). `MIDIDevices.XML` says
`firmwareVersion="c1.3.0"`; `MIDIFollow.XML` (`<defaults>`, written by
`MidiFollow::writeDefaultsToFile`) carries no version at all, and was saved by
the same c1.3.0 build during the same session. Both sweeps
(`tests/roundtrip.test.ts`, `tests/enums.test.ts`) skip this folder — the
editor does not write settings files.

| File | Covers |
|---|---|
| `MIDIFollow.XML` | the full `<cc_mappings>` table (every follow CC the firmware maps), follow channel A on the MPE lower zone (`<channel>17</channel>`) pinned to `<device port="upstreamUSB2" />`, B/C unassigned (`256`), feedback, kit root note, display settings |
| `MIDIDevices.XML` | `<midiDevices>` with `upstreamUSBDevice2` (port 2): MPE lower and upper zones on both input and output with `numMemberChannels="7"`, `sendClock="1"` |

## Not covered

- **Official 4.1.x** — no 4.1.x-written file exists on this machine and there
  is no official binary DelugEmu can run. Needs a preset saved on a Deluge
  running 4.1.4 (Tim's is on community firmware).
- **Community 1.0.x–1.2.0, and 1.2.1 beyond the init synth** — 1.2.1 is
  covered by one `init` capture above; DelugEmu ships no other release binary,
  and the GitHub `beta` release only ever holds its latest build.
