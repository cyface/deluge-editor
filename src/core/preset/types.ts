/**
 * Typed views over the XML tree (`src/core/xml/element.ts`): which
 * attributes and child elements each tag carries, named after what the
 * firmware writes. The tree itself is untyped and keeps everything; these
 * shapes let the UI bind to `child(sound, 'osc1')?.attrs.type` and get an
 * `OscType | undefined` without a cast.
 *
 * Every attribute is optional: the firmware omits many when they are at their
 * default (`transpose`, `oscillatorSync`, `clippingAmount`, `sideChainSend`,
 * …), older firmware never wrote the newer ones, and `mode="fm"` sounds have
 * no oscillator `type` at all. An absent attribute means "the firmware's
 * default", which the UI decides how to show. Values are the file's strings —
 * see `element.ts` — so `Int` and `Flag` here are documentation, not
 * conversions.
 *
 * Source for every shape: the `writeToFile` functions listed in
 * `src/core/preset/params.ts` and `Sound::writeToFile` /
 * `Sound::writeSourceToFile` / `ModControllableAudio::writeTagsToFile` /
 * `ArpeggiatorSettings::writeCommonParamsToFile` /
 * `PatchCableSet::writePatchCablesToFile` / `Kit::writeDataToFile` /
 * `SoundDrum`, `MIDIDrum`, `GateDrum::writeToFile`, all at
 * SynthstromAudible/DelugeFirmware `upstream/main` 3f898e95.
 */

import type { HexParam } from '../params/hex'
import type { Attrs, XmlElement } from '../xml/element'
import type {
  ArpMode,
  ArpMpeSource,
  ArpNoteMode,
  ArpOctaveMode,
  FilterMode,
  FilterRoute,
  FilterType,
  LfoType,
  ModFxParam,
  ModFxType,
  OldArpMode,
  OscType,
  PatchSource,
  Polarity,
  PolyphonyMode,
  SynthMode,
} from './enums'
import type { KitParamAttr, ParamName, SoundParamAttr } from './params'

/** A decimal integer as the file has it (`"-12"`). `Number()` in, `String()` out. */
export type Int = string
/** A boolean as the file has it: `"0"` or `"1"`. */
export type Flag = '0' | '1'
/** Bytes as the file has them: two upper-case hex digits each, no `0x`. */
export type HexBytes = string

// ---------------------------------------------------------------- <sound>

export type SoundAttrs = {
  firmwareVersion?: string
  earliestCompatibleFirmware?: string
  /** Kit rows only. */
  name?: string
  polyphonic?: PolyphonyMode
  voicePriority?: Int
  /** Kit rows only, and only when non-zero. */
  sideChainSend?: Int
  mode?: SynthMode
  /** Only when non-zero. */
  transpose?: Int
  modFXType?: ModFxType
  lpfMode?: FilterMode
  hpfMode?: FilterMode
  filterRoute?: FilterRoute
  /** Only when non-zero. */
  clippingAmount?: Int
  /** Kit rows only: the folder the row's sample came from. */
  path?: string
  maxVoices?: Int
}

export type SoundChildren = {
  osc1: OscElement
  osc2: OscElement
  lfo1: LfoElement
  lfo2: LfoElement
  lfo3: LfoElement
  lfo4: LfoElement
  /** `mode="fm"` only. */
  modulator1: ModulatorElement
  modulator2: ModulatorElement
  unison: UnisonElement
  defaultParams: SoundParamsElement
  arpeggiator: ArpeggiatorElement
  modKnobs: ModKnobsElement
  /** Only when any are learned. */
  midiKnobs: MidiKnobsElement
  midiOutput: MidiOutputElement
  delay: DelayElement
  /** Community 1.1 and later. */
  sidechain: SidechainElement
  /** Official firmware's name for `<sidechain>`; the reader accepts both. */
  compressor: SidechainElement
  audioCompressor: AudioCompressorElement
  stutter: StutterElement
}

export type SoundElement = XmlElement<SoundAttrs, SoundChildren> & { tag: 'sound' }

export type OscAttrs = {
  /** Absent for `mode="fm"` sounds, whose oscillators are always sines. */
  type?: OscType
  // type="sample"
  loopMode?: Int
  reversed?: Flag
  timeStretchEnable?: Flag
  timeStretchAmount?: Int
  /** Written as `1` only when interpolation is linear. */
  linearInterpolation?: Flag
  // everything else
  transpose?: Int
  cents?: Int
  /** osc2 only, written as `1` only when on. */
  oscillatorSync?: Flag
  retrigPhase?: Int
  /** A single sample or wavetable file. Several go in `sampleRanges`/`wavetableRanges`. */
  fileName?: string
  // type="dx7"
  /** 156 bytes. */
  dx7patch?: HexBytes
  dx7enginemode?: Int
  dx7randomdetune?: Int
}
export type OscChildren = {
  /** A single sample's play and loop points. */
  zone: ZoneElement
  sampleRanges: SampleRangesElement
  wavetableRanges: WavetableRangesElement
}
export type OscElement = XmlElement<OscAttrs, OscChildren>

