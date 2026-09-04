/**
 * Human names for the strings the file uses. The keys are the firmware's
 * strings (`enums.ts`, `params.ts`); the values are only ever shown, never
 * written. Sentence-case words for the summariser, Title Case for controls,
 * short codes for chips.
 */

import { LOOP_MODE } from './multisample'
import type {
  ArpMode,
  ArpMpeSource,
  ArpNoteMode,
  ArpOctaveMode,
  FilterMode,
  FilterRoute,
  LfoType,
  ModFxType,
  OldArpMode,
  OscType,
  PatchSource,
  Polarity,
  PolyphonyMode,
  SynthMode,
} from './enums'

export const OSC_TYPE_NAMES: Record<OscType, string> = {
  sine: 'Sine',
  triangle: 'Triangle',
  square: 'Square',
  analogSquare: 'Analog Square',
  saw: 'Saw',
  analogSaw: 'Analog Saw',
  wavetable: 'Wavetable',
  sample: 'Sample',
  inLeft: 'Input L',
  inRight: 'Input R',
  inStereo: 'Input Stereo',
  dx7: 'DX7',
}
export const OSC_TYPE_WORDS: Record<OscType, string> = {
  sine: 'sine',
  triangle: 'triangle',
  square: 'square',
  analogSquare: 'analogue square',
  saw: 'saw',
  analogSaw: 'analogue saw',
  wavetable: 'wavetable',
  sample: 'sample',
  inLeft: 'left input',
  inRight: 'right input',
  inStereo: 'stereo input',
  dx7: 'DX7',
}
export const OSC_TYPE_SHORT: Record<OscType, string> = {
  sine: 'SIN',
  triangle: 'TRI',
  square: 'SQR',
  analogSquare: 'ASQ',
  saw: 'SAW',
  analogSaw: 'ASAW',
  wavetable: 'WT',
  sample: 'SMP',
  inLeft: 'IN L',
  inRight: 'IN R',
  inStereo: 'IN',
  dx7: 'DX7',
}

export const LFO_TYPE_NAMES: Record<LfoType, string> = {
  sine: 'Sine',
  triangle: 'Triangle',
  square: 'Square',
  saw: 'Saw',
  sah: 'Sample & Hold',
  rwalk: 'Random Walk',
  warbler: 'Warbler',
}

export const SYNTH_MODE_NAMES: Record<SynthMode, string> = {
  subtractive: 'Subtractive',
  fm: 'FM',
  ringmod: 'Ring Mod',
}

export const POLYPHONY_NAMES: Record<PolyphonyMode, string> = {
  poly: 'Poly',
  mono: 'Mono',
  auto: 'Auto',
  legato: 'Legato',
  choke: 'Choke',
}

export const MOD_FX_NAMES: Record<ModFxType, string> = {
  none: 'None',
  flanger: 'Flanger',
  chorus: 'Chorus',
  StereoChorus: 'Stereo Chorus',
  phaser: 'Phaser',
  grainFX: 'Grain',
  TapeWarble: 'Tape Warble',
  dimension: 'Dimension',
}
export const MOD_FX_WORDS: Record<ModFxType, string> = {
  none: '',
  flanger: 'flanged',
  chorus: 'chorused',
  StereoChorus: 'chorused wide',
  phaser: 'phased',
  grainFX: 'granulated',
  TapeWarble: 'tape-warbled',
  dimension: 'widened',
}

export const FILTER_MODE_NAMES: Record<FilterMode, string> = {
  '12dB': '12 dB Ladder',
  '24dB': '24 dB Ladder',
  '24dBDrive': '24 dB Drive',
  SVF_Band: 'SVF Bandpass',
  SVF_Notch: 'SVF Notch',
  HPLadder: 'HP Ladder',
  Off: 'Off',
}
export const FILTER_MODE_WORDS: Record<FilterMode, string> = {
  '12dB': '12 dB ladder',
  '24dB': '24 dB ladder',
  '24dBDrive': '24 dB drive',
  SVF_Band: 'SVF bandpass',
  SVF_Notch: 'SVF notch',
  HPLadder: 'high-pass ladder',
  Off: 'off',
}
export const FILTER_MODE_SHORT: Record<FilterMode, string> = {
  '12dB': 'LPF12',
  '24dB': 'LPF24',
  '24dBDrive': 'LPF24D',
  SVF_Band: 'SVFB',
  SVF_Notch: 'SVFN',
  HPLadder: 'HPL',
  Off: '—',
}

