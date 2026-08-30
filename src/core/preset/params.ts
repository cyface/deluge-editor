/**
 * Parameter names as they appear in files.
 *
 * Two different name sets exist. `paramNameForFileConst` in
 * `src/deluge/modulation/params/param.cpp` (upstream/main 3f898e95) names a
 * parameter wherever a file *refers* to one: a patch cable's `destination`,
 * a mod knob's or MIDI knob's `controlsParam`. The `<defaultParams>` attribute
 * names are separate literals in the writer (`Sound::writeParamsToFile`,
 * `ModControllableAudio::writeParamAttributesToFile`,
 * `GlobalEffectable::writeParamAttributesToFile`) and differ for several
 * parameters: `oscAPulseWidth` there is `oscAPhaseWidth` here, `bitCrush` is
 * `bitcrushAmount`, `arpeggiatorRate` is `arpRate`. Both sets are kept
 * verbatim; do not "fix" one to match the other.
 */

/** Patched, per-voice (`LOCAL_*`). Cable destinations and mod-knob targets. */
export const PATCHED_LOCAL_PARAMS = [
  'oscAVolume',
  'oscBVolume',
  'volume',
  'noiseVolume',
  'oscAPhaseWidth',
  'oscBPhaseWidth',
  'oscAWavetablePosition',
  'oscBWavetablePosition',
  'lpfResonance',
  'hpfResonance',
  'pan',
  'modulator1Volume',
  'modulator2Volume',
  'lpfFrequency',
  'lpfMorph',
  'hpfMorph',
  'pitch',
  'oscAPitch',
  'oscBPitch',
  'modulator1Pitch',
  'modulator2Pitch',
  'hpfFrequency',
  'lfo2Rate',
  'lfo4Rate',
  'env1Attack',
  'env2Attack',
  'env3Attack',
  'env4Attack',
  'env1Decay',
  'env2Decay',
  'env3Decay',
  'env4Decay',
  'env1Sustain',
  'env2Sustain',
  'env3Sustain',
  'env4Sustain',
  'env1Release',
  'env2Release',
  'env3Release',
  'env4Release',
  'modulator1Feedback',
  'modulator2Feedback',
  'carrier1Feedback',
  'carrier2Feedback',
  'waveFold',
] as const

/** Patched, per-sound (`GLOBAL_*`). */
export const PATCHED_GLOBAL_PARAMS = [
  'lfo1Rate',
  'lfo3Rate',
  'volumePostFX',
  'volumePostReverbSend',
  'delayRate',
  'delayFeedback',
  'reverbAmount',
  'modFXRate',
  'modFXDepth',
  'arpRate',
] as const

/** Unpatched, shared by sounds and kits/global effects. */
export const UNPATCHED_SHARED_PARAMS = [
  'stutterRate',
  'bass',
  'treble',
  'bassFreq',
  'trebleFreq',
  'sampleRateReduction',
  'bitcrushAmount',
  'modFXOffset',
  'modFXFeedback',
  'compressorShape',
  'compressorThreshold',
  'arpGate',
  'noteProbability',
  'bassProbability',
  'swapProbability',
  'glideProbability',
  'reverseProbability',
  'chordPolyphony',
  'chordProbability',
  'ratchetProbability',
  'ratchetAmount',
  'sequenceLength',
  'rhythm',
  'spreadGate',
  'spreadOctave',
  'spreadVelocity',
] as const

/** Unpatched, sounds only (`Kind::UNPATCHED_SOUND`). */
export const UNPATCHED_SOUND_PARAMS = ['portamento'] as const

/**
 * Unpatched, kits and global effects only (`Kind::UNPATCHED_GLOBAL`).
 * `volume`/`pitchAdjust` become `volumePostFX`/`pitch` in the MIDI-follow
 * file, so both spellings are names.
 */
export const UNPATCHED_GLOBAL_PARAMS = [
  'modFXRate',
  'modFXDepth',
  'delayRate',
  'delayFeedback',
  'arpRate',
  'pan',
  'lpfFrequency',
  'lpfResonance',
  'lpfMorph',
  'hpfFrequency',
  'hpfMorph',
  'hpfResonance',
  'reverbAmount',
  'volume',
  'volumePostFX',
  'sidechainCompressorVolume',
  'pitchAdjust',
  'pitch',
] as const

