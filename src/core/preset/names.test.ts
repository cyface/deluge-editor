/**
 * The human-name tables are keyed by the firmware's strings, so each must
 * cover its enum exactly: a missing key is a value shown raw, a stray key is
 * a string the firmware never writes (the pattern of `src/ui/help.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import {
  ARP_MODES,
  ARP_MPE_SOURCES,
  ARP_NOTE_MODES,
  ARP_OCTAVE_MODES,
  FILTER_MODES,
  FILTER_ROUTES,
  LFO_TYPES,
  MOD_FX_TYPES,
  OLD_ARP_MODES,
  OSC_TYPES,
  PATCH_SOURCES,
  POLARITIES,
  POLYPHONY_MODES,
  SYNTH_MODES,
} from './enums'
import { LOOP_MODE } from './multisample'
import {
  ARP_MODE_NAMES,
  ARP_MPE_NAMES,
  ARP_NOTE_MODE_NAMES,
  ARP_OCTAVE_MODE_NAMES,
  FILTER_MODE_NAMES,
  FILTER_MODE_SHORT,
  FILTER_MODE_WORDS,
  FILTER_ROUTE_NAMES,
  LFO_TYPE_NAMES,
  LOOP_MODE_NAMES,
  MOD_FX_NAMES,
  MOD_FX_WORDS,
  OLD_ARP_MODE_NAMES,
  OSC_TYPE_NAMES,
  OSC_TYPE_SHORT,
  OSC_TYPE_WORDS,
  PATCH_SOURCE_NAMES,
  POLARITY_NAMES,
  POLYPHONY_NAMES,
  SYNTH_MODE_NAMES,
  VOICE_PRIORITY_NAMES,
  paramLabel,
} from './names'
import { PARAM_NAMES, KIT_PARAM_ATTRS, SOUND_PARAM_ATTRS } from './params'

/** Every table, the enum it is keyed by, and whether an empty value is allowed (summariser words). */
const TABLES: { name: string; table: Record<string, string>; keys: readonly string[]; blanks?: boolean }[] = [
  { name: 'OSC_TYPE_NAMES', table: OSC_TYPE_NAMES, keys: OSC_TYPES },
  { name: 'OSC_TYPE_WORDS', table: OSC_TYPE_WORDS, keys: OSC_TYPES },
  { name: 'OSC_TYPE_SHORT', table: OSC_TYPE_SHORT, keys: OSC_TYPES },
  { name: 'LFO_TYPE_NAMES', table: LFO_TYPE_NAMES, keys: LFO_TYPES },
  { name: 'SYNTH_MODE_NAMES', table: SYNTH_MODE_NAMES, keys: SYNTH_MODES },
  { name: 'POLYPHONY_NAMES', table: POLYPHONY_NAMES, keys: POLYPHONY_MODES },
  { name: 'MOD_FX_NAMES', table: MOD_FX_NAMES, keys: MOD_FX_TYPES },
  { name: 'MOD_FX_WORDS', table: MOD_FX_WORDS, keys: MOD_FX_TYPES, blanks: true }, // `none` says nothing
  { name: 'FILTER_MODE_NAMES', table: FILTER_MODE_NAMES, keys: FILTER_MODES },
  { name: 'FILTER_MODE_WORDS', table: FILTER_MODE_WORDS, keys: FILTER_MODES },
  { name: 'FILTER_MODE_SHORT', table: FILTER_MODE_SHORT, keys: FILTER_MODES },
  { name: 'FILTER_ROUTE_NAMES', table: FILTER_ROUTE_NAMES, keys: FILTER_ROUTES },
  { name: 'PATCH_SOURCE_NAMES', table: PATCH_SOURCE_NAMES, keys: PATCH_SOURCES },
  { name: 'POLARITY_NAMES', table: POLARITY_NAMES, keys: POLARITIES },
  { name: 'ARP_MODE_NAMES', table: ARP_MODE_NAMES, keys: ARP_MODES },
  { name: 'OLD_ARP_MODE_NAMES', table: OLD_ARP_MODE_NAMES, keys: OLD_ARP_MODES },
  { name: 'ARP_NOTE_MODE_NAMES', table: ARP_NOTE_MODE_NAMES, keys: ARP_NOTE_MODES },
  { name: 'ARP_OCTAVE_MODE_NAMES', table: ARP_OCTAVE_MODE_NAMES, keys: ARP_OCTAVE_MODES },
  { name: 'ARP_MPE_NAMES', table: ARP_MPE_NAMES, keys: ARP_MPE_SOURCES },
  { name: 'LOOP_MODE_NAMES', table: LOOP_MODE_NAMES, keys: Object.values(LOOP_MODE) },
  // `VoicePriority` LOW, MEDIUM, HIGH (src/definitions_cxx.hpp): stored as its ordinal.
  { name: 'VOICE_PRIORITY_NAMES', table: VOICE_PRIORITY_NAMES, keys: ['0', '1', '2'] },
]

describe('name tables', () => {
  for (const { name, table, keys, blanks } of TABLES) {
    it(`${name} names every value of its enum and nothing else`, () => {
      expect(Object.keys(table).sort()).toEqual([...keys].sort())
      if (!blanks) expect(Object.entries(table).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([])
    })
  }

  it('the short codes are short enough for a chip', () => {
    for (const code of [...Object.values(OSC_TYPE_SHORT), ...Object.values(FILTER_MODE_SHORT)]) {
      expect(code.length).toBeLessThanOrEqual(6)
    }
  })
})

describe('paramLabel', () => {
  it('labels every parameter a cable, a knob or <defaultParams> can name', () => {
    const raw = [...new Set([...PARAM_NAMES, ...SOUND_PARAM_ATTRS, ...KIT_PARAM_ATTRS])].filter((p) => paramLabel(p) === p)
    // The four `…PitchAdjust` attributes (`Sound::writeParamsToFile` writes
    // them only when set) have no label yet and show raw. Shrink this list
    // when `names.ts` gains them; nothing else may join it.
    expect(raw).toEqual(['oscAPitchAdjust', 'oscBPitchAdjust', 'mod1PitchAdjust', 'mod2PitchAdjust'])
  })

  it('falls back to the raw name for anything else', () => {
    expect(paramLabel('notAParam')).toBe('notAParam')
  })

  it('agrees with itself across the two spellings of a parameter', () => {
    // `<defaultParams>` and the cable/knob tables spell some params differently
    // (`PARAM_ATTR_TO_NAME`); the label must not.
    expect(paramLabel('oscAPulseWidth')).toBe(paramLabel('oscAPhaseWidth'))
    expect(paramLabel('bitCrush')).toBe(paramLabel('bitcrushAmount'))
    expect(paramLabel('arpeggiatorRate')).toBe(paramLabel('arpRate'))
    expect(paramLabel('arpeggiatorGate')).toBe(paramLabel('arpGate'))
    expect(paramLabel('modulator1Amount')).toBe(paramLabel('modulator1Volume'))
    expect(paramLabel('volume')).toBe(paramLabel('volumePostFX'))
  })
})