export const FILTER_ROUTE_NAMES: Record<FilterRoute, string> = {
  H2L: 'HPF → LPF',
  L2H: 'LPF → HPF',
  PARA: 'Parallel',
}

export const PATCH_SOURCE_NAMES: Record<PatchSource, string> = {
  lfo1: 'LFO 1',
  lfo2: 'LFO 2',
  lfo3: 'LFO 3',
  lfo4: 'LFO 4',
  envelope1: 'Env 1',
  envelope2: 'Env 2',
  envelope3: 'Env 3',
  envelope4: 'Env 4',
  velocity: 'Velocity',
  note: 'Note',
  compressor: 'Sidechain',
  random: 'Random',
  aftertouch: 'Aftertouch',
  x: 'MPE X',
  y: 'MPE Y',
}

export const POLARITY_NAMES: Record<Polarity, string> = { bipolar: 'Bipolar', unipolar: 'Unipolar' }

/**
 * The arp's on/off (`arpModeToString`, util/functions.cpp): the menu is a
 * toggle titled "Arp enabled" whose options are `STRING_FOR_OFF` / `STRING_FOR_ON`
 * (gui/menu_item/arpeggiator/mode.h `getOptions`, gui/ui/menus.cpp
 * `arpModeMenu`, l10n/g_english.cpp "Off" / "On"; DelugeFirmware `beta`).
 */
export const ARP_MODE_NAMES: Record<ArpMode, string> = { off: 'Off', arp: 'On' }

export const OLD_ARP_MODE_NAMES: Record<OldArpMode, string> = {
  off: 'Off',
  up: 'Up',
  down: 'Down',
  both: 'Up & Down',
  random: 'Random',
}
export const ARP_NOTE_MODE_NAMES: Record<ArpNoteMode, string> = {
  up: 'Up',
  down: 'Down',
  upDown: 'Up & Down',
  asPlayed: 'As Played',
  random: 'Random',
  walk1: 'Walk 1',
  walk2: 'Walk 2',
  walk3: 'Walk 3',
  pattern: 'Pattern',
}
export const ARP_OCTAVE_MODE_NAMES: Record<ArpOctaveMode, string> = {
  up: 'Up',
  down: 'Down',
  upDown: 'Up & Down',
  alt: 'Alternate',
  random: 'Random',
}
export const ARP_MPE_NAMES: Record<ArpMpeSource, string> = { off: 'Off', y: 'MPE Y', z: 'Aftertouch' }

/** `SampleRepeatMode` (src/definitions_cxx.hpp): CUT, ONCE, LOOP, STRETCH — keyed by `LOOP_MODE`'s stored values. */
export const LOOP_MODE_NAMES: Record<string, string> = {
  [LOOP_MODE.cut]: 'Cut',
  [LOOP_MODE.once]: 'Once',
  [LOOP_MODE.loop]: 'Loop',
  [LOOP_MODE.stretch]: 'Stretch',
}

/** `VoicePriority` (src/definitions_cxx.hpp): LOW, MEDIUM, HIGH. */
export const VOICE_PRIORITY_NAMES: Record<string, string> = { '0': 'Low', '1': 'Medium', '2': 'High' }

/**
 * Labels for parameter names wherever a file refers to one (cable
 * destinations, gold and MIDI knobs) and for `<defaultParams>` attributes.
 * Anything missing falls back to the raw name.
 */
