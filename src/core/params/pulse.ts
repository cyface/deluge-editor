/**
 * What "Pulse Width" actually does to an oscillator.
 *
 * On the Deluge the name misleads twice over. The control is offered for
 * nearly every oscillator type, not just the square, and for the ones that are
 * not squares it is a phase distortion — the wave is sped up and hard-synced
 * back to the note's own period — rather than a duty cycle. All of it is
 * `Oscillator::renderOsc` (`src/deluge/dsp/oscillators/oscillator.cpp`,
 * SynthstromAudible/DelugeFirmware upstream/community bef6d9df):
 *
 *   if (type == SQUARE)  { doPulseWave = (pulseWidth != 0); pulseWidth += 2147483648u; }
 *   if (type != SQUARE)  { doPulseWave = (pulseWidth && !doOscSync); ... doOscSync = true; }
 *
 * so at zero there is no pulse shaping at all and the oscillator plays its
 * plain waveform — the zero of this control is not a 50% square, it is
 * "off" — and with Osc Sync on, every type but the mathematical square ignores
 * the control completely.
 *
 * The value reaching that code is the stored one. `LOCAL_OSC_A/B_PHASE_WIDTH`
 * is a hybrid param with a neutral value of 0 (`getParamNeutralValue`) and the
 * default 2^30 range (`getParamRange`), so with no cables the patcher's
 * `combineCablesExp` quarters it, `getFinalParameterValueHybrid` doubles it
 * back, and `lshiftAndSaturate<1>` in `Voice::render` (`model/voice/voice.cpp`)
 * doubles it once more — landing back on the number in the file.
 */

import { mulRshift32, TWO31, TWO32 } from './fixedpoint'
import { INT32_MAX, INT32_MIN } from './hex'
import type { OscType } from '../preset/enums'

/** ARM's SSAT, as `signed_saturate<bits>` (`util/functions.h`). */
const signedSaturate = (v: number, bits: number): number =>
  Math.max(-(2 ** (bits - 1)), Math.min(2 ** (bits - 1) - 1, v))

/**
 * The `pulseWidth` the renderer sees for a stored `oscAPulseWidth` /
 * `oscBPulseWidth`, with nothing patched to it: the patcher's hybrid chain
 * (`Patcher::recalculateFinalValueForParamWithNoCables`,
 * `getFinalParameterValueHybrid`) followed by `lshiftAndSaturate<1>`.
 */
export function pulseWidthRendered(paramValue: number): number {
  const combined = mulRshift32(paramValue, 1073741824) // combineCablesExp, paramRanges default
  const final = signedSaturate(Math.floor(combined / 2), 29) * 4 // getFinalParameterValueHybrid, neutral 0
  return Math.max(INT32_MIN, Math.min(INT32_MAX, signedSaturate(final, 31) * 2))
}

/**
 * Which of the two things pulse width does to an oscillator of this type.
 *
 * - `square` — the mathematical square and the analog one both end up a pulse
 *   whose high part widens from half the cycle to all of it. The first does it
 *   directly, `getSquare(phase, pulseWidth)` after `pulseWidth += 2^31`
 *   (`util/waves.h`); the second by hard-syncing a square running at
 *   `2^31 / (pulseWidth + 2^31)` of the note's rate, which leaves the same
 *   fraction of its cycle audible.
 * - `sync` — everything else runs its wave at `1 + pulseWidth / 2^31` times
 *   the note's rate and resets it every note cycle, so a saw at full pulse
 *   width is two saws in the space of one.
 * - `none` — samples and the audio inputs, which the control is not offered
 *   for, and DX7, which never reaches this renderer at all
 *   (`Voice::render` hands it to `dxVoice->compute`).
 */
export type PulseFamily = 'square' | 'sync' | 'none'

export function pulseFamily(oscType: OscType): PulseFamily {
  if (oscType === 'square' || oscType === 'analogSquare') return 'square'
  if (oscType === 'sample' || oscType === 'inLeft' || oscType === 'inRight' || oscType === 'inStereo') return 'none'
  if (oscType === 'dx7') return 'none'
  return 'sync'
}

/**
 * Whether the firmware offers the control for this oscillator:
 * `PulseWidth::isRelevant` (`gui/menu_item/osc/pulse_width.h`) — never in FM
 * mode, never for a sample or an input, and for a wavetable only once a file
 * is loaded (`Source::hasAtLeastOneAudioFileLoaded`).
 */
export function pulseWidthOffered(
  oscType: OscType,
  { fm, fileLoaded }: { fm: boolean; fileLoaded: boolean },
): boolean {
  if (fm) return false
  if (oscType === 'wavetable') return fileLoaded
  return pulseFamily(oscType) !== 'none'
}

/**
 * Whether the control, though offered, does anything right now. Osc Sync sets
 * `doOscSync` on Osc B, and the non-square branch refuses to pulse-shape when
 * it is on: `doPulseWave = (pulseWidth && !doOscSync)`.
 */
export const pulseWidthHeard = (oscType: OscType, { oscSync }: { oscSync: boolean }): boolean =>
  !oscSync || oscType === 'square'

/**
 * The fraction of the cycle a `square` family oscillator spends high: a half
 * at zero, all of it at the top of the menu, where the wave is silent.
 */
export const pulseDuty = (paramValue: number): number => {
  const pw = pulseWidthRendered(paramValue)
  return pw === 0 ? 0.5 : Math.min(1, (pw + TWO31) / TWO32)
}

/**
 * How many cycles a `sync` family oscillator fits into one note cycle before
 * the sync resets it: one at zero, two at the top of the menu.
 */
export const pulseSyncRatio = (paramValue: number): number => {
  const pw = pulseWidthRendered(paramValue)
  return pw === 0 ? 1 : 1 + pw / TWO31
}

/**
 * One cycle of the plain wave the pulse-width graph starts from, phase 0..1
 * (any real; the fraction is used), in −1..1. A sketch of the oscillator
 * types, not the tables: the analog shapes are drawn as their mathematical
 * kin, and a wavetable's own frames are not read, so a saw stands in for it.
 * Anything not named draws as a square.
 */
export function pulseBaseWave(oscType: OscType, p: number): number {
  const q = p - Math.floor(p)
  if (oscType === 'sine') return Math.sin(2 * Math.PI * q)
  if (oscType === 'triangle') return q < 0.25 ? 4 * q : q < 0.75 ? 2 - 4 * q : 4 * q - 4
  if (oscType === 'saw' || oscType === 'analogSaw' || oscType === 'wavetable') return 1 - 2 * q
  return q < 0.5 ? 1 : -1
}
