/**
 * Typed reads and writes on a `<sound>`, in terms of what the UI wants:
 * "the LPF cutoff as the Deluge shows it", "the cables into `volume`". Every
 * write goes through `src/core/xml/edit.ts` so a value the file lacked is
 * created where the firmware writes it.
 */

import { hexToInt, intToHex, type HexParam } from '../params/hex'
import {
  cableToMenu,
  halfToMenu,
  menuToCable,
  menuToHalf,
  menuToPan,
  menuToStandard,
  panToMenu,
  standardToMenu,
} from '../params/scale'
import { child, childrenOf, element } from '../xml/element'
import { ensureChild, insertChild, removeAttr, removeChild, setAttr } from '../xml/edit'
import type { ParamName, PatchSource, Polarity } from './index'
import { CABLE_ATTR_ORDER, ENVELOPE_ATTR_ORDER, MOD_KNOB_ATTR_ORDER, PARAMS_CHILD_ORDER, SOUND_CHILD_ORDER } from './order'
import { STOCK_MOD_KNOBS } from './stock'
import { SOUND_PARAM_ATTRS, type SoundParamAttr } from './params'
import type {
  EnvelopeElement,
  LfoElement,
  ModKnobElement,
  OscElement,
  PatchCableElement,
  SoundElement,
  SoundParamsElement,
} from './types'

// ---- <defaultParams> ------------------------------------------------------

export const params = (sound: SoundElement): SoundParamsElement | undefined => child(sound, 'defaultParams')

export const ensureParams = (sound: SoundElement): SoundParamsElement =>
  ensureChild(sound, 'defaultParams', SOUND_CHILD_ORDER)

/** The stored hex of a `<defaultParams>` attribute, or undefined when the file omits it. */
export const paramHex = (sound: SoundElement, attr: SoundParamAttr): HexParam | undefined =>
  params(sound)?.attrs[attr]

export function setParamHex(sound: SoundElement, attr: SoundParamAttr, hex: HexParam): void {
  setAttr(ensureParams(sound), attr, hex, SOUND_PARAM_ATTRS)
}

/**
 * How a `<defaultParams>` attribute is scaled for display. Everything is the
 * standard 0..50 except pan (-25..25), the pulse widths and the compressor
 * threshold (0..50 over the positive half) — see `src/core/params/scale.ts`.
 */
export type ParamScale = 'standard' | 'pan' | 'half'

export function paramScale(attr: string): ParamScale {
  if (attr === 'pan') return 'pan'
  if (attr === 'oscAPulseWidth' || attr === 'oscBPulseWidth' || attr === 'compressorThreshold') return 'half'
  return 'standard'
}

export function hexToMenu(hex: string, scale: ParamScale): number {
  const v = hexToInt(hex)
  return scale === 'pan' ? panToMenu(v) : scale === 'half' ? halfToMenu(v) : standardToMenu(v)
}

export function menuToHex(menu: number, scale: ParamScale): HexParam {
  return intToHex(scale === 'pan' ? menuToPan(menu) : scale === 'half' ? menuToHalf(menu) : menuToStandard(menu))
}

/** A param as the Deluge shows it; `undefined` when the file omits it. */
export function paramMenu(sound: SoundElement, attr: SoundParamAttr): number | undefined {
  const hex = paramHex(sound, attr)
  return hex === undefined ? undefined : hexToMenu(hex, paramScale(attr))
}

export function setParamMenu(sound: SoundElement, attr: SoundParamAttr, menu: number): void {
  setParamHex(sound, attr, menuToHex(menu, paramScale(attr)))
}

// ---- sub-elements ---------------------------------------------------------

export const osc = (sound: SoundElement, n: 1 | 2): OscElement | undefined => child(sound, `osc${n}`)

/**
 * Whether an oscillator has an audio file to play —
 * `Source::hasAtLeastOneAudioFileLoaded`, which decides whether the firmware
 * offers a wavetable oscillator its pulse width at all
 * (`PulseWidth::isRelevant`). One file is the `fileName` attribute; several
 * are `<sampleRanges>` / `<wavetableRanges>` entries.
 */
export function oscHasFile(o: OscElement | undefined): boolean {
  if (!o) return false
  if ((o.attrs.fileName ?? '') !== '') return true
  return (['sampleRanges', 'wavetableRanges'] as const).some((tag) => {
    const ranges = child(o, tag)
    return ranges !== undefined && ranges.children.length > 0
  })
}
export const lfo = (sound: SoundElement, n: 1 | 2 | 3 | 4): LfoElement | undefined => child(sound, `lfo${n}`)
export const envelope = (sound: SoundElement, n: 1 | 2 | 3 | 4): EnvelopeElement | undefined =>
  params(sound) && child(params(sound)!, `envelope${n}`)

export const ensureEnvelope = (sound: SoundElement, n: 1 | 2 | 3 | 4): EnvelopeElement =>
  ensureChild(ensureParams(sound), `envelope${n}`, PARAMS_CHILD_ORDER)

/** Envelope stage as shown, or undefined. */
export function envelopeMenu(sound: SoundElement, n: 1 | 2 | 3 | 4, stage: keyof EnvelopeElement['attrs']) {
  const hex = envelope(sound, n)?.attrs[stage]
  return hex === undefined ? undefined : standardToMenu(hexToInt(hex))
}

