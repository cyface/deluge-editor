/**
 * Option lists for the selects, gated by the selected firmware. A value the
 * firmware can't honour is not offered (`docs/decisions.md`); a file that
 * already carries one still shows it (see `Select.svelte`).
 */

import { SYNC_LEVELS, SYNC_TYPES } from '../core/params/sync'
import {
  ARP_MPE_NAMES,
  ARP_NOTE_MODE_NAMES,
  ARP_OCTAVE_MODE_NAMES,
  FILTER_MODE_NAMES,
  FILTER_ROUTE_NAMES,
  LFO_TYPE_NAMES,
  LOOP_MODE_NAMES,
  MOD_FX_NAMES,
  OLD_ARP_MODE_NAMES,
  OSC_TYPE_NAMES,
  PATCHED_GLOBAL_PARAMS,
  PATCHED_LOCAL_PARAMS,
  PATCH_SOURCES,
  UNPATCHED_SHARED_PARAMS,
  UNPATCHED_SOUND_PARAMS,
  POLARITY_NAMES,
  POLYPHONY_NAMES,
  SYNTH_MODE_NAMES,
  VOICE_PRIORITY_NAMES,
  paramLabel,
  type PatchSource,
} from '../core/preset'
import {
  DEST_FEATURE,
  HPF_MODES,
  LFO_TYPE_FEATURE,
  LPF_MODE_FEATURE,
  MOD_FX_FEATURE,
  OSC_TYPE_FEATURE,
  SOURCE_FEATURE,
  UNPATCHED_KNOB_FEATURE,
  gateAllows,
} from '../core/firmware/gates'

export interface Option { value: string; label: string }
type Supports = (feature: string) => boolean

const fromRecord = (r: Record<string, string>): Option[] => Object.entries(r).map(([value, label]) => ({ value, label }))

export const oscTypeOptions = (supports: Supports): Option[] =>
  fromRecord(OSC_TYPE_NAMES).filter((o) => gateAllows(OSC_TYPE_FEATURE, o.value, supports))

export const lfoTypeOptions = (supports: Supports): Option[] =>
  fromRecord(LFO_TYPE_NAMES).filter((o) => gateAllows(LFO_TYPE_FEATURE, o.value, supports))

export const modFxOptions = (supports: Supports): Option[] =>
  fromRecord(MOD_FX_NAMES).filter((o) => gateAllows(MOD_FX_FEATURE, o.value, supports))

/** LPF modes. Official firmware: 12dB / 24dB / 24dBDrive (`lpfTypeToString`); community adds the SVFs and Off. */
export const lpfModeOptions = (supports: Supports): Option[] =>
  fromRecord(FILTER_MODE_NAMES).filter(
    (o) => o.value !== 'HPLadder' && gateAllows(LPF_MODE_FEATURE, o.value, supports),
  )

/** HPF modes start at `kFirstHPFMode = SVF_BAND`; only community firmware has the attribute at all. */
export const hpfModeOptions = (): Option[] =>
  fromRecord(FILTER_MODE_NAMES).filter((o) => (HPF_MODES as readonly string[]).includes(o.value))

export const routeOptions = (): Option[] => fromRecord(FILTER_ROUTE_NAMES)
export const polyphonyOptions = (): Option[] => fromRecord(POLYPHONY_NAMES)
export const synthModeOptions = (): Option[] => fromRecord(SYNTH_MODE_NAMES)
export const voicePriorityOptions = (): Option[] => fromRecord(VOICE_PRIORITY_NAMES)
export const loopModeOptions = (): Option[] => fromRecord(LOOP_MODE_NAMES)
export const polarityOptions = (): Option[] => fromRecord(POLARITY_NAMES)
export const syncLevelOptions = (): Option[] => [...SYNC_LEVELS]
export const syncTypeOptions = (): Option[] => [...SYNC_TYPES]
export const oldArpModeOptions = (): Option[] => fromRecord(OLD_ARP_MODE_NAMES)
export const arpModeOptions = (): Option[] => [
  { value: 'off', label: 'Off' },
  { value: 'arp', label: 'On' },
]
export const arpNoteModeOptions = (supports: Supports): Option[] =>
  fromRecord(ARP_NOTE_MODE_NAMES).filter((o) =>
    ['walk1', 'walk2', 'walk3', 'pattern'].includes(o.value) ? supports('arpWalkPattern') : true,
  )
export const arpOctaveModeOptions = (): Option[] => fromRecord(ARP_OCTAVE_MODE_NAMES)
export const arpMpeOptions = (): Option[] => fromRecord(ARP_MPE_NAMES)

export const sourceOptions = (supports: Supports): Option[] =>
  PATCH_SOURCES.filter((s) => {
    const f = SOURCE_FEATURE[s as PatchSource]
    return f === undefined || supports(f)
  }).map((value) => ({ value, label: paramLabelOfSource(value) }))

const paramLabelOfSource = (s: string): string =>
  ({ lfo1: 'LFO 1', lfo2: 'LFO 2', lfo3: 'LFO 3', lfo4: 'LFO 4', envelope1: 'Env 1', envelope2: 'Env 2', envelope3: 'Env 3', envelope4: 'Env 4', velocity: 'Velocity', note: 'Note', compressor: 'Sidechain', random: 'Random', aftertouch: 'Aftertouch', x: 'MPE X', y: 'MPE Y' })[s] ?? s

export const destinationOptions = (supports: Supports): Option[] =>
  [...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS]
    .filter((p) => DEST_FEATURE[p] === undefined || supports(DEST_FEATURE[p]))
    .map((value) => ({ value, label: paramLabel(value) }))

/**
 * Gold-knob targets: every name `paramNameForFile(Kind::UNPATCHED_SOUND, …)`
 * emits — the loader parses `controlsParam` with `allowPatched=true`
 * (sound.cpp:761), so the patched params and the unpatched sound set are all
 * legal — gated by the selected firmware. The volume family (`volume`,
 * `volumePostFX`, `volumePostReverbSend`) is one target the firmware
 * disambiguates by source (`ensureKnobReferencesCorrectVolume`), so only the
 * canonical `volumePostFX` is offered; `setModKnob` writes the right string.
 */
export const knobParamOptions = (supports: Supports): Option[] =>
  [...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS, ...UNPATCHED_SOUND_PARAMS, ...UNPATCHED_SHARED_PARAMS]
    .filter((p) => p !== 'volume' && p !== 'volumePostReverbSend')
    .filter((p) => {
      const f = DEST_FEATURE[p] ?? UNPATCHED_KNOB_FEATURE[p]
      return f === undefined || supports(f)
    })
    .map((value) => ({ value, label: paramLabel(value) }))

const PATCHABLE = new Set<string>([...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS])

/**
 * Whether a cable can end at `dest` under the selected firmware: the patched
 * params are the destinations (`src/core/preset/params.ts` cites the
 * firmware's patched-param tables); unpatched params take no cables.
 */
export const isPatchableDestination = (dest: string, supports: Supports): boolean =>
  PATCHABLE.has(dest) && (DEST_FEATURE[dest] === undefined || supports(DEST_FEATURE[dest]))
