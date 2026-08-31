/**
 * The firmware's own stock settings — what a knob, envelope or LFO holds when
 * nobody has touched it — so the flow strip can say "stock" instead of
 * reciting sixteen assignments every preset shares (issues #14, #15).
 *
 * Everything here is read from firmware source, not derived from fixtures:
 *
 * - Mod (gold) knob layout: `Sound::Sound()` constructor,
 *   `src/deluge/processing/sound/sound.cpp` (tag `beta`, e7bae53); identical
 *   in official 4.1.4 (`synthstrom-official` branch, `src/sound.cpp`), so one
 *   table serves every supported firmware. XML names via
 *   `params::paramNameForFile` (`src/deluge/modulation/params/param.cpp`);
 *   `PatchSource::SIDECHAIN` serializes as "compressor" and `LFO_GLOBAL_1`
 *   as "lfo1".
 * - Envelopes: two firmware-authored forms exist. Loading a file runs
 *   `Sound::createParamManagerForLoading` → `initParams` first, so a missing
 *   attribute keeps `initParams`' value — env 2 (firmware `ENV_1`) is user
 *   20/20/25/20, env 1/3/4 are untouched `AutoParam`s at raw 0 (menu 25;
 *   `src/deluge/modulation/automation/auto_param.cpp`). The init synth
 *   (`Sound::setupAsDefaultSynth`, identical hex in `beta` and official
 *   4.1.4) overrides env 1 and env 2; every preset descended from it carries
 *   those values. An envelope matching either form is stock.
 * - LFOs: `LFOConfig()` is triangle, sync off (`src/deluge/modulation/lfo.h`,
 *   tag `beta`); rates from `initParams` — `GLOBAL_LFO_FREQ_1/2`
 *   (lfo1Rate/lfo3Rate) user 30, `LOCAL_LFO_LOCAL_FREQ_1/2`
 *   (lfo2Rate/lfo4Rate) raw 0 (menu 25).
 */

import { hexToInt } from '../params/hex'
import { standardToMenu } from '../params/scale'
import type { ParamName, SoundParamAttr } from './params'
import { envelopeMenu, lfo, modKnobs, paramMenu } from './sound'
import type { ModKnobElement, SoundElement } from './types'
import type { PatchSource } from './enums'

export interface StockModKnob {
  controlsParam: ParamName
  patchAmountFromSource?: PatchSource
}

/**
 * The 16 stock gold-knob assignments in serializer order: 8 pages × 2 knobs,
 * bottom knob (`modKnobs[page][0]`) written first.
 */
export const STOCK_MOD_KNOBS: readonly StockModKnob[] = [
  { controlsParam: 'pan' },
  { controlsParam: 'volumePostFX' },
  { controlsParam: 'lpfResonance' },
  { controlsParam: 'lpfFrequency' },
  { controlsParam: 'env1Release' },
  { controlsParam: 'env1Attack' },
  { controlsParam: 'delayFeedback' },
  { controlsParam: 'delayRate' },
  { controlsParam: 'reverbAmount' },
  { controlsParam: 'volumePostReverbSend', patchAmountFromSource: 'compressor' },
  { controlsParam: 'pitch', patchAmountFromSource: 'lfo1' },
  { controlsParam: 'lfo1Rate' },
  { controlsParam: 'portamento' },
  { controlsParam: 'stutterRate' },
  { controlsParam: 'bitcrushAmount' },
  { controlsParam: 'sampleRateReduction' },
]

/**
 * The knobs this file reassigned. A knob deviates when its param or its
 * bound source differs from the stock slot; absent knobs are stock by
 * definition (the firmware fills them in).
 */
export function modKnobDeviations(sound: SoundElement): ModKnobElement[] {
  return modKnobs(sound).filter((el, i) => {
    const stock = STOCK_MOD_KNOBS[i]
    return (
      stock === undefined ||
      el.attrs.controlsParam !== stock.controlsParam ||
      el.attrs.patchAmountFromSource !== stock.patchAmountFromSource ||
      el.attrs.patchAmountFromSecondSource !== undefined
    )
  })
}

type EnvN = 1 | 2 | 3 | 4
type AdsrMenu = readonly [number, number, number, number]

const adsr = (a: string, d: string, s: string, r: string): AdsrMenu =>
  [a, d, s, r].map((h) => standardToMenu(hexToInt(h))) as unknown as AdsrMenu

/** What a stage holds when the file omits it (`initParams`, else raw 0). */
const ENV_LOAD_DEFAULT: Record<EnvN, AdsrMenu> = {
  1: [25, 25, 25, 25],
  2: [20, 20, 25, 20],
  3: [25, 25, 25, 25],
  4: [25, 25, 25, 25],
}

/** Both firmware-authored forms per envelope: the load default, and the init synth's. */
const ENV_STOCK: Record<EnvN, readonly AdsrMenu[]> = {
  1: [ENV_LOAD_DEFAULT[1], adsr('0x80000000', '0xE6666654', '0x7FFFFFFF', '0x851EB851')],
  2: [ENV_LOAD_DEFAULT[2], adsr('0xA3D70A37', '0xA3D70A37', '0xFFFFFFE9', '0xE6666654')],
  3: [ENV_LOAD_DEFAULT[3]],
  4: [ENV_LOAD_DEFAULT[4]],
}

const STAGES = ['attack', 'decay', 'sustain', 'release'] as const

/** True when this envelope shows values the firmware writes on its own. */
export function envelopeIsStock(sound: SoundElement, n: EnvN): boolean {
  const load = ENV_LOAD_DEFAULT[n]
  const cur = STAGES.map((stage, i) => envelopeMenu(sound, n, stage) ?? load[i])
  return ENV_STOCK[n].some((t) => t.every((v, i) => v === cur[i]))
}

const LFO_STOCK_RATE: Record<EnvN, number> = { 1: 30, 2: 25, 3: 30, 4: 25 }

/** True when this LFO is the stock triangle, sync off, at the stock rate. */
export function lfoIsStock(sound: SoundElement, n: EnvN): boolean {
  const el = lfo(sound, n)
  if ((el?.attrs.type ?? 'triangle') !== 'triangle') return false
  if (Number(el?.attrs.syncLevel ?? 0) !== 0) return false
  const rate = paramMenu(sound, `lfo${n}Rate` as SoundParamAttr)
  return rate === undefined || rate === LFO_STOCK_RATE[n]
}
