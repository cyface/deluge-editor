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
import { paramLabel } from './names'
import type { ParamName } from './params'
import type { ModKnobElement } from './types'

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

/**
 * The volume family is one knob target the firmware disambiguates by source:
 * `Sound::ensureKnobReferencesCorrectVolume` (`processing/sound/sound.cpp:1317`,
 * `beta` e7bae539) rewrites a knob on `LOCAL_VOLUME`, `GLOBAL_VOLUME_POST_FX`
 * or `GLOBAL_VOLUME_POST_REVERB_SEND` to `volumePostFX` when it is a plain
 * param, `volumePostReverbSend` when its source is the sidechain, and
 * `volume` for any other source. So a select shows the one canonical name and
 * `setModKnob` writes the string the source calls for.
 */
export const canonicalKnobParam = (p: string | undefined): string | undefined =>
  p === 'volume' || p === 'volumePostReverbSend' ? 'volumePostFX' : p

/**
 * One line for gold-knob slot `i`: the parameter's label, ` via <source>` when
 * the knob turns a cable's depth, and ` · 2nd <source>` for a second source.
 * A slot the file doesn't carry (`k` undefined) reads as its stock assignment.
 * `sourceLabel` names a source the way the caller's selects do, so a source
 * the firmware gate hides still shows its raw string rather than vanishing.
 */
export function modKnobSummary(k: ModKnobElement | undefined, i: number, sourceLabel: (s: string) => string): string {
  const stock = STOCK_MOD_KNOBS[i]
  const param = paramLabel(canonicalKnobParam(k?.attrs.controlsParam ?? stock.controlsParam) ?? '')
  const src = k ? k.attrs.patchAmountFromSource : stock.patchAmountFromSource
  const second = k?.attrs.patchAmountFromSecondSource
  return param + (src ? ` via ${sourceLabel(src)}` : '') + (second ? ` · 2nd ${sourceLabel(second)}` : '')
}
