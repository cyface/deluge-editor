/**
 * The select lists are built from the firmware string tables and the gates:
 * every value offered must be a string the firmware reads, every option must
 * have a label, and gating must only ever remove entries.
 */
import { describe, expect, it } from 'vitest'
import { supports } from '../core/firmware/features'
import {
  DEST_FEATURE,
  LFO_TYPE_FEATURE,
  LPF_MODE_FEATURE,
  MOD_FX_FEATURE,
  OSC_TYPE_FEATURE,
  SOURCE_FEATURE,
  UNPATCHED_KNOB_FEATURE,
} from '../core/firmware/gates'
import { parseVersion } from '../core/firmware/version'
import { SYNC_LEVELS, SYNC_TYPES } from '../core/params/sync'
import {
  ARP_MODES,
  ARP_MPE_SOURCES,
  ARP_NOTE_MODES,
  ARP_OCTAVE_MODES,
  FILTER_MODES,
  FILTER_ROUTES,
  LFO_TYPES,
  LOOP_MODE,
  MOD_FX_TYPES,
  OLD_ARP_MODES,
  OSC_TYPES,
  PARAM_NAMES,
  PATCHED_GLOBAL_PARAMS,
  PATCHED_LOCAL_PARAMS,
  PATCH_SOURCES,
  POLYPHONY_MODES,
  SYNTH_MODES,
  VOICE_PRIORITY_NAMES,
} from '../core/preset'
import {
  arpModeOptions,
  arpMpeOptions,
  arpNoteModeOptions,
  arpOctaveModeOptions,
  destinationOptions,
  hpfModeOptions,
  isPatchableDestination,
  knobParamOptions,
  lfoTypeOptions,
  loopModeOptions,
  lpfModeOptions,
  modFxOptions,
  oldArpModeOptions,
  oscTypeOptions,
  polyphonyOptions,
  routeOptions,
  sourceOptions,
  syncLevelOptions,
  syncTypeOptions,
  synthModeOptions,
  voicePriorityOptions,
  type Option,
} from './options'

const everything = () => true
const nothing = () => false
const official = (f: string) => supports(parseVersion('4.1.4'), f)
const community = (f: string) => supports(parseVersion('c1.3.0'), f)

/** Every builder, the table its values come from, and the gate map (if any) that thins it. */
const BUILDERS: { name: string; build: (s: (f: string) => boolean) => Option[]; table: readonly string[]; gates?: Record<string, string> }[] = [
  { name: 'oscTypeOptions', build: oscTypeOptions, table: OSC_TYPES, gates: OSC_TYPE_FEATURE },
  { name: 'lfoTypeOptions', build: lfoTypeOptions, table: LFO_TYPES, gates: LFO_TYPE_FEATURE },
  { name: 'modFxOptions', build: modFxOptions, table: MOD_FX_TYPES, gates: MOD_FX_FEATURE },
  { name: 'lpfModeOptions', build: lpfModeOptions, table: FILTER_MODES, gates: LPF_MODE_FEATURE },
  { name: 'hpfModeOptions', build: hpfModeOptions, table: FILTER_MODES },
  { name: 'routeOptions', build: routeOptions, table: FILTER_ROUTES },
  { name: 'polyphonyOptions', build: polyphonyOptions, table: POLYPHONY_MODES },
  { name: 'synthModeOptions', build: synthModeOptions, table: SYNTH_MODES },
  { name: 'voicePriorityOptions', build: voicePriorityOptions, table: Object.keys(VOICE_PRIORITY_NAMES) },
  { name: 'loopModeOptions', build: loopModeOptions, table: Object.values(LOOP_MODE) },
  { name: 'syncLevelOptions', build: syncLevelOptions, table: SYNC_LEVELS.map((o) => o.value) },
  { name: 'syncTypeOptions', build: syncTypeOptions, table: SYNC_TYPES.map((o) => o.value) },
  { name: 'oldArpModeOptions', build: oldArpModeOptions, table: OLD_ARP_MODES },
  { name: 'arpModeOptions', build: arpModeOptions, table: ARP_MODES },
  { name: 'arpNoteModeOptions', build: arpNoteModeOptions, table: ARP_NOTE_MODES },
  { name: 'arpOctaveModeOptions', build: arpOctaveModeOptions, table: ARP_OCTAVE_MODES },
  { name: 'arpMpeOptions', build: arpMpeOptions, table: ARP_MPE_SOURCES },
  { name: 'sourceOptions', build: sourceOptions, table: PATCH_SOURCES, gates: SOURCE_FEATURE as Record<string, string> },
  { name: 'destinationOptions', build: destinationOptions, table: [...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS], gates: DEST_FEATURE },
  { name: 'knobParamOptions', build: knobParamOptions, table: PARAM_NAMES, gates: { ...DEST_FEATURE, ...UNPATCHED_KNOB_FEATURE } },
]

describe('option lists', () => {
  for (const { name, build, table, gates } of BUILDERS) {
    describe(name, () => {
      it('offers only strings from its firmware table, each with a label, none twice', () => {
        const opts = build(everything)
        expect(opts.length).toBeGreaterThan(0)
        expect(opts.filter((o) => !table.includes(o.value)).map((o) => o.value)).toEqual([])
        expect(opts.filter((o) => !o.label.trim()).map((o) => o.value)).toEqual([])
        expect(new Set(opts.map((o) => o.value)).size).toBe(opts.length)
      })

      it('gating removes entries and never adds or reorders them', () => {
        const all = build(everything).map((o) => o.value)
        for (const s of [nothing, official, community]) {
          const some = build(s).map((o) => o.value)
          expect(some.every((v) => all.includes(v))).toBe(true)
          expect(some).toEqual(all.filter((v) => some.includes(v))) // same order
        }
      })

      if (gates) {
        it('offers a gated value exactly when the firmware supports its feature', () => {
          for (const s of [nothing, official, community]) {
            const offered = new Set(build(s).map((o) => o.value))
            for (const [value, feature] of Object.entries(gates)) {
              if (!build(everything).some((o) => o.value === value)) continue // excluded for another reason (HPLadder, volume)
              expect(offered.has(value), `${value} under ${feature}`).toBe(s(feature))
            }
          }
        })
      }
    })
  }

  it('the LPF list never offers HPLadder, and the HPF list starts at SVF_Band', () => {
    // `lpfTypeToString` stops at the SVFs; `kFirstHPFMode = SVF_BAND`.
    expect(lpfModeOptions(everything).map((o) => o.value)).not.toContain('HPLadder')
    expect(hpfModeOptions().map((o) => o.value)).toEqual(['SVF_Band', 'SVF_Notch', 'HPLadder', 'Off'])
  })

  it('the gold-knob list offers one volume, the canonical volumePostFX', () => {
    const values = knobParamOptions(everything).map((o) => o.value)
    expect(values).toContain('volumePostFX')
    expect(values).not.toContain('volume')
    expect(values).not.toContain('volumePostReverbSend')
  })

  it('a cable may end only at a patched param the firmware has', () => {
    expect(isPatchableDestination('lpfFrequency', nothing)).toBe(true)
    expect(isPatchableDestination('lpfMorph', official)).toBe(false)
    expect(isPatchableDestination('lpfMorph', community)).toBe(true)
    expect(isPatchableDestination('portamento', everything)).toBe(false) // unpatched: no cables
    expect(isPatchableDestination('notAParam', everything)).toBe(false)
  })
})
