/**
 * Where a MIDI-Follow parameter lives in a preset.
 *
 * `src/core/midi/follow.ts` says which parameter a CC addresses, in the names
 * `SETTINGS/MIDIFollow.XML` uses. This says where that parameter's value sits
 * in the file — which element and attribute — so the follow view can show it
 * and a received CC can be written where the firmware writes it.
 *
 * The names are the cable/gold-knob name space (`params.ts`), and several of
 * them differ from the `<defaultParams>` attribute that holds them
 * (`oscAPhaseWidth` is written `oscAPulseWidth`, `arpRate` is
 * `arpeggiatorRate`, `volumePostFX` is plain `volume`); that mapping already
 * exists as `PARAM_ATTR_TO_NAME` and this table is its inverse plus the
 * handful of parameters that hang off a child element instead.
 */

import type { HexParam } from '../params/hex'
import { intToHex } from '../params/hex'
import { ccToParamValue } from '../midi/follow'
import { ensureChild, setAttr } from '../xml/edit'
import { child } from '../xml/element'
import type { XmlElement } from '../xml/element'
import {
  ENVELOPE_ATTR_ORDER,
  EQUALIZER_ATTR_ORDER,
  KIT_CHILD_ORDER,
  KIT_DELAY_ATTR_ORDER,
  KIT_FILTER_ATTR_ORDER,
  KIT_PARAMS_CHILD_ORDER,
  PARAMS_CHILD_ORDER,
  SOUND_CHILD_ORDER,
} from './order'
import { KIT_PARAM_ATTRS, SOUND_PARAM_ATTRS } from './params'
import { paramScale, type ParamScale } from './sound'
import type { KitElement, SoundElement } from './types'

/**
 * One controllable value: the attribute, and the `<defaultParams>` child it
 * hangs off when it is not a flat attribute of `<defaultParams>` itself.
 */
export interface FollowSlot {
  attr: string
  /** `envelope1`…`envelope4`, `equalizer`, `lpf`, `hpf`, `delay`; absent = `<defaultParams>` itself. */
  under?: string
}

const env = (n: 1 | 2 | 3 | 4, attr: string): FollowSlot => ({ attr, under: `envelope${n}` })
const eq = (attr: string): FollowSlot => ({ attr, under: 'equalizer' })

/**
 * Sound parameters, for a synth and for a kit row (a kit clip with AFFECT
 * ENTIRE off routes follow CCs to the selected row's sound, minus portamento
 * — `MidiFollow::getModelStackWithParamForKitClip` blocks that one explicitly).
 */
