import { atLeast, parseVersion, type FirmwareVersion } from './version'

/**
 * Minimum firmware per lineage that supports a feature. A lineage that is
 * absent does not support the feature at all.
 *
 * EVERY ENTRY CITES ITS SOURCE. The Deluge accepts XML it doesn't understand
 * without complaint and silently does something else, so a wrong minimum here
 * puts a control in the UI that produces a broken preset. If you can't point at
 * the firmware commit, string table, or release note, don't add the entry.
 */
export interface FeatureSupport {
  official?: string
  community?: string
  /** Where the minimums come from: a firmware path, commit, or release note. */
  source: string
}

/**
 * The feature table. Keys are stable identifiers used by the UI.
 *
 * How this was built (2026-08-30): the XML writers of the official source drop
 * (SynthstromAudible/DelugeFirmware branch `synthstrom-official`, 695b22af,
 * whose `storagemanager.cpp` writes `firmwareVersion="4.1.4-alpha"`) were
 * diffed against the same writers on `upstream/main` 3f898e95 (the 2026-08-29 beta
 * release, which writes `firmwareVersion="c1.3.0"`): `Sound::writeToFile`,
 * `Sound::writeParamsToFile`, `Sound::writeSourceToFile`,
 * `ModControllableAudio::write{Attributes,Tags,ParamAttributes,ParamTags}ToFile`,
 * `PatchCableSet::writePatchCablesToFile`, `ArpeggiatorSettings::writeCommonParamsToFile`,
 * plus the enum string tables in `src/deluge/util/functions.cpp`,
 * `model/mod_controllable/filters/filter_config.cpp` and `modulation/patch/patch_cable.cpp`.
 * Everything the official 4.1.4 serialiser already wrote is the ungated baseline
 * and has no entry here; nothing below exists on any official build.
 *
 * Each addition was dated with `git log -S'"<xml name>"'` and its minimum is the
 * first community release tag (`release_1_0`, `release_1_1_0`, `release_1_2_0`,
 * all with `VERSION 1.x.0` in CMakeLists.txt) whose serialiser sources actually
 * contain the name (`git grep` at the tag — ancestry alone misses cherry-picks
 * onto release branches, which is how `maxVoices` shipped in 1.1.0), and it was
 * confirmed absent at the previous release tag. Nothing after `release_1_2_1`
 * has a release tag yet: `main` has carried
 * `VERSION 1.3.0` since 53e4d3a7 (2024-09-29), so every nightly/beta build since
 * then writes `c1.3.0`, and the 1.3.0 features below landed across 2024-11 to
 * 2025-07. A preset stamped `c1.3.0` by an early nightly may therefore predate
 * some of them; there is no way to tell from the version string alone.
 *
 * Commit hashes are on `SynthstromAudible/DelugeFirmware`; `#n` is the PR.
 */
