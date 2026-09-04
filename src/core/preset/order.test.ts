/**
 * The order tables against what the firmware wrote. A loaded file keeps its
 * own order and the round trip proves that, but nothing in the round trip
 * can tell a wrong table from a right one: the tables only matter when the
 * editor *adds* an attribute or an element. So here every element in every
 * Deluge-authored fixture is held against its table — its attribute keys must
 * be a subsequence of the `*_ATTR_ORDER`, its child tags of the
 * `*_CHILD_ORDER`.
 *
 * `order.ts` is the 3f898e95 beta's layout. Other writers among the fixtures
 * (`tests/fixtures/SOURCES.md`, "Things to know when comparing captures") lay a few elements out
 * differently — `<delay>`/`<sidechain>` before `<defaultParams>`, a cable's
 * `amount` before `polarity`, the sidechain's sync attributes first,
 * `numOctaves` before `syncLevel`, `lpfMode` before `modFXType`, and two
 * other arrangements of `<defaultParams>`. Each such variance is spelled out
 * below as an alternative table, and every alternative must be one some
 * fixture actually uses, so a fixture that fits no table is a table that is
 * wrong and an alternative nothing uses is one to remove.
 *
 * Elements with no table are not checked: the single-child containers
 * (`<modKnobs>`, `<midiKnobs>`, `<patchCables>`, `<sampleRanges>`,
 * `<wavetableRanges>`, `<soundSources>`, `<depthControlledBy>`),
 * `<midiKnob>`, `<wavetableRange>`, `<selectedDrumIndex>`, and the MIDI/gate
 * drum rows themselves (`<midiOutput>`/`<gateOutput>` under `<soundSources>`;
 * the `<arpeggiator>` each carries is checked against
 * `NON_AUDIO_ARP_ATTR_ORDER`). The
 * pre-3.0 nested format folds each leaf element into an attribute in the old
 * writer's leaf order; that format is read and never written
 * (`roundtrip.test.ts`), so it is left out too.
 */
import { describe, expect, it } from 'vitest'
import { allFixtures } from '../../../tests/helpers/fixtures'
import { parseXML } from '../xml'
import type { XmlElement } from '../xml/element'
import * as O from './order'
import { KIT_PARAM_ATTRS, SOUND_PARAM_ATTRS } from './params'

/**
 * Attributes the fixtures carry that no table places. Skipped, so the order
 * of everything around them is still held; each is a gap to close in the
 * source, not a variance to allow.
 */
const UNTABLED = new Set([
  // Pre-3.2 depth modulation (`patch_cable_set.cpp:842`, "Files before V3.2
  // had this"): read, never written by the editor, so no table places it.
  'rangeAdjustable',
  // Fork-only (`local-fixes`): velocity layers and tape saturation. Stock
  // firmware never writes them, so the tables rightly have no place for them.
  'rangeTopVelocity', 'tapeSaturation', 'tapeHeadBump',
])

/** Move `name` in `order` to just after `after` (or to the front when `after` is null). */
function moved(order: readonly string[], name: string, after: string | null): string[] {
  const rest = order.filter((n) => n !== name)
  const at = after === null ? 0 : rest.indexOf(after) + 1
  return [...rest.slice(0, at), name, ...rest.slice(at)]
}

/** A named table: the one in `order.ts`, or an alternative some other writer used. */
interface Variant {
  name: string
  order: readonly string[]
}

const beta = (name: string, order: readonly string[]): Variant => ({ name: `${name} (order.ts)`, order })

