/**
 * Human wording for one entry of a flattened diff, so the Changes dock can
 * say "Env 1 Attack: 21 → 34" instead of
 * "sound/defaultParams/envelope1@attack: 0x947AE144 → 0xEB851EA5".
 *
 * Labels reuse the names the controls already use (`names.ts`); values go
 * through the same firmware arithmetic as the knobs (`params/scale.ts`), so
 * a change reads in the Deluge's own numbers. Anything unrecognised falls
 * back to the raw path or string — never hide a change just because it has
 * no pretty name.
 */

import { hexToInt, isHexParam } from '../params/hex'
import {
  blendToKnob,
  cableToMenu,
  compressorToKnob,
  formatCable,
  halfToMenu,
  panToMenu,
  sidechainAttackToMenu,
  sidechainReleaseToMenu,
  standardToMenu,
} from '../params/scale'
import type { FlatXML } from '../xml/flatten'
import { parseSegment } from '../xml/path'
import {
  ARP_MODE_NAMES,
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
  PATCH_SOURCE_NAMES,
  paramLabel,
  POLARITY_NAMES,
  POLYPHONY_NAMES,
  SYNTH_MODE_NAMES,
  VOICE_PRIORITY_NAMES,
} from './names'

/** Container segments with a spoken name; '' means the segment says nothing ("defaultParams"). */
const SEG_LABELS: Record<string, string> = {
  defaultParams: '',
  patchCables: '',
  soundSources: '',
  sampleRanges: '',
  osc1: 'Osc A',
  osc2: 'Osc B',
  lfo1: 'LFO 1',
  lfo2: 'LFO 2',
  lfo3: 'LFO 3',
  lfo4: 'LFO 4',
  envelope1: 'Env 1',
  envelope2: 'Env 2',
  envelope3: 'Env 3',
  envelope4: 'Env 4',
  modulator1: 'FM Mod 1',
  modulator2: 'FM Mod 2',
  unison: 'Unison',
  delay: 'Delay',
  arpeggiator: 'Arp',
  compressor: 'Sidechain',
  sidechain: 'Sidechain',
  audioCompressor: 'Compressor',
  equalizer: 'EQ',
  stutter: 'Stutter',
  midiOutput: 'MIDI Out',
  midiKnobs: 'MIDI Knobs',
  sample: 'Sample',
  sampleRange: 'Range',
  zone: 'Zone',
  lpf: 'LPF',
  hpf: 'HPF',
  depthControlledBy: 'Depth',
}

/** Attribute names whose generic camel-case split reads wrong or too raw. */
const ATTR_LABELS: Record<string, string> = {
  firmwareVersion: 'Firmware Version',
  earliestCompatibleFirmware: 'Earliest Compatible Firmware',
  polyphonic: 'Polyphony',
  voicePriority: 'Voice Priority',
  sideChainSend: 'Sidechain Send',
  mode: 'Mode',
  lpfMode: 'LPF Mode',
  hpfMode: 'HPF Mode',
  filterRoute: 'Filter Route',
  modFXType: 'Mod FX',
  clippingAmount: 'Saturation',
  num: 'Voices',
  transpose: 'Transpose',
  cents: 'Cents',
  oscillatorSync: 'Osc Sync',
  retrigPhase: 'Retrig Phase',
  timeStretchEnable: 'Time Stretch',
  timeStretchAmount: 'Time Stretch Amount',
  linearInterpolation: 'Linear Interpolation',
  noteForDrum: 'Note',
  numOctaves: 'Octaves',
  stepRepeat: 'Step Repeat',
  mpeVelocity: 'MPE Velocity',
  compHPF: 'Side HPF',
  compBlend: 'Blend',
  thresh: 'Threshold',
}

const ACRONYMS = new Set(['lpf', 'hpf', 'fx', 'eq', 'midi', 'mpe', 'dx7'])

/** camelCase → Title Case with the audio acronyms kept upper. */
const prettyAttr = (a: string): string =>
  ATTR_LABELS[a] ??
  a
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')

/** The tag of a path segment, or undefined when it isn't one. */
const tagOf = (seg: string | undefined): string | undefined => (seg === undefined ? undefined : parseSegment(seg)?.tag)

