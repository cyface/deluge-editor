/**
 * The "no CFW badges" mechanism (`docs/decisions.md`): a value the selected
 * firmware can't honour is not offered. `gates.ts` says which `FEATURES`
 * entry each value needs; this holds those maps against the feature table
 * and against what firmware-written files actually contain.
 */
import { describe, expect, it } from 'vitest'
import { allFixtures } from '../../../tests/helpers/fixtures'
import {
  KIT_PARAM_ATTRS,
  LFO_TYPES,
  FILTER_MODES,
  MOD_FX_TYPES,
  OSC_TYPES,
  PATCHED_GLOBAL_PARAMS,
  PATCHED_LOCAL_PARAMS,
  PATCH_SOURCES,
  SOUND_PARAM_ATTRS,
  UNPATCHED_SHARED_PARAMS,
  UNPATCHED_SOUND_PARAMS,
} from '../preset'
import { flattenXML } from '../xml'
import { FEATURES, supports } from './features'
import {
  DEST_FEATURE,
  HPF_MODES,
  LFO_TYPE_FEATURE,
  LPF_MODE_FEATURE,
  MOD_FX_FEATURE,
  OSC_TYPE_FEATURE,
  PARAM_ATTR_FEATURE,
  SOURCE_FEATURE,
  UNPATCHED_KNOB_FEATURE,
  gateAllows,
} from './gates'
import { parseVersion } from './version'

const official414 = (feature: string) => supports(parseVersion('4.1.4'), feature)
const community130 = (feature: string) => supports(parseVersion('c1.3.0'), feature)

/** Each gate map with the table its keys must come from, and the fixture paths its values appear at. */
const GATES: { name: string; gates: Record<string, string>; table: readonly string[]; at: RegExp }[] = [
  { name: 'OSC_TYPE_FEATURE', gates: OSC_TYPE_FEATURE, table: OSC_TYPES, at: /\/osc[12]@type$/ },
  { name: 'LFO_TYPE_FEATURE', gates: LFO_TYPE_FEATURE, table: LFO_TYPES, at: /\/lfo[1-4]@type$/ },
  { name: 'MOD_FX_FEATURE', gates: MOD_FX_FEATURE, table: MOD_FX_TYPES, at: /@modFXType$/ },
  { name: 'LPF_MODE_FEATURE', gates: LPF_MODE_FEATURE, table: FILTER_MODES, at: /@lpfMode$/ },
  { name: 'SOURCE_FEATURE', gates: SOURCE_FEATURE as Record<string, string>, table: PATCH_SOURCES, at: /@(source|patchAmountFrom(Second)?Source)$/ },
  {
    name: 'DEST_FEATURE',
    gates: DEST_FEATURE,
    table: [...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS],
    at: /\/patchCable(\[\d+\])?@destination$/,
  },
  {
    name: 'UNPATCHED_KNOB_FEATURE',
    gates: UNPATCHED_KNOB_FEATURE,
    table: [...UNPATCHED_SOUND_PARAMS, ...UNPATCHED_SHARED_PARAMS],
    at: /\/modKnob(\[\d+\])?@controlsParam$/,
  },
  // `<defaultParams>` attributes: the *name* is what a firmware can or can't
  // write, so the "value" the gate sees is the attribute, not its hex.
  { name: 'PARAM_ATTR_FEATURE', gates: PARAM_ATTR_FEATURE, table: [...SOUND_PARAM_ATTRS, ...KIT_PARAM_ATTRS], at: /defaultParams@/ },
]

/** The values (or attribute names, for `PARAM_ATTR_FEATURE`) a fixture carries at the gate's paths. */
function valuesAt(text: string, gate: (typeof GATES)[number]): Set<string> {
  const out = new Set<string>()
  for (const [path, value] of flattenXML(text)) {
    if (!gate.at.test(path)) continue
    out.add(gate.name === 'PARAM_ATTR_FEATURE' ? path.slice(path.lastIndexOf('@') + 1) : value)
  }
  return out
}

const fixtures = allFixtures()
const officialFixtures = fixtures.filter(([name]) => name.startsWith('official-'))
const communityFixtures = fixtures.filter(([name]) => !name.startsWith('official-'))

