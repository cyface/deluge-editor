import { describe, expect, it } from 'vitest'
import initSynth from '../../assets/templates/Default Synth.XML?raw'
import official from '../../../tests/fixtures/official-4.0.1/AnalogSaw Patch Cables.XML?raw'
import { supports as featureSupported } from '../firmware/features'
import { parseVersion } from '../firmware/version'
import { hexToInt } from '../params/hex'
import { pulseWidthOffered } from '../params/pulse'
import { cableToMenu, panToMenu, standardToMenu } from '../params/scale'
import {
  ARP_MODES,
  ARP_NOTE_MODES,
  ARP_OCTAVE_MODES,
  FILTER_MODES,
  FILTER_ROUTES,
  LFO_TYPES,
  MOD_FX_TYPES,
  MAX_PATCH_CABLES,
  OLD_ARP_MODES,
  OSC_TYPES,
  PATCHED_GLOBAL_PARAMS,
  PATCHED_LOCAL_PARAMS,
  PATCH_SOURCES,
  POLYPHONY_MODES,
  SYNTH_MODES,
  cableAllowed,
  type PatchSource,
} from '../preset'
import { cables, paramMenu } from '../preset/sound'
import type { SoundElement } from '../preset/types'
import { diffFlat, flattenXML, generateXML, parseXML } from '../xml'
import { child, childrenOf } from '../xml/element'
import { INTENSITIES, RANDOM_SECTIONS, randomizePatch, supportsFor, type Intensity, type RandomSection } from './patch'

const supportsOf = (version: string) => supportsFor(parseVersion(version))
const community = supportsOf('c1.3.0')
const legacy = supportsOf('4.1.4')

const load = (src = initSynth): SoundElement => parseXML(src) as SoundElement

/** Roll a fresh copy of the template and hand back the sound and its XML. */
function roll(opts: Parameters<typeof randomizePatch>[1] & { src?: string }) {
  const sound = load(opts.src)
  const result = randomizePatch(sound, opts)
  return { sound, result, xml: generateXML(sound) }
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13)

/** Every roll of every intensity over the seed set, for the sweeping checks. */
function* everyRoll(supports: (f: string) => boolean, src?: string) {
  for (const intensity of INTENSITIES) {
    for (const seed of SEEDS) {
      yield roll({ supports, intensity, sections: RANDOM_SECTIONS, seed, src })
    }
  }
}

describe('randomizePatch', () => {
  it('is deterministic: the same seed writes the same file', () => {
    const opts = { supports: community, intensity: 'hard' as const, sections: RANDOM_SECTIONS, seed: 0xbeef }
    expect(roll(opts).xml).toBe(roll(opts).xml)
  })

  it('a different seed writes a different file', () => {
    const a = roll({ supports: community, sections: RANDOM_SECTIONS, seed: 1 }).xml
    const b = roll({ supports: community, sections: RANDOM_SECTIONS, seed: 2 }).xml
    expect(a).not.toBe(b)
  })

  it('reports the seed it used, so an unseeded roll can be repeated', () => {
    const first = roll({ supports: community })
    expect(first.result.seed).toBeGreaterThanOrEqual(0)
    const again = roll({ supports: community, seed: first.result.seed })
    expect(again.xml).toBe(first.xml)
  })

  it('actually changes the preset', () => {
    const sound = load()
    randomizePatch(sound, { supports: community, seed: 5 })
    const d = diffFlat(flattenXML(initSynth), flattenXML(generateXML(sound)))
    expect(d.changed.length).toBeGreaterThan(10)
  })

  it('rolls only inside the sections it was given', () => {
    // Filters own the two filter modes, the route, and the six filter params.
    const sound = load()
    randomizePatch(sound, { supports: community, sections: ['filters'], seed: 42, intensity: 'wild' })
    const d = diffFlat(flattenXML(initSynth), flattenXML(generateXML(sound)))
    expect(d.added).toEqual([])
    expect(d.missing).toEqual([])
    for (const c of d.changed) {
      expect(c.path, c.path).toMatch(/@(lpf|hpf|filterRoute|waveFold)/)
    }
  })

  it('an empty section list leaves the file byte-identical', () => {
    const sound = load()
    randomizePatch(sound, { supports: community, sections: [], seed: 9 })
    expect(generateXML(sound)).toBe(initSynth)
  })

  it('ignores a section name it does not know', () => {
    const result = randomizePatch(load(), {
      supports: community,
      sections: ['filters', 'nonsense' as RandomSection],
      seed: 3,
    })
    expect(result.sections).toEqual(['filters'])
  })
})