const CABLE_ATTR_WORDS: Record<string, string> = {
  amount: 'Amount',
  polarity: 'Polarity',
  source: 'Source',
  destination: 'Destination',
  rangeAdjustable: 'Range Adjustable',
}

/** First map that knows the path wins; the maps are the flattened output and source. */
const lookup = (path: string, maps: Array<FlatXML | null | undefined>): string | undefined => {
  for (const m of maps) {
    const v = m?.get(path)
    if (v !== undefined) return v
  }
  return undefined
}

/** "LFO 1 → Pitch": a patch cable names itself by what it connects. */
const cableLabel = (prefix: string, segs: string[], maps: Array<FlatXML | null | undefined>): string => {
  const src = lookup(`${prefix}@source`, maps)
  const dst = lookup(`${prefix}@destination`, maps)
  const from = src ? (PATCH_SOURCE_NAMES[src as keyof typeof PATCH_SOURCE_NAMES] ?? src) : '?'
  const to = dst ? paramLabel(dst) : '?'
  const outer = segs.some((s) => tagOf(s) === 'depthControlledBy') ? 'Depth of ' : ''
  return `${outer}${from} → ${to}`
}

/** The container segments as spoken words, or null when one fails to parse. */
function segmentWords(segs: string[]): string[] | null {
  const words: string[] = []
  for (let i = 0; i < segs.length; i++) {
    const m = parseSegment(segs[i])
    if (!m) return null
    if (m.tag === 'soundSources') continue
    const prev = i > 0 ? tagOf(segs[i - 1]) : undefined
    if (prev === 'soundSources') {
      words.push(`Row ${(m.index ?? 0) + 1}`) // a kit row, whatever its tag
      continue
    }
    const name = SEG_LABELS[m.tag] ?? prettyAttr(m.tag)
    if (name) words.push(m.index !== undefined && !(m.tag in SEG_LABELS) ? `${name} ${m.index + 1}` : name)
  }
  return words
}

/**
 * "Env 1 Attack", "LFO 1 → Pitch · Amount", "Osc A Transpose". `maps` (the
 * flattened output and/or source) let a patch cable's row name its source
 * and destination.
 */
export function describeChangePath(path: string, ...maps: Array<FlatXML | null | undefined>): string {
  const at = path.lastIndexOf('@')
  if (at < 0) return path
  const attr = path.slice(at + 1)
  const segs = path.slice(0, at).split('/').slice(1) // drop the root: it is the whole file

  const last = segs[segs.length - 1]
  const lastTag = tagOf(last)

  if (lastTag === 'patchCable') {
    return `${cableLabel(path.slice(0, at), segs, maps)} · ${CABLE_ATTR_WORDS[attr] ?? prettyAttr(attr)}`
  }

  // A gold-knob slot is positional: 8 pages × 2 knobs, bottom written first.
  if (lastTag === 'modKnob') {
    const i = parseSegment(last)?.index ?? 0
    return `Gold Knob · page ${Math.floor(i / 2) + 1} ${i % 2 ? 'top' : 'bottom'} · ${prettyAttr(attr)}`
  }

  const words = segmentWords(segs)
  if (words === null) return path

  // A <defaultParams> or <equalizer> attribute is a param the knobs already label.
  const isParam = lastTag === 'defaultParams' || lastTag === 'equalizer'
  return [...words, isParam ? paramLabel(attr) : prettyAttr(attr)].join(' ')
}

/**
 * A whole element, for a collapsed diff group: "Row 4", "Osc A Range 2",
 * "LFO 2 → Pan" for a patch cable. `maps` as in `describeChangePath`.
 */
export function describeElementPath(path: string, ...maps: Array<FlatXML | null | undefined>): string {
  const segs = path.split('/').slice(1)
  if (tagOf(segs[segs.length - 1]) === 'patchCable') return cableLabel(path, segs, maps)
  const words = segmentWords(segs)
  return words === null || words.length === 0 ? path : words.join(' ')
}

/**
 * `arpeggiator@mode` held the old direction names before community 1.1 and
 * holds the on/off pair since (`enums.ts`); a diff can show either.
 */