describe('the gate maps against the feature table', () => {
  it('every gated value names a FEATURES entry', () => {
    const unknown: string[] = []
    for (const { name, gates } of GATES) {
      for (const [value, feature] of Object.entries(gates)) {
        if (!(feature in FEATURES)) unknown.push(`${name}.${value} → ${feature}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('every gated value is a value its table has, so a renamed string cannot leave a stale gate behind', () => {
    const stray: string[] = []
    for (const { name, gates, table } of GATES) {
      for (const value of Object.keys(gates)) if (!table.includes(value)) stray.push(`${name}.${value}`)
    }
    expect(stray).toEqual([])
  })

  it('no gated feature exists on official firmware: a gate is the community line', () => {
    // A value the official serialiser wrote would have no entry at all
    // (`gates.ts`: "absent from a map is ungated: official 4.1.4 already wrote it").
    const onOfficial: string[] = []
    for (const { name, gates } of GATES) {
      for (const [value, feature] of Object.entries(gates)) if (official414(feature)) onOfficial.push(`${name}.${value}`)
    }
    expect(onOfficial).toEqual([])
    // and every one of them is honoured by the current community line
    for (const { gates } of GATES) for (const value of Object.keys(gates)) expect(gateAllows(gates, value, community130)).toBe(true)
  })

  it('the HPF mode list is the tail of the filter table, from SVF_Band', () => {
    // `kFirstHPFMode = SVF_BAND` (filter_config.h): the HPF menu starts where
    // the ladder LPF modes end, and every HPF mode is a filter-table string.
    expect([...HPF_MODES]).toEqual(FILTER_MODES.slice(FILTER_MODES.indexOf('SVF_Band')))
  })
})

describe('the gates against what firmware wrote', () => {
  it('every value in an official-firmware fixture passes the 4.1.4 gate', () => {
    expect(officialFixtures.length).toBeGreaterThan(0)
    const refused: string[] = []
    for (const [fixture, text] of officialFixtures) {
      for (const gate of GATES) {
        for (const value of valuesAt(text, gate)) {
          if (!gateAllows(gate.gates, value, official414)) refused.push(`${fixture}: ${gate.name} refuses ${value}`)
        }
      }
    }
    expect(refused).toEqual([])
  })

  it('no gated value appears in any official-firmware fixture', () => {
    // The converse: a gate on a value official firmware wrote would hide a
    // control that firmware honours.
    const written: string[] = []
    for (const [fixture, text] of officialFixtures) {
      for (const gate of GATES) {
        for (const value of valuesAt(text, gate)) if (value in gate.gates) written.push(`${fixture}: ${value}`)
      }
    }
    expect(written).toEqual([])
  })

  it('says which gated values no firmware-written file exercises yet', () => {
    // A transcription typo in a gated string would pass every other test
    // here. This list is the capture debt (`docs/audit-results.md` §8,
    // "Enum values no fixture writes"); it shrinks as fixtures land and
    // must never grow.
    const unexercised: string[] = []
    for (const gate of GATES) {
      if (gate.name === 'PARAM_ATTR_FEATURE') continue
      const seen = new Set<string>()
      for (const [, text] of communityFixtures) for (const v of valuesAt(text, gate)) seen.add(v)
      for (const value of Object.keys(gate.gates)) if (!seen.has(value)) unexercised.push(`${gate.name}.${value}`)
    }
    expect(unexercised).toEqual([
      'SOURCE_FEATURE.lfo3',
      'SOURCE_FEATURE.lfo4',
      'SOURCE_FEATURE.envelope3',
      'SOURCE_FEATURE.envelope4',
      'DEST_FEATURE.lpfMorph',
      'DEST_FEATURE.hpfMorph',
      'DEST_FEATURE.waveFold',
      'DEST_FEATURE.lfo3Rate',
      'DEST_FEATURE.lfo4Rate',
      'DEST_FEATURE.env3Attack',
      'DEST_FEATURE.env3Decay',
      'DEST_FEATURE.env3Sustain',
      'DEST_FEATURE.env3Release',
      'DEST_FEATURE.env4Attack',
      'DEST_FEATURE.env4Decay',
      'DEST_FEATURE.env4Sustain',
      'DEST_FEATURE.env4Release',
      'UNPATCHED_KNOB_FEATURE.compressorThreshold',
      'UNPATCHED_KNOB_FEATURE.ratchetProbability',
      'UNPATCHED_KNOB_FEATURE.ratchetAmount',
      'UNPATCHED_KNOB_FEATURE.sequenceLength',
      'UNPATCHED_KNOB_FEATURE.rhythm',
      'UNPATCHED_KNOB_FEATURE.bassProbability',
      'UNPATCHED_KNOB_FEATURE.chordProbability',
      'UNPATCHED_KNOB_FEATURE.chordPolyphony',
      'UNPATCHED_KNOB_FEATURE.reverseProbability',
      'UNPATCHED_KNOB_FEATURE.glideProbability',
      'UNPATCHED_KNOB_FEATURE.swapProbability',
      'UNPATCHED_KNOB_FEATURE.spreadVelocity',
      'UNPATCHED_KNOB_FEATURE.spreadGate',
      'UNPATCHED_KNOB_FEATURE.spreadOctave',
    ])
  })
})