describe('every value the firmware could misread', () => {
  /** Each enum attribute, and the table its value must come from. */
  const ENUM_TABLES: { find: (s: SoundElement) => (string | undefined)[]; table: readonly string[]; what: string }[] = [
    { find: (s) => [s.attrs.mode], table: SYNTH_MODES, what: 'mode' },
    { find: (s) => [s.attrs.polyphonic], table: POLYPHONY_MODES, what: 'polyphonic' },
    { find: (s) => [s.attrs.modFXType], table: MOD_FX_TYPES, what: 'modFXType' },
    { find: (s) => [s.attrs.lpfMode, s.attrs.hpfMode], table: FILTER_MODES, what: 'filter mode' },
    { find: (s) => [s.attrs.filterRoute], table: FILTER_ROUTES, what: 'filterRoute' },
    { find: (s) => [1, 2].map((n) => child(s, `osc${n}` as 'osc1')?.attrs.type), table: OSC_TYPES, what: 'osc type' },
    {
      find: (s) => [1, 2, 3, 4].map((n) => child(s, `lfo${n}` as 'lfo1')?.attrs.type),
      table: LFO_TYPES,
      what: 'lfo type',
    },
    { find: (s) => [child(s, 'arpeggiator')?.attrs.arpMode], table: ARP_MODES, what: 'arpMode' },
    { find: (s) => [child(s, 'arpeggiator')?.attrs.noteMode], table: ARP_NOTE_MODES, what: 'noteMode' },
    { find: (s) => [child(s, 'arpeggiator')?.attrs.octaveMode], table: ARP_OCTAVE_MODES, what: 'octaveMode' },
    {
      find: (s) => [child(s, 'arpeggiator')?.attrs.mode],
      table: [...OLD_ARP_MODES, ...ARP_MODES],
      what: 'legacy arp mode',
    },
  ]

  it('writes only strings that are in the firmware string tables', () => {
    for (const { sound } of everyRoll(community)) {
      for (const { find, table, what } of ENUM_TABLES) {
        for (const value of find(sound)) {
          if (value === undefined) continue
          expect(table, `${what}: ${value}`).toContain(value)
        }
      }
      for (const c of cables(sound)) {
        expect(PATCH_SOURCES).toContain(c.attrs.source)
        expect([...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS]).toContain(c.attrs.destination)
      }
    }
  })

  it('keeps every knob inside the range the Deluge’s own menu shows', () => {
    for (const { sound } of everyRoll(community)) {
      const p = child(sound, 'defaultParams')!
      for (const [attr, hex] of Object.entries(p.attrs)) {
        const raw = hexToInt(hex)
        if (attr === 'pan') {
          expect(panToMenu(raw)).toBeGreaterThanOrEqual(-25)
          expect(panToMenu(raw)).toBeLessThanOrEqual(25)
        } else {
          const menu = standardToMenu(raw)
          expect(menu, `${attr}=${hex}`).toBeGreaterThanOrEqual(0)
          expect(menu, `${attr}=${hex}`).toBeLessThanOrEqual(50)
        }
      }
      for (const n of [1, 2, 3, 4] as const) {
        const env = child(p, `envelope${n}` as 'envelope1')
        for (const hex of Object.values(env?.attrs ?? {})) {
          expect(standardToMenu(hexToInt(hex))).toBeGreaterThanOrEqual(0)
          expect(standardToMenu(hexToInt(hex))).toBeLessThanOrEqual(50)
        }
      }
    }
  })

  it('keeps unison, transpose and cents inside the menu’s own limits', () => {
    for (const { sound } of everyRoll(community)) {
      const u = child(sound, 'unison')!
      // kMaxNumVoicesUnison = 8, kMaxUnisonDetune / kMaxUnisonStereoSpread = 50.
      expect(Number(u.attrs.num)).toBeGreaterThanOrEqual(1)
      expect(Number(u.attrs.num)).toBeLessThanOrEqual(8)
      expect(Number(u.attrs.detune)).toBeGreaterThanOrEqual(0)
      expect(Number(u.attrs.detune)).toBeLessThanOrEqual(50)
      expect(Number(u.attrs.spread ?? 0)).toBeLessThanOrEqual(50)
      for (const tag of ['osc1', 'osc2', 'modulator1', 'modulator2'] as const) {
        const el = child(sound, tag)
        if (!el) continue
        expect(Math.abs(Number(el.attrs.transpose ?? 0))).toBeLessThanOrEqual(96)
        expect(Math.abs(Number(el.attrs.cents ?? 0))).toBeLessThanOrEqual(50)
      }
    }
  })

  it('never writes a cable the firmware would load and ignore', () => {
    for (const { sound } of everyRoll(community)) {
      for (const c of cables(sound)) {
        const source = c.attrs.source as PatchSource
        expect(
          cableAllowed(sound, source, c.attrs.destination!),
          `${source} → ${c.attrs.destination}`,
        ).toBe(true)
      }
    }
  })

  it('never writes the same cable twice, and never more than the firmware reads', () => {
    for (const { sound } of everyRoll(community)) {
      const list = cables(sound).map((c) => `${c.attrs.source}>${c.attrs.destination}`)
      expect(new Set(list).size).toBe(list.length)
      // readPatchCablesFromFile stops at kMaxNumPatchCables.
      expect(list.length).toBeLessThanOrEqual(MAX_PATCH_CABLES)
    }
  })

  it('never sends modulation somewhere this sound cannot use it', () => {
    for (const { sound } of everyRoll(community)) {
      const fm = (sound.attrs.mode ?? 'subtractive') === 'fm'
      for (const c of cables(sound)) {
        for (const [n, letter] of [[1, 'A'], [2, 'B']] as const) {
          const type = fm ? 'sine' : (child(sound, `osc${n}` as 'osc1')?.attrs.type ?? 'square')
          // A wave index means nothing without a wavetable; a pulse width
          // means nothing where `PulseWidth::isRelevant` says it is not offered.
          if (c.attrs.destination === `osc${letter}WavetablePosition`) expect(type).toBe('wavetable')
          if (c.attrs.destination === `osc${letter}PhaseWidth`) {
            expect(pulseWidthOffered(type, { fm, fileLoaded: false }), `${type} pulse width`).toBe(true)
          }
        }
      }
    }
  })

  it('never piles more than two rolled cables onto one destination', () => {
    // The three the template ships with are the user's, and are left alone —
    // it is the roll's own that are counted.
    const ROLLED = new Set(['lfo1', 'lfo2', 'lfo3', 'lfo4', 'envelope1', 'envelope2', 'envelope3', 'envelope4', 'random'])
    for (const { sound } of everyRoll(community)) {
      const perDest = new Map<string, number>()
      for (const c of cables(sound)) {
        if (!ROLLED.has(c.attrs.source ?? '')) continue
        const dest = c.attrs.destination!
        perDest.set(dest, (perDest.get(dest) ?? 0) + 1)
      }
      for (const [dest, n] of perDest) expect(n, dest).toBeLessThanOrEqual(2)
    }
  })

  it('keeps cable amounts inside -50.00..50.00', () => {
    for (const { sound } of everyRoll(community)) {
      for (const c of cables(sound)) {
        const menu = cableToMenu(hexToInt(c.attrs.amount!))
        expect(Math.abs(menu)).toBeLessThanOrEqual(5000)
        // A cable at zero is a cable that does nothing; a roll never adds one.
        expect(menu).not.toBe(0)
      }
    }
  })
})