export type ZoneAttrs = {
  startSamplePos?: Int
  endSamplePos?: Int
  /** Only when non-zero. */
  startLoopPos?: Int
  endLoopPos?: Int
}
export type ZoneElement = XmlElement<ZoneAttrs>

export type SampleRangesElement = XmlElement<Attrs, { sampleRange: SampleRangeElement }>
export type SampleRangeAttrs = {
  /** Absent on the last (topmost) range. */
  rangeTopNote?: Int
  fileName?: string
  /** Only when non-zero. */
  transpose?: Int
  cents?: Int
}
export type SampleRangeElement = XmlElement<SampleRangeAttrs, { zone: ZoneElement }>

export type WavetableRangesElement = XmlElement<Attrs, { wavetableRange: WavetableRangeElement }>
export type WavetableRangeAttrs = { rangeTopNote?: Int; fileName?: string }
export type WavetableRangeElement = XmlElement<WavetableRangeAttrs>

export type LfoAttrs = { type?: LfoType; syncLevel?: Int; syncType?: Int }
export type LfoElement = XmlElement<LfoAttrs>

export type ModulatorAttrs = {
  transpose?: Int
  cents?: Int
  retrigPhase?: Int
  /** modulator2 only. */
  toModulator1?: Flag
}
export type ModulatorElement = XmlElement<ModulatorAttrs>

export type UnisonAttrs = { num?: Int; detune?: Int; spread?: Int }
export type UnisonElement = XmlElement<UnisonAttrs>

export type SoundParamsAttrs = { [P in SoundParamAttr]?: HexParam }
export type SoundParamsChildren = {
  envelope1: EnvelopeElement
  envelope2: EnvelopeElement
  envelope3: EnvelopeElement
  envelope4: EnvelopeElement
  /** Only when there are any. */
  patchCables: PatchCablesElement
  equalizer: EqualizerElement
}
export type SoundParamsElement = XmlElement<SoundParamsAttrs, SoundParamsChildren>

export type EnvelopeAttrs = { attack?: HexParam; decay?: HexParam; sustain?: HexParam; release?: HexParam }
export type EnvelopeElement = XmlElement<EnvelopeAttrs>

export type EqualizerAttrs = {
  bass?: HexParam
  treble?: HexParam
  bassFrequency?: HexParam
  trebleFrequency?: HexParam
}
export type EqualizerElement = XmlElement<EqualizerAttrs>

export type PatchCablesElement = XmlElement<Attrs, { patchCable: PatchCableElement }>
export type PatchCableAttrs = {
  source?: PatchSource
  destination?: ParamName
  /** Community 1.3 and later. */
  polarity?: Polarity
  amount?: HexParam
}
export type PatchCableChildren = {
  /** Cables that modulate this cable's depth: `source`, `polarity`, `amount`, no `destination`. */
  depthControlledBy: PatchCablesElement
}
export type PatchCableElement = XmlElement<PatchCableAttrs, PatchCableChildren>

export type ArpeggiatorAttrs = {
  /** `off`/`arp` since community 1.1; `off`/`up`/`down`/`both`/`random` before. */
  mode?: ArpMode | OldArpMode
  syncLevel?: Int
  numOctaves?: Int
  syncType?: Int
  arpMode?: ArpMode
  chordType?: Int
  noteMode?: ArpNoteMode
  octaveMode?: ArpOctaveMode
  mpeVelocity?: ArpMpeSource
  stepRepeat?: Int
  randomizerLock?: Int
  kitArp?: Int
  lastLockedNoteProb?: Int
  lockedNoteProbArray?: HexBytes
  lastLockedBassProb?: Int
  lockedBassProbArray?: HexBytes
  lastLockedSwapProb?: Int
  lockedSwapProbArray?: HexBytes
  lastLockedGlideProb?: Int
  lockedGlideProbArray?: HexBytes
  lastLockedReverseProb?: Int
  lockedReverseProbArray?: HexBytes
  lastLockedChordProb?: Int
  lockedChordProbArray?: HexBytes
  lastLockedRatchetProb?: Int
  lockedRatchetProbArray?: HexBytes
  lastLockedVelocitySpread?: Int
  lockedVelocitySpreadArray?: HexBytes
  lastLockedGateSpread?: Int
  lockedGateSpreadArray?: HexBytes
  lastLockedOctaveSpread?: Int
  lockedOctaveSpreadArray?: HexBytes
  /** Random per save (`ArpeggiatorSettings::writeCommonParamsToFile`). */
  notePattern?: HexBytes
  // MIDI and gate kit rows keep their arp params here rather than in <defaultParams>
  // (ArpeggiatorSettings::writeNonAudioParamsToFile).
  gate?: Int
  rate?: Int
  noteProbability?: Int
  bassProbability?: Int
  swapProbability?: Int
  glideProbability?: Int
  reverseProbability?: Int
  chordProbability?: Int
  ratchetProbability?: Int
  ratchetAmount?: Int
  sequenceLength?: Int
  chordPolyphony?: Int
  rhythm?: Int
  spreadVelocity?: Int
  spreadGate?: Int
  spreadOctave?: Int
}
export type ArpeggiatorElement = XmlElement<ArpeggiatorAttrs>