/** Every element's tables, first the one the editor writes by, then the alternatives the fixtures document. */
const VARIANTS = {
  soundAttrs: [
    beta('SOUND_ATTR_ORDER', O.SOUND_ATTR_ORDER),
    // official 3.x/4.x
    { name: 'sound attrs, lpfMode before modFXType', order: moved(O.SOUND_ATTR_ORDER, 'lpfMode', 'mode') },
  ],
  soundChildren: [
    beta('SOUND_CHILD_ORDER', O.SOUND_CHILD_ORDER),
    // Tim's hardware c1.3.0 build, official 3.x/4.x
    {
      name: 'sound children, delay/sidechain before defaultParams',
      order: moved(moved(moved(O.SOUND_CHILD_ORDER, 'delay', 'unison'), 'sidechain', 'delay'), 'compressor', 'sidechain'),
    },
  ],
  sidechain: [
    beta('SIDECHAIN_ATTR_ORDER', O.SIDECHAIN_ATTR_ORDER),
    // Tim's hardware c1.3.0 build, official 3.x/4.x
    { name: 'sidechain, sync before attack/release', order: ['syncLevel', 'syncType', 'attack', 'release'] },
  ],
  cable: [
    beta('CABLE_ATTR_ORDER', O.CABLE_ATTR_ORDER),
    // Tim's hardware c1.3.0 build
    { name: 'cable, amount before polarity', order: moved(O.CABLE_ATTR_ORDER, 'amount', 'destination') },
  ],
  arp: [
    beta('ARP_ATTR_ORDER', O.ARP_ATTR_ORDER),
    // community 1.2.1, official 3.x/4.x
    { name: 'arpeggiator, numOctaves before syncLevel', order: moved(O.ARP_ATTR_ORDER, 'numOctaves', 'mode') },
  ],
  soundParams: [
    beta('SOUND_PARAM_ATTRS', SOUND_PARAM_ATTRS),
    // Tim's hardware c1.3.0 build, official 3.x/4.x: the gate first, each morph beside its filter
    {
      name: 'defaultParams, arpeggiatorGate first and morphs beside their filters',
      order: moved(
        moved(moved(moved(SOUND_PARAM_ATTRS, 'arpeggiatorGate', null), 'lpfMorph', 'lpfResonance'), 'hpfMorph', 'hpfResonance'),
        'waveFold',
        'modFXFeedback',
      ),
    },
    // community 1.2.1: the gate first, the morphs and fold after the threshold
    {
      name: 'defaultParams, arpeggiatorGate first and morphs after compressorThreshold',
      order: moved(
        moved(moved(moved(SOUND_PARAM_ATTRS, 'arpeggiatorGate', null), 'lpfMorph', 'compressorThreshold'), 'hpfMorph', 'lpfMorph'),
        'waveFold',
        'hpfMorph',
      ),
    },
  ],
} satisfies Record<string, Variant[]>

interface Rule {
  attrs?: Variant[]
  children?: Variant[]
}

const one = (name: string, order: readonly string[]): Variant[] => [beta(name, order)]

/** Which tables an element answers to, given where it sits. */
function ruleFor(el: XmlElement, parent: XmlElement | null): Rule | null {
  const under = parent?.tag
  switch (el.tag) {
    case 'sound':
      return { attrs: VARIANTS.soundAttrs, children: VARIANTS.soundChildren }
    case 'kit':
      return { attrs: one('KIT_ATTR_ORDER', O.KIT_ATTR_ORDER), children: one('KIT_CHILD_ORDER', O.KIT_CHILD_ORDER) }
    case 'osc1':
    case 'osc2':
      // A one-sample oscillator is flattened onto the element with fileName
      // before transpose/cents; every other kind writes the other way round.
      return {
        attrs:
          el.attrs.type === 'sample' && 'fileName' in el.attrs
            ? one('SAMPLE_OSC_ATTR_ORDER', O.SAMPLE_OSC_ATTR_ORDER)
            : one('OSC_ATTR_ORDER', O.OSC_ATTR_ORDER),
        children: one('OSC_CHILD_ORDER', O.OSC_CHILD_ORDER),
      }
    case 'sampleRange':
      return { attrs: one('SAMPLE_RANGE_ATTR_ORDER', O.SAMPLE_RANGE_ATTR_ORDER), children: one('zone', ['zone']) }
    case 'zone':
      return { attrs: one('ZONE_ATTR_ORDER', O.ZONE_ATTR_ORDER), children: one('none', []) }
    case 'lfo1':
    case 'lfo2':
    case 'lfo3':
    case 'lfo4':
      return { attrs: one('LFO_ATTR_ORDER', O.LFO_ATTR_ORDER), children: one('none', []) }
    case 'modulator1':
    case 'modulator2':
      return { attrs: one('MODULATOR_ATTR_ORDER', O.MODULATOR_ATTR_ORDER), children: one('none', []) }
    case 'unison':
      return { attrs: one('UNISON_ATTR_ORDER', O.UNISON_ATTR_ORDER), children: one('none', []) }
    case 'defaultParams':
      return under === 'kit'
        ? { attrs: one('KIT_PARAM_ATTRS', KIT_PARAM_ATTRS), children: one('KIT_PARAMS_CHILD_ORDER', O.KIT_PARAMS_CHILD_ORDER) }
        : { attrs: VARIANTS.soundParams, children: one('PARAMS_CHILD_ORDER', O.PARAMS_CHILD_ORDER) }
    case 'envelope1':
    case 'envelope2':
    case 'envelope3':
    case 'envelope4':
      return { attrs: one('ENVELOPE_ATTR_ORDER', O.ENVELOPE_ATTR_ORDER), children: one('none', []) }
    case 'equalizer':
      return { attrs: one('EQUALIZER_ATTR_ORDER', O.EQUALIZER_ATTR_ORDER), children: one('none', []) }
    case 'patchCable':
      return { attrs: VARIANTS.cable, children: one('depthControlledBy', ['depthControlledBy']) }
    case 'modKnob':
      return { attrs: one('MOD_KNOB_ATTR_ORDER', O.MOD_KNOB_ATTR_ORDER), children: one('none', []) }
    case 'arpeggiator':
      // A MIDI or gate drum row has no `<defaultParams>`, so its arpeggiator
      // carries `gate`, `rate` and the probabilities as attributes of its own.
      return under === 'midiOutput' || under === 'gateOutput'
        ? { attrs: one('NON_AUDIO_ARP_ATTR_ORDER', O.NON_AUDIO_ARP_ATTR_ORDER), children: one('none', []) }
        : { attrs: VARIANTS.arp, children: one('none', []) }
    case 'delay':
      return under === 'defaultParams'
        ? { attrs: one('KIT_DELAY_ATTR_ORDER', O.KIT_DELAY_ATTR_ORDER), children: one('none', []) }
        : { attrs: one('DELAY_ATTR_ORDER', O.DELAY_ATTR_ORDER), children: one('none', []) }
    case 'lpf':
    case 'hpf':
      return under === 'defaultParams' ? { attrs: one('KIT_FILTER_ATTR_ORDER', O.KIT_FILTER_ATTR_ORDER), children: one('none', []) } : null
    case 'sidechain':
    case 'compressor':
      return { attrs: VARIANTS.sidechain, children: one('none', []) }
    case 'audioCompressor':
      return { attrs: one('AUDIO_COMPRESSOR_ATTR_ORDER', O.AUDIO_COMPRESSOR_ATTR_ORDER), children: one('none', []) }
    case 'stutter':
      return { attrs: one('STUTTER_ATTR_ORDER', O.STUTTER_ATTR_ORDER), children: one('none', []) }
    case 'midiOutput':
      // Under `<soundSources>` this is a MIDI drum row (`Kit::writeDataToFile`
      // writes `<midiOutput>`/`<gateOutput>` rows beside `<sound>` rows), not
      // a sound's MIDI output: no table.
      return under === 'soundSources' ? null : { attrs: one('MIDI_OUTPUT_ATTR_ORDER', O.MIDI_OUTPUT_ATTR_ORDER), children: one('none', []) }
    default:
      return null
  }
}

