/**
 * The gold (mod) knob assignment shape and the firmware's stock layout. A
 * leaf: `sound.ts` fills absent knobs from the table and `stock.ts` compares
 * a file against it, and neither needs the other for that.
 *
 * Layout from the `Sound::Sound()` constructor,
 * `src/deluge/processing/sound/sound.cpp` (`beta` e7bae539); identical in
 * official 4.1.4 (`synthstrom-official` branch, `src/sound.cpp`), so one
 * table serves every supported firmware. XML names via
 * `params::paramNameForFile` (`src/deluge/modulation/params/param.cpp`);
 * `PatchSource::SIDECHAIN` serializes as "compressor" and `LFO_GLOBAL_1` as
 * "lfo1".
 */

import type { PatchSource } from './enums'
import type { ParamName } from './params'

/** One knob's assignment: a param, or a patch cable's strength (param + source(s)). */
export interface ModKnobAssign {
  controlsParam: ParamName
  patchAmountFromSource?: PatchSource
  patchAmountFromSecondSource?: PatchSource
}

/** A stock assignment: the constructor never sets a second source. */
export type StockModKnob = Omit<ModKnobAssign, 'patchAmountFromSecondSource'>

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