export const SOUND_FOLLOW_SLOTS: Readonly<Record<string, FollowSlot>> = {
  pitch: { attr: 'pitchAdjust' },
  portamento: { attr: 'portamento' },
  volumePostFX: { attr: 'volume' },
  pan: { attr: 'pan' },
  oscAPitch: { attr: 'oscAPitchAdjust' },
  oscBPitch: { attr: 'oscBPitchAdjust' },
  modulator1Pitch: { attr: 'mod1PitchAdjust' },
  modulator2Pitch: { attr: 'mod2PitchAdjust' },
  modFXRate: { attr: 'modFXRate' },
  modFXFeedback: { attr: 'modFXFeedback' },
  modFXOffset: { attr: 'modFXOffset' },
  modFXDepth: { attr: 'modFXDepth' },
  waveFold: { attr: 'waveFold' },
  stutterRate: { attr: 'stutterRate' },
  oscAVolume: { attr: 'oscAVolume' },
  oscBVolume: { attr: 'oscBVolume' },
  oscAPhaseWidth: { attr: 'oscAPulseWidth' },
  oscBPhaseWidth: { attr: 'oscBPulseWidth' },
  oscAWavetablePosition: { attr: 'oscAWavetablePosition' },
  oscBWavetablePosition: { attr: 'oscBWavetablePosition' },
  carrier1Feedback: { attr: 'carrier1Feedback' },
  carrier2Feedback: { attr: 'carrier2Feedback' },
  noiseVolume: { attr: 'noiseVolume' },
  modulator1Volume: { attr: 'modulator1Amount' },
  modulator2Volume: { attr: 'modulator2Amount' },
  modulator1Feedback: { attr: 'modulator1Feedback' },
  modulator2Feedback: { attr: 'modulator2Feedback' },
  compressorThreshold: { attr: 'compressorThreshold' },
  compressorShape: { attr: 'compressorShape' },
  bitcrushAmount: { attr: 'bitCrush' },
  sampleRateReduction: { attr: 'sampleRateReduction' },
  lpfFrequency: { attr: 'lpfFrequency' },
  lpfResonance: { attr: 'lpfResonance' },
  lpfMorph: { attr: 'lpfMorph' },
  hpfFrequency: { attr: 'hpfFrequency' },
  hpfResonance: { attr: 'hpfResonance' },
  hpfMorph: { attr: 'hpfMorph' },
  delayRate: { attr: 'delayRate' },
  delayFeedback: { attr: 'delayFeedback' },
  reverbAmount: { attr: 'reverbAmount' },
  arpRate: { attr: 'arpeggiatorRate' },
  arpGate: { attr: 'arpeggiatorGate' },
  lfo1Rate: { attr: 'lfo1Rate' },
  lfo2Rate: { attr: 'lfo2Rate' },
  lfo3Rate: { attr: 'lfo3Rate' },
  lfo4Rate: { attr: 'lfo4Rate' },
  env1Attack: env(1, 'attack'),
  env1Decay: env(1, 'decay'),
  env1Sustain: env(1, 'sustain'),
  env1Release: env(1, 'release'),
  env2Attack: env(2, 'attack'),
  env2Decay: env(2, 'decay'),
  env2Sustain: env(2, 'sustain'),
  env2Release: env(2, 'release'),
  env3Attack: env(3, 'attack'),
  env3Decay: env(3, 'decay'),
  env3Sustain: env(3, 'sustain'),
  env3Release: env(3, 'release'),
  env4Attack: env(4, 'attack'),
  env4Decay: env(4, 'decay'),
  env4Sustain: env(4, 'sustain'),
  env4Release: env(4, 'release'),
  bass: eq('bass'),
  treble: eq('treble'),
  bassFreq: eq('bassFrequency'),
  trebleFreq: eq('trebleFrequency'),
  noteProbability: { attr: 'noteProbability' },
  bassProbability: { attr: 'bassProbability' },
  chordProbability: { attr: 'chordProbability' },
  chordPolyphony: { attr: 'chordPolyphony' },
  ratchetProbability: { attr: 'ratchetProbability' },
  ratchetAmount: { attr: 'ratchetAmount' },
  reverseProbability: { attr: 'reverseProbability' },
  swapProbability: { attr: 'swapProbability' },
  glideProbability: { attr: 'glideProbability' },
  sequenceLength: { attr: 'sequenceLength' },
  rhythm: { attr: 'rhythm' },
  spreadVelocity: { attr: 'spreadVelocity' },
  spreadGate: { attr: 'spreadGate' },
  spreadOctave: { attr: 'spreadOctave' },
}