export const FEATURES = {
  // ---- community 1.0.0 (release_1_0) -------------------------------------

  /** `<sound hpfMode="HPLadder|SVF_Band|SVF_Notch">`: the HPF got selectable modes. */
  hpfMode: {
    community: 'c1.0.0',
    source:
      '04faf186 #336 "Morphable and Driveable and Parallel filters" added hpfMode to ' +
      'ModControllableAudio::writeAttributesToFile; strings in ' +
      'src/deluge/model/mod_controllable/filters/filter_config.cpp (filterMap), HPF modes ' +
      'start at kFirstHPFMode = SVF_BAND (filter_config.h). SVF_Notch: 086fca6f #339.',
  },
  /** `lpfMode="SVF_Band|SVF_Notch"` for the LPF (official has only 12dB/24dB/24dBDrive). */
  svfFilterModes: {
    community: 'c1.0.0',
    source:
      '04faf186 #336 (SVF_Band), 086fca6f #339 "SVF Notch filter"; filterMap in ' +
      'src/deluge/model/mod_controllable/filters/filter_config.cpp. Official ' +
      'lpfTypeToString (src/functions.cpp on branch synthstrom-official) knows 12dB/24dB/24dBDrive only.',
  },
  /** `<sound filterRoute="L2H|H2L|PARA">`: filter order / parallel routing. */
  filterRoute: {
    community: 'c1.0.0',
    source:
      '04faf186 #336; routeMap in src/deluge/model/mod_controllable/filters/filter_config.cpp; ' +
      'written by ModControllableAudio::writeAttributesToFile.',
  },
  /** `<defaultParams lpfMorph hpfMorph>`: patchable filter morph (drive / SVF mode blend). */
  filterMorph: {
    community: 'c1.0.0',
    source:
      '04faf186 #336 added LOCAL_LPF_MORPH/LOCAL_HPF_MORPH; written in Sound::writeParamsToFile ' +
      '(src/deluge/processing/sound/sound.cpp) under "Community Firmware parameters".',
  },
  /** `<defaultParams waveFold>`: patchable wavefolder. */
  waveFold: {
    community: 'c1.0.0',
    source:
      '5316813d #349 "Patchable wavefolding distortion" (params::LOCAL_FOLD); ' +
      'Sound::writeParamsToFile writes "waveFold".',
  },
  /** `<unison spread>`: unison stereo spread. */
  unisonSpread: {
    community: 'c1.0.0',
    source: 'd6e741e4 #223 "sound: unison stereo spread"; Sound::writeToFile writes <unison spread>.',
  },
  /**
   * `syncType` attribute (even / triplet / dotted) next to every `syncLevel`:
   * `<lfo1>`, `<delay>`, `<compressor>`/`<sidechain>`, `<arpeggiator>`.
   */
  syncType: {
    community: 'c1.0.0',
    source:
      '9c9c85bb 2023-06-18 "groundwork for new sync types" (pre-restructure); ' +
      'Serializer::writeSyncTypeToFile in src/deluge/storage/storage_manager.h; present at release_1_0.',
  },
  /** LFO shapes `sah` (sample & hold) and `rwalk` (random walk). */
  lfoTypesSahRwalk: {
    community: 'c1.0.0',
    source:
      'lfoTypeToString in src/deluge/util/functions.cpp at release_1_0 (lines 1228/1231) returns ' +
      '"sah"/"rwalk"; official lfoTypeToString has square/saw/sine/triangle only.',
  },
  /** `modFXType="StereoChorus"`. */
  modFxStereoChorus: {
    community: 'c1.0.0',
    source: '470d9518 "Stereo Chorus"; fxTypeToString in src/deluge/util/functions.cpp at release_1_0 line 1336.',
  },
  /** `modFXType="grainFX"`. */
  modFxGrain: {
    community: 'c1.0.0',
    source: '246804ae #363 "Grain FX"; fxTypeToString in src/deluge/util/functions.cpp at release_1_0 line 1338.',
  },

  // ---- community 1.1.0 (release_1_1_0) -----------------------------------

  /**
   * The sidechain block is written as `<sidechain>` instead of official's
   * `<compressor>`. The community reader accepts both names; official firmware
   * only knows `<compressor>`.
   */
  sidechainTag: {
    community: 'c1.1.0',
    source:
      'c6a0d619 #1163 "Move compressor into global effectable"; ' +
      'ModControllableAudio::writeTagsToFile ("renamed from compressor") and the reader at ' +
      'src/deluge/model/mod_controllable/mod_controllable_audio.cpp accepting "compressor" || "sidechain".',
  },
  /**
   * Per-sound audio compressor: `<audioCompressor attack release thresh ratio compHPF>`
   * plus `<defaultParams compressorThreshold>`.
   */
  audioCompressor: {
    community: 'c1.1.0',
    source:
      'c6a0d619 #1163 (element) and 8120dc0e #1173 "Per clip compressors" ' +
      '(params::UNPATCHED_COMPRESSOR_THRESHOLD); both in ModControllableAudio, ' +
      'src/deluge/model/mod_controllable/mod_controllable_audio.cpp.',
  },
  /**
   * Arpeggiator rewrite: `arpMode="arp|off"`, `noteMode="up|down|upDown|asPlayed|random"`,
   * `octaveMode="up|down|upDown|alt|random"`, `ratchetProbability`, `ratchetAmount`,
   * `sequenceLength`. The old `mode` attribute is still written for older readers.
   */
  arpModes: {
    community: 'c1.1.0',
    source:
      '019f9fd3 #1198 "Arpeggiator improvements"; ArpeggiatorSettings::writeCommonParamsToFile ' +
      '(src/deluge/modulation/arpeggiator.cpp), arpModeToString / arpNoteModeToString / ' +
      'arpOctaveModeToString in src/deluge/util/functions.cpp (present at release_1_1_0).',
  },
  /** `<defaultParams rhythm>`: arpeggiator rhythm pattern. */
  arpRhythm: {
    community: 'c1.1.0',
    source: '88a90a0f #1378 "Implement Rhythm option for arpeggiator" (params::UNPATCHED_ARP_RHYTHM).',
  },
  /** `<arpeggiator mpeVelocity="off|y|z">`: MPE Y / aftertouch mapped to arp velocity. */
  arpMpeVelocity: {
    community: 'c1.1.0',
    source:
      '276c5f88 2024-02-25 "Add setting to map MPE Aftertouch or Y, to velocity when doing arps"; ' +
      'arpMpeModSourceToString in src/deluge/util/functions.cpp.',
  },
  /** `<sound maxVoices>`: per-preset polyphony limit. */
  maxVoices: {
    community: 'c1.1.0',
    source:
      '292ba646 #1824 "Feature/configure max voices" on main, cherry-picked to release/1.1 as 812c8aeb; ' +
      'Sound::writeToFile writes maxVoices at release_1_1_0 (sound.cpp line 3907), absent at release_1_0_1.',
  },
  /**
   * MIDI Follow Mode with feedback: a designated channel whose CCs address the
   * active context's sound, and CCs sent back out when values change there.
   * Not preset content — this gates the Follow button, not a control.
   */
  midiFollow: {
    community: 'c1.1.0',
    source:
      'src/deluge/io/midi/midi_follow.cpp first exists at release_1_1_0 (release_1_0_1 has no such file ' +
      'and no midiFollow reference anywhere in src/), already with ' +
      'sendCCForMidiFollowFeedback; website/src/content/docs/features/midi_follow_mode.mdx is badged ' +
      '"c1.1 Feature". No official build has the file at all (branch synthstrom-official).',
  },

  // ---- community 1.2.0 (release_1_2_0) -----------------------------------

  /** `<osc type="dx7" dx7patch="…" dx7enginemode dx7randomdetune>`. */
  dx7: {
    community: 'c1.2.0',
    source:
      '7ba88a99 #1114 "feature: DX7 synth"; oscTypeToString "dx7" in src/deluge/util/functions.cpp, ' +
      'Sound::writeSourceToFile writes dx7patch (156 hex bytes), dx7enginemode, dx7randomdetune.',
  },
  /** `<lfo2 syncLevel syncType>`: the per-voice LFO can sync to tempo. */
  lfo2Sync: {
    community: 'c1.2.0',
    source:
      '8ab5f9e4 #2005 "LFO: sync support for LFO2"; Sound::writeToFile lfo2 block writes syncLevel ' +
      'and syncType at release_1_2_0 but not release_1_1_1.',
  },
  /** `<audioCompressor compBlend>`: parallel (dry/wet) compression. */
  compressorBlend: {
    community: 'c1.2.0',
    source: 'e6f826a3 #1979 "Feature/parallel compression"; ModControllableAudio::writeTagsToFile writes compBlend.',
  },

  // ---- community 1.3.0 (main since 53e4d3a7; beta 2026-08-29 writes c1.3.0) --

  /** `<envelope3>` and patch source `envelope3`. */
  env3: {
    community: 'c1.3.0',
    source:
      '44d8e601 #3332 "LFO 3 & 4" (2025-02-08, after release_1_2_1); Sound::writeParamsToFile writes ' +
      '<envelope3>, sourceToString(PatchSource::ENVELOPE_2) = "envelope3".',
  },
  /** `<envelope4>` and patch source `envelope4`. */
  env4: {
    community: 'c1.3.0',
    source:
      '44d8e601 #3332 "LFO 3 & 4"; Sound::writeParamsToFile writes <envelope4>, ' +
      'sourceToString(PatchSource::ENVELOPE_3) = "envelope4".',
  },
  /** `<lfo3 type syncLevel syncType>`, `<defaultParams lfo3Rate>`, patch source `lfo3` (global). */
  lfo3: {
    community: 'c1.3.0',
    source:
      '44d8e601 #3332 "LFO 3 & 4"; Sound::writeToFile writes <lfo3> from lfoConfig[LFO3_ID], ' +
      'params::GLOBAL_LFO_FREQ_2 written as "lfo3Rate", sourceToString(LFO_GLOBAL_2) = "lfo3".',
  },
  /** `<lfo4 type syncLevel syncType>`, `<defaultParams lfo4Rate>`, patch source `lfo4` (per voice). */
  lfo4: {
    community: 'c1.3.0',
    source:
      '44d8e601 #3332 "LFO 3 & 4"; Sound::writeToFile writes <lfo4> from lfoConfig[LFO4_ID], ' +
      'params::LOCAL_LFO_LOCAL_FREQ_2 written as "lfo4Rate", sourceToString(LFO_LOCAL_2) = "lfo4".',
  },
  /** `<patchCable polarity="bipolar|unipolar">`. */
  patchCablePolarity: {
    community: 'c1.3.0',
    source:
      '4fdb26d7 #3872 "Feature/unipolar modulators" (2025-07-02); PatchCableSet::writePatchCablesToFile, ' +
      'polarityToString in src/deluge/modulation/patch/patch_cable.cpp.',
  },
  /** `<midiOutput channel noteForDrum>` on synth presets (official writes it for MIDI drums only). */
  midiOutput: {
    community: 'c1.3.0',
    source:
      '3b718c0f #3313 (2025-02-01) "make synths and sounddrums also send midi"; moved into ' +
      'Sound::writeToFile. On synthstrom-official only src/MIDIDrum.cpp writes <midiOutput>.',
  },
  /** `<stutter quantized reverse pingPong>`. */
  stutterConfig: {
    community: 'c1.3.0',
    source:
      '9a577713 #3226 (2025-01-19) "Stutter as individual settings menu"; ' +
      'ModControllableAudio::writeTagsToFile writes <stutter>.',
  },
  /** `modFXType="TapeWarble"` and LFO shape `warbler`. */
  modFxWarble: {
    community: 'c1.3.0',
    source:
      '50080034 #2712 "Feature/warble" (2024-09-27, not in release_1_2_x); fxTypeToString "TapeWarble" ' +
      'and lfoTypeToString "warbler" in src/deluge/util/functions.cpp.',
  },
  /** `modFXType="dimension"`. */
  modFxDimension: {
    community: 'c1.3.0',
    source: 'a8245028 #3572 (2025-04-08) "Load and save Dimension FX selection"; fxTypeToString "dimension".',
  },
  /** `<arpeggiator chordType>`: chord type for kit-row arps. */
  arpChordType: {
    community: 'c1.3.0',
    source: '62fc344d (2024-12-05) "Arpeggiator Chord Type for Kit Rows"; ArpeggiatorSettings::writeCommonParamsToFile.',
  },
  /**
   * Arpeggiator 3.0: `<defaultParams noteProbability bassProbability chordProbability
   * chordPolyphony>`, `<arpeggiator stepRepeat randomizerLock lastLocked*Prob locked*ProbArray …>`.
   */
  arp3: {
    community: 'c1.3.0',
    source:
      '4ca5ba78 #3079 "Arpeggiator 3.0" (2025-01-04) and 220259cd #2978 "Note probability" (2024-11-25); ' +
      'ModControllableAudio::writeParamAttributesToFile and ArpeggiatorSettings::writeCommonParamsToFile.',
  },
  /** `<defaultParams spreadVelocity spreadGate spreadOctave>` and their locked arrays. */
  arpSpread: {
    community: 'c1.3.0',
    source: '3c3dc579 #2990 "Arpeggiator Spread (Lock, Velocity, Gate, Octave)" (2024-12-06).',
  },
  /** `noteMode="walk1|walk2|walk3|pattern"` and `<arpeggiator notePattern>` (random per session). */
  arpWalkPattern: {
    community: 'c1.3.0',
    source: '147ba6c9 #3285 "Arpeggiator new Walk & Pattern note mode" (2025-01-25); arpNoteModeToString.',
  },
  /** `<defaultParams reverseProbability glideProbability swapProbability>` and their locked arrays. */
  arpReverseGlideSwap: {
    community: 'c1.3.0',
    source:
      'a495e10e "Reverse probability" (2025-02-15), 54792979 "Glide probability" (2025-06-21), ' +
      'e3233a56 "Rename STEP PROBABILITY to SWAP PROBABILITY" (2025-07-05).',
  },
  /**
   * The smSysex JSON-over-SysEx protocol for card access (`session`, `open`,
   * `read`, `write`, `dir`, …). Not preset content — this gates the card
   * panel's honesty note, not a control.
   */
  smSysex: {
    community: 'c1.3.0',
    source:
      '7759705a #2853 "Add SysEx protocol for file browsing and transfer between the Deluge & the ' +
      "'vuefinder' web application\" (2024-11-11), src/deluge/storage/smsysex.cpp; after release_1_2_1, " +
      'so community 1.3.0 only. Inbound SysEx spanning USB transfers also only works from the 1.3.0 fixes (#4633).',
  },
  /** `<arpeggiator kitArp>`: include this row in the kit-level arpeggiator. */
  kitArp: {
    community: 'c1.3.0',
    source: 'b207ba85 #3388 "Feature / Kit Arpeggiator" (2025-03-02); ArpeggiatorSettings::writeCommonParamsToFile.',
  },
  /**
   * Live Edit: the smSysex ops that make the device's in-RAM instrument the
   * editor's document (`inst`, `save`, `load`, `select`, `param`, `sub`;
   * `docs/live-edit.md`). Not preset content — this gates the Live button's
   * presence, and only its presence: the ops exist so far on Tim's fork, not
   * on any stock build, and a fork build writes the same `c1.3.0` as stock,
   * so the version cannot tell them apart. The session grant's `live` field
   * is the gate that actually switches the mode on (`card.liveVersion`); a
   * firmware without the ops, or with its **Sysex Live Edit** toggle off,
   * grants no `live` and the button says so.
   */
  liveEdit: {
    community: 'c1.3.0',
    source:
      'cyface/DelugeFirmware branch feature/live-edit-sysex, 338963b2 "Add live-edit ops to the smSysex ' +
      'protocol" (2026-09-05) and 4bd820a9 (unknown-name fix), src/deluge/storage/smsysex_live.cpp; ' +
      'smsysex.cpp writes "live" into the ^session grant while the toggle is on. CMakeLists VERSION 1.3.0, ' +
      'so the build writes c1.3.0. Not on upstream beta or any release tag.',
  },
} as const satisfies Record<string, FeatureSupport>