/** Why `keys` is not a subsequence of `order`, or null. */
function subsequenceProblem(keys: readonly string[], order: readonly string[]): string | null {
  let at = -1
  for (const k of keys) {
    const i = order.indexOf(k)
    if (i < 0) return `${k} is not in the table`
    if (i < at) return `${k} comes after ${order[at]}`
    at = i
  }
  return null
}

/** The first variant `keys` fits, recorded in `used`; or the problems with every variant. */
function fits(keys: readonly string[], variants: Variant[], used: Set<string>): string | null {
  const problems: string[] = []
  for (const v of variants) {
    const p = subsequenceProblem(keys, v.order)
    if (p === null) {
      used.add(v.name)
      return null
    }
    problems.push(`${v.name}: ${p}`)
  }
  return problems.join('; ')
}

function check(el: XmlElement, parent: XmlElement | null, path: string, used: Set<string>, out: string[]): void {
  const rule = ruleFor(el, parent)
  if (rule?.attrs) {
    const p = fits(Object.keys(el.attrs).filter((a) => !UNTABLED.has(a)), rule.attrs, used)
    if (p) out.push(`${path} attributes — ${p}`)
  }
  if (rule?.children) {
    const p = fits(el.children.map((c) => c.tag), rule.children, used)
    if (p) out.push(`${path} children — ${p}`)
  }
  const seen = new Map<string, number>()
  for (const c of el.children) {
    const n = seen.get(c.tag) ?? 0
    seen.set(c.tag, n + 1)
    check(c, el, `${path}/${c.tag}${n ? `[${n}]` : ''}`, used, out)
  }
}

const FIXTURES = allFixtures().filter(([n]) => !n.includes('old-format'))
const usedVariants = new Set<string>()

describe('the order tables against the fixtures', () => {
  for (const [name, text] of FIXTURES) {
    it(`${name}: every attribute and child sits where a documented writer puts it`, () => {
      const problems: string[] = []
      const root = parseXML(text)
      check(root, null, root.tag, usedVariants, problems)
      expect(problems).toEqual([])
    })
  }

  it('every alternative table is one some fixture actually uses, and so is every order.ts table it shadows', () => {
    // Run after the sweep above has filled `usedVariants`.
    const unused = Object.values(VARIANTS)
      .flat()
      .map((v) => v.name)
      .filter((n) => !usedVariants.has(n))
    expect(unused).toEqual([])
  })

  it('each alternative is its order.ts table rearranged, nothing added or lost', () => {
    for (const variants of Object.values(VARIANTS)) {
      const [base, ...alternatives] = variants
      for (const alt of alternatives) expect([...alt.order].sort(), alt.name).toEqual([...base.order].sort())
    }
  })
})