describe('firmware gating', () => {
  /** Names official 4.1.4's serialiser never writes, in any position. */
  const COMMUNITY_ONLY_ATTRS = [
    'hpfMode', 'filterRoute', 'lpfMorph', 'hpfMorph', 'waveFold', 'spread', 'maxVoices',
    'lfo3Rate', 'lfo4Rate', 'compressorThreshold', 'arpMode', 'noteMode', 'octaveMode',
  ]
  const COMMUNITY_ONLY_VALUES = [
    'SVF_Band', 'SVF_Notch', 'HPLadder', 'Off', 'sah', 'rwalk', 'warbler',
    'StereoChorus', 'grainFX', 'TapeWarble', 'dimension', 'dx7',
  ]

  it('targeting official 4.1.4 adds no attribute that firmware cannot write', () => {
    const before = flattenXML(official)
    for (const { sound } of everyRoll(legacy, official)) {
      const d = diffFlat(before, flattenXML(generateXML(sound)))
      for (const path of d.added) {
        const attr = path.split('@')[1]
        expect(COMMUNITY_ONLY_ATTRS, path).not.toContain(attr)
      }
      for (const c of d.changed) {
        expect(COMMUNITY_ONLY_VALUES, `${c.path} = ${c.actual}`).not.toContain(c.actual)
      }
    }
  })

  /** Paths official 4.1.4's serialiser never writes at all. */
  const COMMUNITY_ONLY_PATHS = [/\/lfo[234]@sync/, /\/lfo[34]@/, /\/envelope[34]@/, /@maxVoices/]

  it('targeting official 4.1.4 adds no attribute at a position that firmware cannot write', () => {
    const before = flattenXML(official)
    for (const { sound } of everyRoll(legacy, official)) {
      for (const path of diffFlat(before, flattenXML(generateXML(sound))).added) {
        for (const bad of COMMUNITY_ONLY_PATHS) expect(path, path).not.toMatch(bad)
      }
    }
  })

  it('targeting official 4.1.4 adds no element that firmware cannot write', () => {
    const before = flattenXML(official)
    for (const { sound } of everyRoll(legacy, official)) {
      const d = diffFlat(before, flattenXML(generateXML(sound)))
      for (const path of d.added) {
        expect(path, path).not.toMatch(/\b(lfo3|lfo4|envelope3|envelope4|stutter|audioCompressor)\b/)
      }
    }
  })

  it('targeting official 4.1.4 uses no patch source that firmware lacks', () => {
    for (const { sound } of everyRoll(legacy, official)) {
      for (const c of cables(sound)) {
        expect(['lfo3', 'lfo4', 'envelope3', 'envelope4'], c.attrs.source).not.toContain(c.attrs.source)
        expect(['lpfMorph', 'hpfMorph', 'waveFold', 'lfo3Rate', 'lfo4Rate']).not.toContain(c.attrs.destination)
      }
    }
  })

  it('targeting community 1.3.0 does reach the newer values (the gate is real, not blanket)', () => {
    const seen = new Set<string>()
    for (const { sound } of everyRoll(community)) {
      for (const n of [1, 2, 3, 4] as const) {
        const t = child(sound, `lfo${n}` as 'lfo1')?.attrs.type
        if (t) seen.add(t)
      }
      if (sound.attrs.modFXType) seen.add(sound.attrs.modFXType)
      for (const c of cables(sound)) if (c.attrs.source) seen.add(c.attrs.source)
    }
    expect(seen).toContain('sah')
    expect(seen).toContain('lfo3')
    expect([...seen].some((v) => ['StereoChorus', 'grainFX', 'TapeWarble', 'dimension'].includes(v))).toBe(true)
  })

  it('a firmware that supports nothing still produces a file', () => {
    const { xml } = roll({ supports: () => false, sections: RANDOM_SECTIONS, seed: 77, intensity: 'wild' })
    expect(xml).toContain('<sound')
    expect(() => parseXML(xml)).not.toThrow()
  })
})