const ANY_ARP_MODE_NAMES: Record<string, string> = { ...OLD_ARP_MODE_NAMES, ...ARP_MODE_NAMES }

/** The enum name table for this attribute, if it has one. */
function enumTable(seg: string | undefined, attr: string): Record<string, string> | undefined {
  if (attr === 'type' && seg?.startsWith('osc')) return OSC_TYPE_NAMES
  if (attr === 'type' && seg?.startsWith('lfo')) return LFO_TYPE_NAMES
  if (attr === 'lpfMode' || attr === 'hpfMode') return FILTER_MODE_NAMES
  if (attr === 'filterRoute') return FILTER_ROUTE_NAMES
  if (attr === 'modFXType') return MOD_FX_NAMES
  if (attr === 'polyphonic') return POLYPHONY_NAMES
  if (attr === 'polarity') return POLARITY_NAMES
  if (attr === 'voicePriority') return VOICE_PRIORITY_NAMES
  if (attr === 'loopMode') return LOOP_MODE_NAMES
  if (attr === 'mode' && seg === 'arpeggiator') return ANY_ARP_MODE_NAMES
  if (attr === 'arpMode' && seg === 'arpeggiator') return ARP_MODE_NAMES
  if (attr === 'noteMode') return ARP_NOTE_MODE_NAMES
  if (attr === 'octaveMode') return ARP_OCTAVE_MODE_NAMES
  if (attr === 'mpeVelocity') return ARP_MPE_NAMES
  if (attr === 'mode' && seg === undefined) return SYNTH_MODE_NAMES
  if (attr === 'source' || attr === 'patchAmountFromSource') return PATCH_SOURCE_NAMES
  return undefined
}

/**
 * A value as the Deluge would show it: hex params become menu numbers
 * through the knobs' own scaling, enum strings become their control labels,
 * anything else stays verbatim.
 */
export function describeChangeValue(path: string, raw: string): string {
  const at = path.lastIndexOf('@')
  const attr = at < 0 ? '' : path.slice(at + 1)
  const segs = at < 0 ? [] : path.slice(0, at).split('/').slice(1)
  const seg = tagOf(segs[segs.length - 1])

  const table = enumTable(seg, attr)
  if (table && raw in table) return table[raw]
  if (attr === 'destination' || attr === 'controlsParam') return paramLabel(raw)

  // Sidechain and compressor store raw rates / q31 knob positions as decimal;
  // the knobs show the menu index (params/scale.ts cites the firmware tables).
  if ((seg === 'sidechain' || seg === 'compressor') && (attr === 'attack' || attr === 'release')) {
    const n = Number(raw)
    if (Number.isFinite(n)) return String(attr === 'attack' ? sidechainAttackToMenu(n) : sidechainReleaseToMenu(n))
  }
  if (seg === 'audioCompressor' && !isHexParam(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n)) return String(attr === 'compBlend' ? blendToKnob(n) : compressorToKnob(n))
  }

  if (isHexParam(raw)) {
    const v = hexToInt(raw)
    if (seg === 'patchCable' && attr === 'amount') return formatCable(cableToMenu(v))
    if (seg === 'audioCompressor') return String(compressorToKnob(v))
    if (attr === 'pan') {
      // The instrument's 7-segment pan is the magnitude with an L or R after
      // it, and nothing at centre — `Pan::drawValue` prints `abs(value)` then
      // `strcat(buffer, "L")` / `"R"` (`gui/menu_item/patched_param/pan.cpp:36-43`,
      // `beta` e7bae539); the OLED draws a signed number over a bar. The
      // editor's knob (`HexKnob.svelte`) puts the letter first and names the
      // centre, and a change reads the same way as the knob it belongs to.
      const p = panToMenu(v)
      return p === 0 ? 'CTR' : `${p < 0 ? 'L' : 'R'}${Math.abs(p)}`
    }
    if (attr === 'oscAPulseWidth' || attr === 'oscBPulseWidth' || attr === 'compressorThreshold')
      return String(halfToMenu(v))
    return String(standardToMenu(v))
  }
  return raw
}