/** Kit-bus parameters: a kit clip with AFFECT ENTIRE on. */
export const KIT_FOLLOW_SLOTS: Readonly<Record<string, FollowSlot>> = {
  volume: { attr: 'volume' },
  pan: { attr: 'pan' },
  pitchAdjust: { attr: 'pitchAdjust' },
  sidechainCompressorVolume: { attr: 'sidechainCompressorVolume' },
  compressorShape: { attr: 'sidechainCompressorShape' },
  modFXRate: { attr: 'modFXRate' },
  modFXDepth: { attr: 'modFXDepth' },
  modFXOffset: { attr: 'modFXOffset' },
  modFXFeedback: { attr: 'modFXFeedback' },
  bitcrushAmount: { attr: 'bitCrush' },
  sampleRateReduction: { attr: 'sampleRateReduction' },
  stutterRate: { attr: 'stutterRate' },
  reverbAmount: { attr: 'reverbAmount' },
  arpRate: { attr: 'arpeggiatorRate' },
  lpfMorph: { attr: 'lpfMorph' },
  hpfMorph: { attr: 'hpfMorph' },
  lpfFrequency: { attr: 'frequency', under: 'lpf' },
  lpfResonance: { attr: 'resonance', under: 'lpf' },
  hpfFrequency: { attr: 'frequency', under: 'hpf' },
  hpfResonance: { attr: 'resonance', under: 'hpf' },
  delayRate: { attr: 'rate', under: 'delay' },
  delayFeedback: { attr: 'feedback', under: 'delay' },
  bass: eq('bass'),
  treble: eq('treble'),
  bassFreq: eq('bassFrequency'),
  trebleFreq: eq('trebleFrequency'),
}

/** How the slot's number is shown and stored (`src/core/params/scale.ts`). */
export function slotScale(slot: FollowSlot): ParamScale {
  return paramScale(slot.attr)
}

/** Attribute order for a value the file lacks, so a new one lands where the firmware writes it. */
export function slotOrder(slot: FollowSlot, kit: boolean): readonly string[] {
  if (slot.under === undefined) return kit ? KIT_PARAM_ATTRS : SOUND_PARAM_ATTRS
  if (slot.under === 'equalizer') return EQUALIZER_ATTR_ORDER
  if (slot.under === 'lpf' || slot.under === 'hpf') return KIT_FILTER_ATTR_ORDER
  if (slot.under === 'delay') return KIT_DELAY_ATTR_ORDER
  return ENVELOPE_ATTR_ORDER
}

const paramsOf = (root: SoundElement | KitElement): XmlElement | undefined =>
  child(root as unknown as XmlElement, 'defaultParams')

const ensureParamsOf = (root: SoundElement | KitElement, kit: boolean): XmlElement =>
  ensureChild(root as unknown as XmlElement, 'defaultParams', kit ? KIT_CHILD_ORDER : SOUND_CHILD_ORDER)

/** The element holding the slot's attribute, or undefined while the file has none. */
export function slotElement(root: SoundElement | KitElement, slot: FollowSlot): XmlElement | undefined {
  const params = paramsOf(root)
  if (!params) return undefined
  return slot.under === undefined ? params : child(params, slot.under)
}

/** The same, creating `<defaultParams>` and the child at the writer's position. */
export function ensureSlotElement(root: SoundElement | KitElement, slot: FollowSlot, kit: boolean): XmlElement {
  const params = ensureParamsOf(root, kit)
  if (slot.under === undefined) return params
  return ensureChild(params, slot.under, kit ? KIT_PARAMS_CHILD_ORDER : PARAMS_CHILD_ORDER)
}

/** The slot's stored hex, or undefined when the file omits it. */
export const slotHex = (root: SoundElement | KitElement, slot: FollowSlot): HexParam | undefined =>
  slotElement(root, slot)?.attrs[slot.attr] as HexParam | undefined

/**
 * Apply one follow CC: store the int32 the Deluge itself stores for that CC
 * (`ccToParamValue`), not the nearest menu step. A gold encoder has 128
 * positions and the menu 51, so a mirrored value often sits between two menu
 * steps — which the editor already handles everywhere (it reads as the nearer
 * step and is only rewritten when the knob is moved), and which is the only
 * way the file the editor saves can hold what the instrument holds.
 */
export function applyFollowCC(
  root: SoundElement | KitElement,
  slot: FollowSlot,
  ccValue: number,
  kit: boolean,
): void {
  const value = ccToParamValue(ccValue, slotScale(slot) === 'half')
  setAttr(ensureSlotElement(root, slot, kit), slot.attr, intToHex(value), slotOrder(slot, kit))
}