describe('the result is still a preset', () => {
  it('round-trips: reparsed and regenerated byte for byte', () => {
    for (const { xml } of everyRoll(community)) {
      expect(generateXML(parseXML(xml))).toBe(xml)
    }
  })

  it('loses nothing the template had', () => {
    const before = flattenXML(initSynth)
    for (const { xml } of everyRoll(community)) {
      expect(diffFlat(before, flattenXML(xml)).missing).toEqual([])
    }
  })

  it('keeps element order the way the firmware writes it', () => {
    for (const { sound } of everyRoll(community)) {
      const tags = sound.children.map((c) => c.tag)
      const expected = [...tags].sort((a, b) => order(a) - order(b))
      expect(tags).toEqual(expected)
    }
  })

  it('is audible: an oscillator at full level, a cutoff off the floor, a volume', () => {
    for (const { sound } of everyRoll(community)) {
      const a = paramMenu(sound, 'oscAVolume') ?? 0
      const b = paramMenu(sound, 'oscBVolume') ?? 0
      expect(Math.max(a, b)).toBe(50)
      if ((sound.attrs.lpfMode ?? '24dB') !== 'Off') {
        expect(paramMenu(sound, 'lpfFrequency')).toBeGreaterThanOrEqual(14)
      }
      expect(paramMenu(sound, 'volume')).toBeGreaterThanOrEqual(25)
    }
  })

  it('holds the safety caps the prior art earned', () => {
    for (const { sound } of everyRoll(community)) {
      // Delay feedback runs away above the low end of the knob.
      expect(paramMenu(sound, 'delayFeedback')).toBeLessThanOrEqual(30)
      expect(Number(child(sound, 'unison')!.attrs.num)).toBeLessThanOrEqual(8)
    }
  })

  it('keeps a sampled oscillator’s samples, and never invents a file', () => {
    const withSample = parseXML(
      initSynth.replace('<osc1\n\t\ttype="square"', '<osc1\n\t\ttype="sample"\n\t\tfileName="SAMPLES/x.wav"'),
    ) as SoundElement
    randomizePatch(withSample, { supports: community, sections: RANDOM_SECTIONS, seed: 21, intensity: 'wild' })
    const o = child(withSample, 'osc1')!
    expect(o.attrs.type).toBe('sample')
    expect(o.attrs.fileName).toBe('SAMPLES/x.wav')
    // Subtractive: FM and ring mod never reach the sample player.
    expect(withSample.attrs.mode).toBe('subtractive')
    // Nothing else grew a file reference.
    expect(child(withSample, 'osc2')!.attrs.fileName).toBeUndefined()
  })

  it('never gives a plain waveform a wavetable or sample type', () => {
    for (const { sound } of everyRoll(community)) {
      for (const n of [1, 2] as const) {
        const o = child(sound, `osc${n}` as 'osc1')!
        if (['sample', 'wavetable', 'dx7', 'inLeft', 'inRight', 'inStereo'].includes(o.attrs.type ?? '')) {
          expect.unreachable(`osc${n} became ${o.attrs.type} with no file`)
        }
      }
    }
  })
})

