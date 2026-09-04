/**
 * Where the firmware puts each attribute and child element when it writes a
 * file. A loaded file keeps its own order (see `docs/decisions.md`, "State is
 * the file's strings, in the file's order"); these tables only decide where
 * something the editor *adds* goes, so a preset that gains an attribute still
 * diffs cleanly against one the instrument saved.
 *
 * Source: `Sound::writeToFile`, `Sound::writeSourceToFile`,
 * `Sound::writeParamsToFile`, `ModControllableAudio::writeAttributesToFile`
 * / `writeTagsToFile`, `PatchCableSet::writePatchCablesToFile`,
 * `ArpeggiatorSettings::writeCommonParamsToFile`, `Kit::writeDataToFile`
 * (SynthstromAudible/DelugeFirmware upstream/main 3f898e95), confirmed
 * against the `community-c1.3.0-beta-3f898e9` fixtures. Older builds order a
 * few children differently (`tests/fixtures/SOURCES.md`); the reader is a
 * tag loop and does not care.
 */

export const SOUND_ATTR_ORDER = [
  'firmwareVersion',
  'earliestCompatibleFirmware',
  'name',
  'polyphonic',
  'voicePriority',
  'sideChainSend',
  'mode',
  'transpose',
  'modFXType',
  'lpfMode',
  'hpfMode',
  'filterRoute',
  'clippingAmount',
  'path',
  'maxVoices',
] as const

export const SOUND_CHILD_ORDER = [
  'osc1',
  'osc2',
  'lfo1',
  'lfo2',
  'lfo3',
  'lfo4',
  'modulator1',
  'modulator2',
  'unison',
  'defaultParams',
  'arpeggiator',
  'modKnobs',
  'midiOutput',
  'delay',
  'midiKnobs',
  'sidechain',
  'compressor',
  'audioCompressor',
  'stutter',
] as const

export const OSC_ATTR_ORDER = [
  'type',
  'loopMode',
  'reversed',
  'timeStretchEnable',
  'timeStretchAmount',
  'linearInterpolation',
  'transpose',
  'cents',
  'oscillatorSync',
  'retrigPhase',
  'fileName',
  'dx7patch',
  'dx7enginemode',
  'dx7randomdetune',
] as const

/**
 * A sample oscillator carrying the one range the firmware flattens onto it
 * writes `fileName` *before* `transpose` and `cents` (sound.cpp:3595-3631),
 * the opposite way round from every other oscillator type, which writes
 * transpose and cents and has no `fileName` at all (or, for wavetable, writes
 * it after `retrigPhase`). Hence a second table rather than one order for
 * `<osc1>`/`<osc2>`.
 */
export const SAMPLE_OSC_ATTR_ORDER = [
  'type',
  'loopMode',
  'reversed',
  'timeStretchEnable',
  'timeStretchAmount',
  'linearInterpolation',
  'fileName',
  'transpose',
  'cents',
] as const

export const OSC_CHILD_ORDER = ['zone', 'sampleRanges', 'wavetableRanges'] as const

/**
 * A `<sampleRange>`'s attributes, then its `<zone>` child
 * (`Sound::writeSourceToFile`, sound.cpp:3612-3648). `rangeTopNote` is written
 * for every range but the last, `transpose` and `cents` only when non-zero.
 */
export const SAMPLE_RANGE_ATTR_ORDER = ['rangeTopNote', 'fileName', 'transpose', 'cents'] as const

export const LFO_ATTR_ORDER = ['type', 'syncLevel', 'syncType'] as const
/** `Sound::writeSourceToFile` writes the zone's loop points only when set (sound.cpp:3670-3677). */
export const ZONE_ATTR_ORDER = ['startSamplePos', 'endSamplePos', 'startLoopPos', 'endLoopPos'] as const
export const MODULATOR_ATTR_ORDER = ['transpose', 'cents', 'retrigPhase', 'toModulator1'] as const
export const UNISON_ATTR_ORDER = ['num', 'detune', 'spread'] as const
export const PARAMS_CHILD_ORDER = [
  'envelope1',
  'envelope2',
  'envelope3',
  'envelope4',
  'patchCables',
  'equalizer',
] as const
export const ENVELOPE_ATTR_ORDER = ['attack', 'decay', 'sustain', 'release'] as const
export const EQUALIZER_ATTR_ORDER = ['bass', 'treble', 'bassFrequency', 'trebleFrequency'] as const
export const CABLE_ATTR_ORDER = ['source', 'destination', 'polarity', 'amount'] as const
export const MOD_KNOB_ATTR_ORDER = ['controlsParam', 'patchAmountFromSource', 'patchAmountFromSecondSource'] as const
/**
 * `ArpeggiatorSettings::writeCommonParamsToFile` (`src/deluge/modulation/arpeggiator.cpp:1847-1915`,
 * `beta` e7bae539): the official three, then the community attributes through
 * `kitArp`, then the randomizer lock's last-seen value and locked-result array
 * for each of the nine probabilities and spreads, then `notePattern` — a
 * pattern the firmware rolls per session (`generateNewNotePattern`), so it
 * differs between two saves of the same file.
 */