/** Any name a file may use to refer to a parameter. */
export type ParamName =
  | (typeof PATCHED_LOCAL_PARAMS)[number]
  | (typeof PATCHED_GLOBAL_PARAMS)[number]
  | (typeof UNPATCHED_SHARED_PARAMS)[number]
  | (typeof UNPATCHED_SOUND_PARAMS)[number]
  | (typeof UNPATCHED_GLOBAL_PARAMS)[number]

export const PARAM_NAMES: readonly ParamName[] = [
  ...new Set<ParamName>([
    ...PATCHED_LOCAL_PARAMS,
    ...PATCHED_GLOBAL_PARAMS,
    ...UNPATCHED_SHARED_PARAMS,
    ...UNPATCHED_SOUND_PARAMS,
    ...UNPATCHED_GLOBAL_PARAMS,
  ]),
]

/**
 * `<sound><defaultParams>` attributes, in the order `Sound::writeParamsToFile`
 * and `ModControllableAudio::writeParamAttributesToFile` write them. The
 * `…PitchAdjust` five are written only when set.
 */
export const SOUND_PARAM_ATTRS = [
  'portamento',
  'compressorShape',
  'oscAVolume',
  'oscAPulseWidth',
  'oscAWavetablePosition',
  'oscBVolume',
  'oscBPulseWidth',
  'oscBWavetablePosition',
  'noiseVolume',
  'volume',
  'pan',
  'lpfFrequency',
  'lpfResonance',
  'hpfFrequency',
  'hpfResonance',
  'lfo1Rate',
  'lfo2Rate',
  'lfo3Rate',
  'lfo4Rate',
  'modulator1Amount',
  'modulator1Feedback',
  'modulator2Amount',
  'modulator2Feedback',
  'carrier1Feedback',
  'carrier2Feedback',
  'pitchAdjust',
  'oscAPitchAdjust',
  'oscBPitchAdjust',
  'mod1PitchAdjust',
  'mod2PitchAdjust',
  'modFXRate',
  'modFXDepth',
  'delayRate',
  'delayFeedback',
  'reverbAmount',
  'arpeggiatorRate',
  'stutterRate',
  'sampleRateReduction',
  'bitCrush',
  'modFXOffset',
  'modFXFeedback',
  'compressorThreshold',
  'arpeggiatorGate',
  'noteProbability',
  'bassProbability',
  'swapProbability',
  'glideProbability',
  'reverseProbability',
  'chordProbability',
  'ratchetProbability',
  'ratchetAmount',
  'sequenceLength',
  'chordPolyphony',
  'rhythm',
  'spreadVelocity',
  'spreadGate',
  'spreadOctave',
  'lpfMorph',
  'hpfMorph',
  'waveFold',
] as const
export type SoundParamAttr = (typeof SOUND_PARAM_ATTRS)[number]

/**
 * `<kit><defaultParams>` attributes, in the order
 * `GlobalEffectable::writeParamAttributesToFile` writes them. `pitchAdjust`
 * and `sidechainCompressorVolume` only when set.
 */
export const KIT_PARAM_ATTRS = [
  'reverbAmount',
  'volume',
  'pan',
  'pitchAdjust',
  'sidechainCompressorVolume',
  'sidechainCompressorShape',
  'modFXDepth',
  'modFXRate',
  'stutterRate',
  'sampleRateReduction',
  'bitCrush',
  'modFXOffset',
  'modFXFeedback',
  'compressorThreshold',
  'arpeggiatorGate',
  'noteProbability',
  'bassProbability',
  'swapProbability',
  'glideProbability',
  'reverseProbability',
  'chordProbability',
  'ratchetProbability',
  'ratchetAmount',
  'sequenceLength',
  'chordPolyphony',
  'rhythm',
  'spreadVelocity',
  'spreadGate',
  'spreadOctave',
  'lpfMorph',
  'hpfMorph',
  'tempo',
  'arpeggiatorRate',
] as const
export type KitParamAttr = (typeof KIT_PARAM_ATTRS)[number]