describe('a kit row', () => {
  it('never takes note as a patch source (the firmware refuses it on a drum)', () => {
    for (const intensity of INTENSITIES) {
      for (const seed of SEEDS.slice(0, 40)) {
        const sound = load()
        randomizePatch(sound, { supports: community, sections: RANDOM_SECTIONS, seed, intensity, drum: true })
        for (const c of cables(sound)) expect(c.attrs.source).not.toBe('note')
      }
    }
  })
})

/** `SOUND_CHILD_ORDER` as an index, for the element-order check. */
function order(tag: string): number {
  const i = [
    'osc1', 'osc2', 'lfo1', 'lfo2', 'lfo3', 'lfo4', 'modulator1', 'modulator2', 'unison', 'defaultParams',
    'arpeggiator', 'modKnobs', 'midiOutput', 'delay', 'midiKnobs', 'sidechain', 'compressor', 'audioCompressor',
    'stutter',
  ].indexOf(tag)
  return i < 0 ? Infinity : i
}

describe('intensity', () => {
  const spread = (intensity: Intensity): number => {
    // How far the cutoff wanders across a hundred rolls: the one knob every
    // intensity touches, so the levels are comparable.
    const values = SEEDS.map(
      (seed) => paramMenu(roll({ supports: community, sections: ['filters'], seed, intensity }).sound, 'lpfFrequency') ?? 0,
    )
    return Math.max(...values) - Math.min(...values)
  }

  it('widens with each level', () => {
    const widths = INTENSITIES.map(spread)
    expect(widths[0]).toBeLessThan(widths[3])
    expect(widths).toEqual([...widths].sort((a, b) => a - b))
  })

  it('mild still moves things', () => {
    expect(spread('mild')).toBeGreaterThan(0)
  })
})

describe('cable counts', () => {
  it('adds more modulation the harder the roll', () => {
    const count = (intensity: Intensity) =>
      SEEDS.reduce(
        (sum, seed) => sum + cables(roll({ supports: community, sections: ['cables'], seed, intensity }).sound).length,
        0,
      )
    expect(count('mild')).toBeLessThan(count('wild'))
  })

  it('keeps the expressive cables the file already had', () => {
    for (const { sound } of everyRoll(community)) {
      const kept = cables(sound).filter((c) => c.attrs.source === 'velocity' && c.attrs.destination === 'volume')
      expect(kept).toHaveLength(1)
      // …with the amount and polarity the file wrote.
      expect(kept[0].attrs.polarity).toBe('unipolar')
      expect(kept[0].attrs.amount).toBe('0x3FFFFFE8')
    }
  })

  it('re-rolling replaces its own cables rather than piling them up', () => {
    const sound = load()
    const before = cables(sound).length
    for (let i = 0; i < 12; i++) {
      randomizePatch(sound, { supports: community, sections: ['cables'], seed: i, intensity: 'wild' })
    }
    // The three expressive cables the template has, plus one roll's worth.
    expect(cables(sound).length).toBeLessThanOrEqual(before + 12)
    expect(childrenOf(child(child(sound, 'defaultParams')!, 'patchCables')!, 'patchCable').length).toBe(
      cables(sound).length,
    )
  })
})

describe('supportsFor', () => {
  it('is the same gate the UI uses', () => {
    const v = parseVersion('c1.3.0')
    expect(supportsFor(v)('lfo3')).toBe(featureSupported(v, 'lfo3'))
    expect(supportsFor(parseVersion('4.1.4'))('lfo3')).toBe(false)
  })
})