export type Feature = keyof typeof FEATURES

/**
 * Which LFOs run once per sound (`global`, tempo-syncable, the `GLOBAL_LFO_FREQ_*`
 * params) and which run per voice (`voice`, the `LOCAL_LFO_LOCAL_FREQ_*` params).
 * Source: `enum LFO_ID` in src/definitions_cxx.hpp ("LFO 1 (global)", "LFO 2 (local)",
 * "LFO 3 (global)", "LFO 4 (local)") and sourceToString in src/deluge/util/functions.cpp
 * (LFO_GLOBAL_1 → "lfo1", LFO_LOCAL_1 → "lfo2", LFO_GLOBAL_2 → "lfo3", LFO_LOCAL_2 → "lfo4").
 * Official 4.1.4 has the same split for lfo1/lfo2 (PATCH_SOURCE_LFO_GLOBAL / LFO_LOCAL).
 */
export const LFO_SCOPE = {
  lfo1: 'global',
  lfo2: 'voice',
  lfo3: 'global',
  lfo4: 'voice',
} as const satisfies Record<string, 'global' | 'voice'>

/** The table widened for lookup by an arbitrary string, so an unknown feature reads as absent. */
const FEATURE_TABLE: Readonly<Record<string, FeatureSupport | undefined>> = FEATURES

/** Does `version` support `feature`? Unknown features are unsupported, never an error. */
export function supports(version: FirmwareVersion, feature: string): boolean {
  const f = FEATURE_TABLE[feature]
  if (!f) return false
  const min = f[version.lineage]
  return min !== undefined && atLeast(version, parseVersion(min))
}
