import { describe, expect, it } from 'vitest'
import {
  ARP_MODES,
  ARP_MPE_SOURCES,
  ARP_NOTE_MODES,
  ARP_OCTAVE_MODES,
  FILTER_MODES,
  FILTER_ROUTES,
  FILTER_TYPES,
  LFO_TYPES,
  MOD_FX_PARAMS,
  MOD_FX_TYPES,
  OLD_ARP_MODES,
  OSC_TYPES,
  PARAM_NAMES,
  PATCH_SOURCES,
  POLARITIES,
  POLYPHONY_MODES,
  SYNTH_MODES,
} from '../src/core/preset'
import { flattenXML } from '../src/core/xml'

// Every enum-valued attribute in every Deluge-authored fixture must be in the
// firmware string tables. The tables were transcribed from source; the
// fixtures are what the firmware actually wrote. They have to agree.
// tests/fixtures/settings/ holds card SETTINGS files, not presets.
const fixtures = import.meta.glob<string>(['./fixtures/**/*.{xml,XML}', '!./fixtures/settings/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const TABLES: Array<[RegExp, readonly string[]]> = [
  [/\/osc[12]@type$/, OSC_TYPES],
  [/\/lfo[1-4]@type$/, LFO_TYPES],
  [/(^|\/)sound(\[\d+\])?@mode$/, SYNTH_MODES],
  [/(^|\/)sound(\[\d+\])?@polyphonic$/, POLYPHONY_MODES],
  [/@modFXType$/, MOD_FX_TYPES],
  [/@modFXCurrentParam$/, MOD_FX_PARAMS],
  [/@currentFilterType$/, FILTER_TYPES],
  [/@(lpfMode|hpfMode)$/, FILTER_MODES],
  [/@filterRoute$/, FILTER_ROUTES],
  [/\/arpeggiator@mode$/, [...ARP_MODES, ...OLD_ARP_MODES]],
  [/\/arpeggiator@arpMode$/, ARP_MODES],
  [/\/arpeggiator@noteMode$/, ARP_NOTE_MODES],
  [/\/arpeggiator@octaveMode$/, ARP_OCTAVE_MODES],
  [/\/arpeggiator@mpeVelocity$/, ARP_MPE_SOURCES],
  [/\/patchCable(\[\d+\])?@source$/, PATCH_SOURCES],
  [/\/patchCable(\[\d+\])?@destination$/, PARAM_NAMES],
  [/\/patchCable(\[\d+\])?@polarity$/, POLARITIES],
  [/\/modKnob(\[\d+\])?@controlsParam$/, PARAM_NAMES],
  [/\/modKnob(\[\d+\])?@patchAmountFrom(Second)?Source$/, PATCH_SOURCES],
]

describe('firmware string tables against the fixtures', () => {
  for (const [name, src] of Object.entries(fixtures).sort()) {
    it(`${name}: every enum value is in its table`, () => {
      const legacyPolyphony = name.includes('old-format') // pre-June-2017 numerals, see POLYPHONY_MODES
      // Before 3.2 a cable's depth was patched as destination="range" (official-3.1.1/); see src/core/preset/summary.test.ts.
      const legacyRange = name.includes('official-3.1.1')
      const bad: string[] = []
      for (const [path, value] of flattenXML(src)) {
        for (const [re, table] of TABLES) {
          if (!re.test(path)) continue
          if (legacyPolyphony && path.endsWith('@polyphonic') && /^\d+$/.test(value)) continue
          if (legacyRange && path.endsWith('@destination') && value === 'range') continue
          if (!table.includes(value)) bad.push(`${path}="${value}"`)
        }
      }
      expect(bad).toEqual([])
    })
  }
})