const PARAM_LABELS: Record<string, string> = {
  oscAVolume: 'Osc A Level',
  oscBVolume: 'Osc B Level',
  volume: 'Volume',
  volumePostFX: 'Volume',
  volumePostReverbSend: 'Ducking',
  noiseVolume: 'Noise',
  oscAPhaseWidth: 'Osc A Pulse Width',
  oscBPhaseWidth: 'Osc B Pulse Width',
  oscAPulseWidth: 'Osc A Pulse Width',
  oscBPulseWidth: 'Osc B Pulse Width',
  oscAWavetablePosition: 'Osc A Wave Pos',
  oscBWavetablePosition: 'Osc B Wave Pos',
  lpfFrequency: 'LPF Freq',
  lpfResonance: 'LPF Res',
  lpfMorph: 'LPF Morph',
  hpfFrequency: 'HPF Freq',
  hpfResonance: 'HPF Res',
  hpfMorph: 'HPF Morph',
  pan: 'Pan',
  pitch: 'Pitch',
  oscAPitch: 'Osc A Pitch',
  oscBPitch: 'Osc B Pitch',
  // `<defaultParams>` spells the same four params `…PitchAdjust` (`Sound::writeParamsToFile`
  // writes them only when set). The firmware's own names for them are "Osc1 pitch", "Osc2
  // pitch", "FM mod1 pitch", "FM mod2 pitch" (`STRING_FOR_PARAM_LOCAL_OSC_A_PITCH_ADJUST` …
  // `…MODULATOR_1_PITCH_ADJUST`, `src/deluge/gui/l10n/english.json:62-75`, `beta` e7bae539),
  // under a menu titled "Osc* transpose" (`STRING_FOR_OSC_TRANSPOSE_MENU_TITLE`). The labels
  // keep the editor's A/B and "Mod n" spelling so both spellings of a param read alike.
  oscAPitchAdjust: 'Osc A Pitch',
  oscBPitchAdjust: 'Osc B Pitch',
  modulator1Volume: 'Mod 1 Level',
  modulator2Volume: 'Mod 2 Level',
  modulator1Amount: 'Mod 1 Level',
  modulator2Amount: 'Mod 2 Level',
  modulator1Pitch: 'Mod 1 Pitch',
  modulator2Pitch: 'Mod 2 Pitch',
  mod1PitchAdjust: 'Mod 1 Pitch',
  mod2PitchAdjust: 'Mod 2 Pitch',
  modulator1Feedback: 'Mod 1 Feedback',
  modulator2Feedback: 'Mod 2 Feedback',
  carrier1Feedback: 'Osc A Feedback',
  carrier2Feedback: 'Osc B Feedback',
  lfo1Rate: 'LFO 1 Rate',
  lfo2Rate: 'LFO 2 Rate',
  lfo3Rate: 'LFO 3 Rate',
  lfo4Rate: 'LFO 4 Rate',
  env1Attack: 'Env 1 Attack',
  env1Decay: 'Env 1 Decay',
  env1Sustain: 'Env 1 Sustain',
  env1Release: 'Env 1 Release',
  env2Attack: 'Env 2 Attack',
  env2Decay: 'Env 2 Decay',
  env2Sustain: 'Env 2 Sustain',
  env2Release: 'Env 2 Release',
  env3Attack: 'Env 3 Attack',
  env3Decay: 'Env 3 Decay',
  env3Sustain: 'Env 3 Sustain',
  env3Release: 'Env 3 Release',
  env4Attack: 'Env 4 Attack',
  env4Decay: 'Env 4 Decay',
  env4Sustain: 'Env 4 Sustain',
  env4Release: 'Env 4 Release',
  waveFold: 'Wave Fold',
  delayRate: 'Delay Time',
  delayFeedback: 'Delay Feedback',
  reverbAmount: 'Reverb',
  modFXRate: 'Mod FX Rate',
  modFXDepth: 'Mod FX Depth',
  modFXOffset: 'Mod FX Offset',
  modFXFeedback: 'Mod FX Feedback',
  arpRate: 'Arp Rate',
  arpeggiatorRate: 'Arp Rate',
  arpGate: 'Arp Gate',
  arpeggiatorGate: 'Arp Gate',
  stutterRate: 'Stutter Rate',
  bass: 'Bass',
  treble: 'Treble',
  bassFreq: 'Bass Freq',
  bassFrequency: 'Bass Freq',
  trebleFreq: 'Treble Freq',
  trebleFrequency: 'Treble Freq',
  sampleRateReduction: 'Decimation',
  bitcrushAmount: 'Bitcrush',
  bitCrush: 'Bitcrush',
  compressorShape: 'Sidechain Shape',
  compressorThreshold: 'Comp Threshold',
  portamento: 'Portamento',
  noteProbability: 'Note Probability',
  bassProbability: 'Bass Probability',
  swapProbability: 'Swap Probability',
  glideProbability: 'Glide Probability',
  reverseProbability: 'Reverse Probability',
  chordProbability: 'Chord Probability',
  chordPolyphony: 'Chord Polyphony',
  ratchetProbability: 'Ratchet Probability',
  ratchetAmount: 'Ratchet Amount',
  sequenceLength: 'Sequence Length',
  rhythm: 'Rhythm',
  spreadVelocity: 'Velocity Spread',
  spreadGate: 'Gate Spread',
  spreadOctave: 'Octave Spread',
  sidechainCompressorVolume: 'Ducking',
  sidechainCompressorShape: 'Sidechain Shape',
  pitchAdjust: 'Pitch',
  tempo: 'Tempo',
}

export const paramLabel = (name: string): string => PARAM_LABELS[name] ?? name
