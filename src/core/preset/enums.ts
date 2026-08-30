/**
 * The firmware's string tables, character for character.
 *
 * The Deluge accepts a bad string silently: each `stringTo…` reader falls
 * through to a default (noted per table), so a misspelling here would load
 * as a different setting on the instrument rather than fail. These are typed
 * `as const` so that a misspelling in the editor fails `pnpm check` instead.
 *
 * Source: SynthstromAudible/DelugeFirmware `upstream/main` 3f898e95 (the
 * 2026-08-29 c1.3.0 beta), `src/deluge/util/functions.cpp` unless noted.
 * The official 4.1.4 tables (`synthstrom-official` branch) are the leading
 * subsets; entries the official firmware lacks are gated by
 * `src/core/firmware/features.ts`, not marked here.
 */

/** `oscTypeToString`. Unknown reads as `triangle`. */
export const OSC_TYPES = [
  'sine',
  'triangle',
  'square',
  'analogSquare',
  'saw',
  'analogSaw',
  'wavetable',
  'sample',
  'inLeft',
  'inRight',
  'inStereo',
  'dx7',
] as const
export type OscType = (typeof OSC_TYPES)[number]

/** `lfoTypeToString`. Unknown reads as `triangle`. */
export const LFO_TYPES = ['sine', 'triangle', 'square', 'saw', 'sah', 'rwalk', 'warbler'] as const
export type LfoType = (typeof LFO_TYPES)[number]

/** `synthModeToString`. Unknown reads as `subtractive`. */
export const SYNTH_MODES = ['subtractive', 'fm', 'ringmod'] as const
export type SynthMode = (typeof SYNTH_MODES)[number]

/**
 * `polyphonyModeToString`. Unknown reads as `poly`. The reader also accepts
 * the pre-June-2017 numerals `0` (auto) and `2` (choke); old factory files
 * carry those, and the generator writes them back as found.
 */
export const POLYPHONY_MODES = ['poly', 'mono', 'auto', 'legato', 'choke'] as const
export type PolyphonyMode = (typeof POLYPHONY_MODES)[number]

/** `fxTypeToString`. Unknown reads as `none`. */
export const MOD_FX_TYPES = [
  'none',
  'flanger',
  'chorus',
  'StereoChorus',
  'phaser',
  'grainFX',
  'TapeWarble',
  'dimension',
] as const
export type ModFxType = (typeof MOD_FX_TYPES)[number]

/** `modFXParamToString` — a kit's `modFXCurrentParam`. Unknown reads as `offset`. */
export const MOD_FX_PARAMS = ['depth', 'feedback', 'offset'] as const
export type ModFxParam = (typeof MOD_FX_PARAMS)[number]

/** `filterTypeToString` — a kit's `currentFilterType`. Unknown reads as `lpf`. */
export const FILTER_TYPES = ['lpf', 'hpf', 'eq'] as const
export type FilterType = (typeof FILTER_TYPES)[number]

/**
 * `filterMap` in `src/deluge/model/mod_controllable/filters/filter_config.cpp`,
 * used for both `lpfMode` and `hpfMode`. An `EnumStringMap` lookup of an
 * unknown string yields the last entry: `Off`. HPF modes start at `SVF_Band`.
 */
export const FILTER_MODES = ['12dB', '24dB', '24dBDrive', 'SVF_Band', 'SVF_Notch', 'HPLadder', 'Off'] as const
export type FilterMode = (typeof FILTER_MODES)[number]

/** `routeMap`, same file. Unknown yields the last entry, `H2L`. */
export const FILTER_ROUTES = ['H2L', 'L2H', 'PARA'] as const
export type FilterRoute = (typeof FILTER_ROUTES)[number]

/** `arpModeToString` (`arpeggiator@arpMode`, and `@mode` since 1.1). Unknown reads as `off`. */
export const ARP_MODES = ['off', 'arp'] as const
export type ArpMode = (typeof ARP_MODES)[number]

/** `oldArpModeToString` — what `arpeggiator@mode` held before community 1.1. */
export const OLD_ARP_MODES = ['off', 'up', 'down', 'both', 'random'] as const
export type OldArpMode = (typeof OLD_ARP_MODES)[number]

/** `arpNoteModeToString`. Unknown reads as `up`. */
export const ARP_NOTE_MODES = [
  'up',
  'down',
  'upDown',
  'asPlayed',
  'random',
  'walk1',
  'walk2',
  'walk3',
  'pattern',
] as const
export type ArpNoteMode = (typeof ARP_NOTE_MODES)[number]

/** `arpOctaveModeToString`. Unknown reads as `up`. */
export const ARP_OCTAVE_MODES = ['up', 'down', 'upDown', 'alt', 'random'] as const
export type ArpOctaveMode = (typeof ARP_OCTAVE_MODES)[number]

/** `arpMpeModSourceToString` — `arpeggiator@mpeVelocity`. Unknown reads as `off`. */
export const ARP_MPE_SOURCES = ['off', 'y', 'z'] as const
export type ArpMpeSource = (typeof ARP_MPE_SOURCES)[number]

/**
 * `sourceToString` — patch-cable `source`, mod-knob `patchAmountFromSource`.
 * `lfo1`/`lfo3` are the global LFOs, `lfo2`/`lfo4` the per-voice ones (see
 * `LFO_SCOPE` in `src/core/firmware/features.ts`); the sidechain envelope is
 * written as `compressor`. Unknown reads as `none`.
 */
export const PATCH_SOURCES = [
  'lfo1',
  'lfo2',
  'lfo3',
  'lfo4',
  'envelope1',
  'envelope2',
  'envelope3',
  'envelope4',
  'velocity',
  'note',
  'compressor',
  'random',
  'aftertouch',
  'x',
  'y',
] as const
export type PatchSource = (typeof PATCH_SOURCES)[number]

/** `polarityToString` in `src/deluge/modulation/patch/patch_cable.cpp`. Unknown reads as `bipolar`. */
export const POLARITIES = ['bipolar', 'unipolar'] as const
export type Polarity = (typeof POLARITIES)[number]
