/**
 * The flow blocks. Each is a group of controls, not a firmware primitive: all
 * oscillators in one, delay with reverb, envelopes with LFOs. `owns` maps
 * parameter names (as cables and knobs refer to them) to the block that
 * shows them, for the modulation pips and "what does LFO 2 drive".
 */

import { child } from '../core/xml/element'
import {
  FILTER_MODE_SHORT,
  MOD_FX_NAMES,
  OSC_TYPE_SHORT,
  POLYPHONY_NAMES,
  paramLabel,
  envelopeIsStock,
  lfoIsStock,
  modKnobDeviations,
  type ParamName,
  type SoundElement,
} from '../core/preset'
import { syncLevelName } from '../core/params/sync'
import { cables, modKnobs, osc, paramMenu } from '../core/preset/sound'
import { editor } from './state/editor.svelte'

export type Lane = 'src' | 'chain' | 'mod'

export interface Group {
  id: string
  name: string
  short: string
  /** CSS custom property holding the block colour. */
  color: string
  lane: Lane
  /** Inner SVG for a 22×24 icon. */
  icon: string
  owns: readonly ParamName[]
  /** One line for the collapsed chip. */
  summary: (s: SoundElement) => string
  /** A few characters under the flow block. */
  value: (s: SoundElement) => string
  /** Full-width panel above the masonry. */
  wide?: boolean
}

const IC = {
  saw: '<path d="M2 18 L10 6 L10 18 L18 6 L18 18"/>',
  stack: '<path d="M3 8 h14 M3 12 h14 M3 16 h14"/><circle cx="19" cy="8" r="1.4"/>',
  filter: '<path d="M2 9 h5.4 c2.2 0 2.4 -2.6 3.6 -2.6 c1.5 0 2.3 3.6 3.3 6.6 c.9 2.6 2.1 4 5.7 4"/>',
  chorus: '<path d="M2 9 Q6 3 10 9 T18 9"/><path d="M2 15 Q6 9 10 15 T18 15" opacity=".5"/>',
  crush: '<path d="M2 15 h3 v-5 h3 v8 h3 v-10 h3 v7 h3 v-4 h3"/>',
  delay: '<path d="M3 5 v14"/><path d="M8 8 v8" opacity=".7"/><path d="M13 10 v4" opacity=".45"/><path d="M18 11 v2" opacity=".25"/>',
  out: '<path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 z"/><path d="M17 9 a4 4 0 0 1 0 6"/>',
  env: '<path d="M2 18 L6 4 L9 12 L14 12 L18 18"/>',
  matrix: '<path d="M4 4 h14 M4 10 h14 M4 16 h14 M7 2 v18 M13 2 v18" opacity=".6"/><circle cx="7" cy="10" r="2"/><circle cx="13" cy="16" r="2"/>',
  arp: '<path d="M3 17 h3 v-4 h3 v-4 h3 v-4 h3 v12"/>',
  gold: '<circle cx="10" cy="12" r="7"/><path d="M10 12 L13 8"/>',
  kit: '<path d="M3 5 h14 v14 H3 z M3 12 h14 M10 5 v14"/>',
}

const uni = (s: SoundElement) => Number(child(s, 'unison')?.attrs.num ?? 1)
const n = (v: number | undefined) => (v === undefined ? '—' : String(v))