export type ModKnobsElement = XmlElement<Attrs, { modKnob: ModKnobElement }>
export type ModKnobAttrs = {
  controlsParam?: ParamName
  patchAmountFromSource?: PatchSource
  patchAmountFromSecondSource?: PatchSource
}
export type ModKnobElement = XmlElement<ModKnobAttrs>

export type MidiKnobsElement = XmlElement<Attrs, { midiKnob: MidiKnobElement }>
export type MidiKnobAttrs = {
  channel?: Int
  ccNumber?: Int
  relative?: Flag
  controlsParam?: ParamName
  patchAmountFromSource?: PatchSource
  patchAmountFromSecondSource?: PatchSource
}
export type MidiKnobElement = XmlElement<MidiKnobAttrs>

/** A sound's MIDI output (`<sound><midiOutput>`), not a kit's MIDI row. */
export type MidiOutputAttrs = { channel?: Int; noteForDrum?: Int }
export type MidiOutputElement = XmlElement<MidiOutputAttrs>

export type DelayAttrs = { pingPong?: Flag; analog?: Flag; syncLevel?: Int; syncType?: Int }
export type DelayElement = XmlElement<DelayAttrs>

/** `<sidechain>` (community ≥ 1.1) or `<compressor>` (official): the sidechain ducking envelope. */
export type SidechainAttrs = { attack?: Int; release?: Int; syncLevel?: Int; syncType?: Int }
export type SidechainElement = XmlElement<SidechainAttrs>

export type AudioCompressorAttrs = {
  attack?: Int
  release?: Int
  thresh?: Int
  ratio?: Int
  compHPF?: Int
  compBlend?: Int
}
export type AudioCompressorElement = XmlElement<AudioCompressorAttrs>

export type StutterAttrs = { quantized?: Flag; reverse?: Flag; pingPong?: Flag }
export type StutterElement = XmlElement<StutterAttrs>

// ------------------------------------------------------------------ <kit>

export type KitAttrs = {
  firmwareVersion?: string
  earliestCompatibleFirmware?: string
  modFXCurrentParam?: ModFxParam
  currentFilterType?: FilterType
  modFXType?: ModFxType
  lpfMode?: FilterMode
  hpfMode?: FilterMode
  filterRoute?: FilterRoute
  clippingAmount?: Int
}

export type KitChildren = {
  defaultParams: KitParamsElement
  delay: DelayElement
  sidechain: SidechainElement
  compressor: SidechainElement
  midiKnobs: MidiKnobsElement
  audioCompressor: AudioCompressorElement
  stutter: StutterElement
  soundSources: SoundSourcesElement
}

export type KitElement = XmlElement<KitAttrs, KitChildren> & { tag: 'kit' }

export type KitParamsAttrs = { [P in KitParamAttr]?: HexParam }
export type KitParamsChildren = {
  delay: XmlElement<{ rate?: HexParam; feedback?: HexParam }>
  lpf: XmlElement<{ frequency?: HexParam; resonance?: HexParam }>
  hpf: XmlElement<{ frequency?: HexParam; resonance?: HexParam }>
  equalizer: EqualizerElement
}
export type KitParamsElement = XmlElement<KitParamsAttrs, KitParamsChildren>

/**
 * The kit's rows, in pad order, of mixed kinds. Read `children` directly to
 * keep that order; `childrenOf(el, 'sound')` gives only the sound rows. The
 * reader also accepts `<sample>` and `<synth>` as row tags from old files.
 */
export type SoundSourcesElement = XmlElement<
  Attrs,
  {
    sound: SoundElement
    sample: SoundElement
    synth: SoundElement
    midiOutput: MidiDrumElement
    gateOutput: GateDrumElement
  }
>

export type MidiDrumAttrs = { name?: string; channel?: Int; note?: Int }
export type MidiDrumElement = XmlElement<MidiDrumAttrs, { arpeggiator: ArpeggiatorElement }> & {
  tag: 'midiOutput'
}

export type GateDrumAttrs = { name?: string; channel?: Int }
export type GateDrumElement = XmlElement<GateDrumAttrs, { arpeggiator: ArpeggiatorElement }> & {
  tag: 'gateOutput'
}

export type DrumRow = SoundElement | MidiDrumElement | GateDrumElement

// ---------------------------------------------------------------- Preset

export type Preset = SoundElement | KitElement