/** Write an envelope stage from its 0–50 menu value, creating the envelope where the firmware writes it. */
export function setEnvelopeMenu(sound: SoundElement, n: 1 | 2 | 3 | 4, stage: keyof EnvelopeElement['attrs'], menu: number): void {
  setAttr(ensureEnvelope(sound, n), stage, intToHex(menuToStandard(menu)), ENVELOPE_ATTR_ORDER)
}

// ---- patch cables ---------------------------------------------------------

/** Top-level cables (a cable's own `<depthControlledBy>` cables are not included). */
export function cables(sound: SoundElement): PatchCableElement[] {
  const p = params(sound)
  const set = p && child(p, 'patchCables')
  return set ? childrenOf(set, 'patchCable') : []
}

export const cablesTo = (sound: SoundElement, destination: string): PatchCableElement[] =>
  cables(sound).filter((c) => c.attrs.destination === destination)

export const cablesFrom = (sound: SoundElement, source: string): PatchCableElement[] =>
  cables(sound).filter((c) => c.attrs.source === source)

/** Cable amount as shown: hundredths, -5000..5000. */
export const cableMenu = (cable: PatchCableElement): number =>
  cable.attrs.amount === undefined ? 0 : cableToMenu(hexToInt(cable.attrs.amount))

export function setCableMenu(cable: PatchCableElement, menu: number): void {
  setAttr(cable, 'amount', intToHex(menuToCable(menu)), CABLE_ATTR_ORDER)
}

export function addCable(
  sound: SoundElement,
  source: PatchSource,
  destination: ParamName,
  menu = 0,
  polarity?: Polarity,
): PatchCableElement {
  const set = ensureChild(ensureParams(sound), 'patchCables', PARAMS_CHILD_ORDER)
  const cable = element('patchCable', { source, destination }, []) as PatchCableElement
  if (polarity) cable.attrs.polarity = polarity
  cable.attrs.amount = intToHex(menuToCable(menu))
  insertChild(set, cable)
  return cable
}

export function removeCable(sound: SoundElement, cable: PatchCableElement): void {
  const p = params(sound)
  const set = p && child(p, 'patchCables')
  if (!set) return
  removeChild(set, cable)
  // The firmware omits <patchCables> when there are none.
  if (set.children.length === 0) removeChild(p, set)
}

// ---- gold (mod) knobs -----------------------------------------------------

/** The 16 `<modKnob>` entries in file order (bottom knob of page 1 first). */
export function modKnobs(sound: SoundElement): ModKnobElement[] {
  const knobs = child(sound, 'modKnobs')
  return knobs ? childrenOf(knobs, 'modKnob') : []
}

/** Parameter names a gold encoder controls directly. */
export function goldParams(sound: SoundElement): Set<string> {
  return new Set(
    modKnobs(sound)
      .filter((k) => k.attrs.patchAmountFromSource === undefined)
      .map((k) => k.attrs.controlsParam)
      .filter((p): p is ParamName => p !== undefined),
  )
}

/** One knob's assignment: a param, or a patch cable's strength (param + source(s)). */
export interface ModKnobAssign {
  controlsParam: ParamName
  patchAmountFromSource?: PatchSource
  patchAmountFromSecondSource?: PatchSource
}

/**
 * The full 16-entry `<modKnobs>` array, created in serializer position when
 * the file has none. The firmware keeps its constructor defaults for knobs a
 * file doesn't mention and always writes all 16 back (`Sound::writeToFile`,
 * sound.cpp:4223-4244, upstream/community bef6d9df), so absent entries are filled
 * with the stock assignments.
 */
export function ensureModKnobs(sound: SoundElement): ModKnobElement[] {
  const set = ensureChild(sound, 'modKnobs', SOUND_CHILD_ORDER)
  for (let i = childrenOf(set, 'modKnob').length; i < STOCK_MOD_KNOBS.length; i++) {
    const stock = STOCK_MOD_KNOBS[i]
    const knob = element('modKnob', { controlsParam: stock.controlsParam }, []) as ModKnobElement
    if (stock.patchAmountFromSource) knob.attrs.patchAmountFromSource = stock.patchAmountFromSource
    insertChild(set, knob)
  }
  return childrenOf(set, 'modKnob')
}

/**
 * Assign knob `n` (file order: page 1's bottom knob first). The volume family
 * is canonicalised the way the firmware re-saves it after
 * `ensureKnobReferencesCorrectVolume` (sound.cpp:1317): a param-only knob
 * gets `volumePostFX`, a sidechain-driven one `volumePostReverbSend`, any
 * other source `volume`.
 */
export function setModKnob(sound: SoundElement, n: number, assign: ModKnobAssign): void {
  const knob = ensureModKnobs(sound)[n]
  if (!knob) return
  const source = assign.patchAmountFromSource
  const second = source && assign.patchAmountFromSecondSource
  let param = assign.controlsParam
  if (param === 'volume' || param === 'volumePostFX' || param === 'volumePostReverbSend') {
    param = source === undefined ? 'volumePostFX' : source === 'compressor' ? 'volumePostReverbSend' : 'volume'
  }
  setAttr(knob, 'controlsParam', param, MOD_KNOB_ATTR_ORDER)
  if (source) setAttr(knob, 'patchAmountFromSource', source, MOD_KNOB_ATTR_ORDER)
  else removeAttr(knob, 'patchAmountFromSource')
  if (second) setAttr(knob, 'patchAmountFromSecondSource', second, MOD_KNOB_ATTR_ORDER)
  else removeAttr(knob, 'patchAmountFromSecondSource')
}