export const GROUPS: readonly Group[] = [
  {
    id: 'osc',
    name: 'Oscillators',
    short: 'OSC',
    color: '--osc',
    lane: 'src',
    icon: IC.saw,
    owns: [
      'oscAVolume', 'oscBVolume', 'noiseVolume', 'oscAPitch', 'oscBPitch', 'oscAPhaseWidth', 'oscBPhaseWidth',
      'oscAWavetablePosition', 'oscBWavetablePosition', 'modulator1Volume', 'modulator2Volume',
      'modulator1Pitch', 'modulator2Pitch', 'modulator1Feedback', 'modulator2Feedback',
      'carrier1Feedback', 'carrier2Feedback',
    ],
    summary: (s) => {
      if (s.attrs.mode === 'fm') return 'FM · 2 carriers, 2 modulators'
      const a = osc(s, 1)?.attrs.type
      const b = osc(s, 2)?.attrs.type
      const bits = [a ? OSC_TYPE_SHORT[a] : 'SAW', b ? OSC_TYPE_SHORT[b] : 'SAW']
      if (s.attrs.mode === 'ringmod') return `${bits[0]} × ${bits[1]} ring mod`
      const noise = paramMenu(s, 'noiseVolume') ?? 0
      return `${bits.join(' + ')}${noise > 0 ? ` + noise ${noise}` : ''}`
    },
    value: (s) => (s.attrs.mode === 'fm' ? 'FM' : (OSC_TYPE_SHORT[osc(s, 1)?.attrs.type ?? 'square'] ?? '')),
  },
  {
    id: 'voice',
    name: 'Voice',
    short: 'VCE',
    color: '--osc',
    lane: 'chain',
    icon: IC.stack,
    owns: ['pitch', 'portamento'],
    summary: (s) =>
      `${POLYPHONY_NAMES[s.attrs.polyphonic ?? 'poly'] ?? s.attrs.polyphonic}${s.attrs.maxVoices ? ` ${s.attrs.maxVoices}v` : ''}` +
      `${uni(s) > 1 ? ` · unison ${uni(s)}` : ''}${Number(s.attrs.transpose ?? 0) ? ` · ${s.attrs.transpose} st` : ''}`,
    value: (s) => `${uni(s)}×`,
  },
  {
    id: 'filters',
    name: 'Filters',
    short: 'FLT',
    color: '--flt',
    lane: 'chain',
    icon: IC.filter,
    owns: ['lpfFrequency', 'lpfResonance', 'lpfMorph', 'hpfFrequency', 'hpfResonance', 'hpfMorph', 'waveFold'],
    wide: true,
    summary: (s) => {
      const lpf = s.attrs.lpfMode ?? '24dB'
      const hpf = paramMenu(s, 'hpfFrequency') ?? 0
      const out = [lpf === 'Off' ? 'LPF off' : `${FILTER_MODE_SHORT[lpf] ?? lpf} ${n(paramMenu(s, 'lpfFrequency'))} · res ${n(paramMenu(s, 'lpfResonance'))}`]
      if ((s.attrs.hpfMode ?? 'HPLadder') !== 'Off' && hpf > 0) out.push(`HPF ${hpf}`)
      if (s.attrs.filterRoute === 'PARA') out.push('parallel')
      return out.join(' · ')
    },
    value: (s) => ((s.attrs.lpfMode ?? '24dB') === 'Off' ? 'off' : n(paramMenu(s, 'lpfFrequency'))),
  },
  {
    id: 'modfx',
    name: 'Mod FX',
    short: 'MFX',
    color: '--fx',
    lane: 'chain',
    icon: IC.chorus,
    owns: ['modFXRate', 'modFXDepth', 'modFXOffset', 'modFXFeedback'],
    summary: (s) => {
      const t = s.attrs.modFXType ?? 'none'
      return t === 'none' ? 'off' : `${MOD_FX_NAMES[t] ?? t} · depth ${n(paramMenu(s, 'modFXDepth'))} · rate ${n(paramMenu(s, 'modFXRate'))}`
    },
    value: (s) => ((s.attrs.modFXType ?? 'none') === 'none' ? 'off' : n(paramMenu(s, 'modFXDepth'))),
  },
  {
    id: 'dist',
    name: 'Distortion',
    short: 'DST',
    color: '--fx',
    lane: 'chain',
    icon: IC.crush,
    owns: ['bitcrushAmount', 'sampleRateReduction'],
    summary: (s) => {
      const c = paramMenu(s, 'bitCrush') ?? 0
      const d = paramMenu(s, 'sampleRateReduction') ?? 0
      return c || d ? `bitcrush ${c} · decimation ${d}` : 'clean'
    },
    value: (s) => {
      const c = paramMenu(s, 'bitCrush') ?? 0
      const d = paramMenu(s, 'sampleRateReduction') ?? 0
      return c || d ? String(Math.max(c, d)) : 'off'
    },
  },
  {
    id: 'delay',
    name: 'Delay & Reverb',
    short: 'DLY',
    color: '--fx',
    lane: 'chain',
    icon: IC.delay,
    owns: ['delayRate', 'delayFeedback', 'reverbAmount'],
    summary: (s) => {
      const fb = paramMenu(s, 'delayFeedback') ?? 0
      const d = child(s, 'delay')
      const rv = paramMenu(s, 'reverbAmount') ?? 0
      return `${fb > 0 ? `delay ${syncLevelName(d?.attrs.syncLevel)} fb ${fb}${d?.attrs.pingPong === '1' ? ' ping-pong' : ''}` : 'no delay'} · reverb ${rv}`
    },
    value: (s) => n(paramMenu(s, 'reverbAmount')),
  },
  {
    id: 'out',
    name: 'Output',
    short: 'OUT',
    color: '--mst',
    lane: 'chain',
    icon: IC.out,
    owns: [
      'volume', 'volumePostFX', 'pan', 'volumePostReverbSend', 'bass', 'treble', 'bassFreq', 'trebleFreq',
      'compressorThreshold', 'compressorShape', 'stutterRate',
    ],
    summary: (s) => {
      const pan = paramMenu(s, 'pan') ?? 0
      return `volume ${n(paramMenu(s, 'volume'))} · pan ${pan === 0 ? 'centre' : pan < 0 ? `L${-pan}` : `R${pan}`}` +
        `${child(s, 'audioCompressor') && Number(child(s, 'audioCompressor')?.attrs.thresh) > 0 ? ' · compressed' : ''}`
    },
    value: (s) => n(paramMenu(s, 'volume')),
  },
  {
    id: 'mods',
    name: 'Envelopes & LFOs',
    short: 'ENV',
    color: '--env',
    lane: 'mod',
    icon: IC.env,
    owns: [
      'env1Attack', 'env1Decay', 'env1Sustain', 'env1Release', 'env2Attack', 'env2Decay', 'env2Sustain', 'env2Release',
      'env3Attack', 'env3Decay', 'env3Sustain', 'env3Release', 'env4Attack', 'env4Decay', 'env4Sustain', 'env4Release',
      'lfo1Rate', 'lfo2Rate', 'lfo3Rate', 'lfo4Rate',
    ],
    summary: (s) => {
      const off: string[] = []
      for (const i of [1, 2, 3, 4] as const) if (!envelopeIsStock(s, i)) off.push(`env ${i}`)
      for (const i of [1, 2, 3, 4] as const) if (!lfoIsStock(s, i)) off.push(`LFO ${i}`)
      return off.length ? `${off.join(', ')} non-standard` : 'stock'
    },
    value: (s) => `${cables(s).filter((c) => /^(lfo|envelope)/.test(c.attrs.source ?? '')).length}⇢`,
  },
  {
    id: 'cables',
    name: 'Mod Matrix',
    short: 'MTX',
    color: '--mod',
    lane: 'mod',
    icon: IC.matrix,
    owns: [],
    summary: (s) => {
      const c = cables(s)
      return c.length ? `${c.length} cable${c.length === 1 ? '' : 's'}` : 'no cables'
    },
    value: (s) => String(cables(s).length),
  },
  {
    id: 'arp',
    name: 'Arpeggiator',
    short: 'ARP',
    color: '--arp',
    lane: 'mod',
    icon: IC.arp,
    owns: [
      'arpRate', 'arpGate', 'noteProbability', 'bassProbability', 'swapProbability', 'glideProbability',
      'reverseProbability', 'chordProbability', 'chordPolyphony', 'ratchetProbability', 'ratchetAmount',
      'sequenceLength', 'rhythm', 'spreadVelocity', 'spreadGate', 'spreadOctave',
    ],
    summary: (s) => {
      const a = child(s, 'arpeggiator')
      const mode = a?.attrs.arpMode ?? a?.attrs.mode ?? 'off'
      if (mode === 'off') return 'off'
      return `${mode}${a?.attrs.noteMode ? ` ${a.attrs.noteMode}` : ''} · ${syncLevelName(a?.attrs.syncLevel)} · ${a?.attrs.numOctaves ?? 1} oct`
    },
    value: (s) => {
      const a = child(s, 'arpeggiator')
      return (a?.attrs.arpMode ?? a?.attrs.mode ?? 'off') === 'off' ? 'off' : 'on'
    },
  },
  {
    id: 'gold',
    name: 'Gold Knobs',
    short: 'GLD',
    color: '--mst',
    lane: 'mod',
    icon: IC.gold,
    owns: [],
    summary: (s) => {
      if (modKnobs(s).length === 0) return 'firmware defaults'
      const dev = modKnobDeviations(s)
      if (dev.length === 0) return 'stock assignments'
      const names = dev.slice(0, 3).map((x) => paramLabel(x.attrs.controlsParam ?? '?')).join(', ')
      return `${dev.length} reassigned · ${names}${dev.length > 3 ? '…' : ''}`
    },
    value: (s) => {
      const dev = modKnobDeviations(s).length
      return dev ? String(dev) : 'std'
    },
  },
]

export const KIT_GROUP: Group = {
  id: 'kit',
  name: 'Kit Bus',
  short: 'KIT',
  color: '--mst',
  lane: 'chain',
  icon: IC.kit,
  owns: [],
  summary: () => 'kit-level filters, effects and sidechain',
  value: () => 'kit',
}

export const groupById = (id: string): Group | undefined =>
  id === 'kit' ? KIT_GROUP : GROUPS.find((g) => g.id === id)

const OWNER = new Map<string, Group>()
for (const g of GROUPS) for (const p of g.owns) OWNER.set(p, g)

/** The block that shows `param` (a cable destination or knob target). */
export const groupOf = (param: string | undefined): Group | undefined =>
  param === undefined ? undefined : OWNER.get(param)

/** The groups shown for the current preset. */
export function visibleGroups(): Group[] {
  return editor.preset?.tag === 'kit' ? [...GROUPS, KIT_GROUP] : [...GROUPS]
}
