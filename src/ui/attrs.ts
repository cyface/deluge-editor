/**
 * The write half a knob over one attribute shares (`IntKnob`, `HexKnob`): the
 * element may not exist yet — the file omits `<unison>`, say — so the caller
 * hands an `ensure` that creates it in the firmware's order on first write.
 */
import { setAttr, type XmlElement } from '../core/xml'

export function writeAttr(
  el: XmlElement | undefined,
  ensure: (() => XmlElement) | undefined,
  attr: string,
  value: string,
  order?: readonly string[],
): void {
  const target = el ?? ensure?.()
  if (!target) return
  setAttr(target, attr, value, order)
}
