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
 * `ArpeggiatorSettings::writeCommonParamsToFile`, `Kit::writeToFile`
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

export const LFO_ATTR_ORDER = ['type', 'syncLevel', 'syncType'] as const
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