export const ARP_ATTR_ORDER = [
  'mode',
  'syncLevel',
  'numOctaves',
  'syncType',
  'arpMode',
  'chordType',
  'noteMode',
  'octaveMode',
  'mpeVelocity',
  'stepRepeat',
  'randomizerLock',
  'kitArp',
  'lastLockedNoteProb', 'lockedNoteProbArray',
  'lastLockedBassProb', 'lockedBassProbArray',
  'lastLockedSwapProb', 'lockedSwapProbArray',
  'lastLockedGlideProb', 'lockedGlideProbArray',
  'lastLockedReverseProb', 'lockedReverseProbArray',
  'lastLockedChordProb', 'lockedChordProbArray',
  'lastLockedRatchetProb', 'lockedRatchetProbArray',
  'lastLockedVelocitySpread', 'lockedVelocitySpreadArray',
  'lastLockedGateSpread', 'lockedGateSpreadArray',
  'lastLockedOctaveSpread', 'lockedOctaveSpreadArray',
  'notePattern',
] as const
/**
 * The `<arpeggiator>` a MIDI or gate drum row carries. A non-audio drum has
 * no `<defaultParams>`, so `NonAudioDrum::writeArpeggiatorToFile`
 * (`src/deluge/model/drum/non_audio_drum.cpp:87-95`, called from
 * `MIDIDrum::writeToFile` and `GateDrum::writeToFile`) writes the common
 * attributes above and then `ArpeggiatorSettings::writeNonAudioParamsToFile`
 * (`arpeggiator.cpp:1918-1936`): `gate`, `rate` and the probabilities a sound
 * row keeps in `<defaultParams>`, as plain integers.
 */
export const NON_AUDIO_ARP_ATTR_ORDER = [
  ...ARP_ATTR_ORDER,
  'gate',
  'rate',
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
] as const
export const DELAY_ATTR_ORDER = ['pingPong', 'analog', 'syncLevel', 'syncType'] as const
export const SIDECHAIN_ATTR_ORDER = ['attack', 'release', 'syncLevel', 'syncType'] as const
export const AUDIO_COMPRESSOR_ATTR_ORDER = ['attack', 'release', 'thresh', 'ratio', 'compHPF', 'compBlend'] as const
export const STUTTER_ATTR_ORDER = ['quantized', 'reverse', 'pingPong'] as const
export const MIDI_OUTPUT_ATTR_ORDER = ['channel', 'noteForDrum'] as const

export const KIT_ATTR_ORDER = [
  'firmwareVersion',
  'earliestCompatibleFirmware',
  'modFXCurrentParam',
  'currentFilterType',
  'modFXType',
  'lpfMode',
  'hpfMode',
  'filterRoute',
  'clippingAmount',
] as const
export const KIT_CHILD_ORDER = [
  'defaultParams',
  'delay',
  'sidechain',
  'compressor',
  'midiKnobs',
  'audioCompressor',
  'stutter',
  'soundSources',
  'selectedDrumIndex',
] as const
export const KIT_PARAMS_CHILD_ORDER = ['delay', 'lpf', 'hpf', 'equalizer'] as const
/** `<defaultParams><lpf>`/`<hpf>` on a kit (`GlobalEffectable::writeParamTagsToFile`). */
export const KIT_FILTER_ATTR_ORDER = ['frequency', 'resonance'] as const
/** `<defaultParams><delay>` on a kit (same writer). */
export const KIT_DELAY_ATTR_ORDER = ['rate', 'feedback'] as const
