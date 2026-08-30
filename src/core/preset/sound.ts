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
import { ensureChild, insertChild, removeChild, setAttr } from '../xml/edit'
import type { ParamName, PatchSource, Polarity } from './index'
import { CABLE_ATTR_ORDER, PARAMS_CHILD_ORDER, SOUND_CHILD_ORDER } from './order'
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
