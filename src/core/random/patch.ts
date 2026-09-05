/**
 * The patch generator: one roll writes a playable random sound.
 *
 * It works the way the rest of the editor does — through
 * `src/core/preset/sound.ts` and `src/core/xml/edit.ts`, in the Deluge's own
 * menu numbers — so everything it doesn't touch passes through untouched and
 * the result round-trips like any other preset.
 *
 * Three rules keep a roll honest, and they are what makes this better than a
 * generator that writes XML blind:
 *
 * - **Only strings the firmware knows.** Every enum comes from the tables in
 *   `src/core/preset/enums.ts`; the Deluge resolves an unknown enum string to
 *   the *last* table entry without complaint, so an invented one would load as
 *   something else entirely.
 * - **Only what the target firmware can honour.** Values are gated through
 *   `src/core/firmware/gates.ts`, the same maps that decide which options the
 *   selects offer. Rolling for community 1.3.0 and rolling for official 4.1.4
 *   produce different files, and neither carries a name its firmware can't read.
 * - **Only cables the firmware will patch.** `cableAllowed`
 *   (`src/core/preset/patching.ts`) is `Sound::maySourcePatchToParam`; a route
 *   it refuses is one the instrument loads and ignores.
 *
 * The *ranges* are judgement calls, not firmware facts, and are marked as
 * such. They follow the prior art's hard-won caps — the Python randomizers'
 * authors both report that full-range randomisation yields unusable patches,
 * and cap delay feedback and unison for the same reason (issue #30) — and
 * every one of them is a menu value in the domain the Deluge displays.
 */

import { supports as featureSupported, type Feature } from '../firmware/features'
import type { FirmwareVersion } from '../firmware/version'
import {
  DEST_FEATURE,
  HPF_MODES,
  LFO_TYPE_FEATURE,
  LPF_MODE_FEATURE,
  MOD_FX_FEATURE,
  PARAM_ATTR_FEATURE,
  SOURCE_FEATURE,
  gateAllows,
} from '../firmware/gates'
import { pulseWidthOffered } from '../params/pulse'
import { clamp } from '../params/scale'
import {
  ARP_NOTE_MODES,
  ARP_OCTAVE_MODES,
  FILTER_MODES,
  FILTER_ROUTES,
  LFO_TYPES,
  MOD_FX_TYPES,
  PATCHED_GLOBAL_PARAMS,
  PATCHED_LOCAL_PARAMS,
  POLYPHONY_MODES,
  SYNTH_MODES,
  MAX_PATCH_CABLES,
  cableAllowed,
  type ParamName,
  type PatchSource,
  type SoundParamAttr,
} from '../preset'
import {
  addCable,
  cables,
  osc,
  oscHasFile,
  removeCable,
  setEnvelopeMenu,
  setParamMenu,
} from '../preset/sound'
import {
  ARP_ATTR_ORDER,
  DELAY_ATTR_ORDER,
  LFO_ATTR_ORDER,
  MODULATOR_ATTR_ORDER,
  OSC_ATTR_ORDER,
  SOUND_ATTR_ORDER,
  SOUND_CHILD_ORDER,
  UNISON_ATTR_ORDER,
} from '../preset/order'
import type { SoundElement } from '../preset/types'
import { ensureChild, setAttr } from '../xml/edit'
import { makeRng, randomSeed, type Rng } from './rng'

// ---- what a roll is asked for --------------------------------------------

/** How far a roll strays from the safe middle. */
export const INTENSITIES = ['mild', 'moderate', 'hard', 'wild'] as const
export type Intensity = (typeof INTENSITIES)[number]

/**
 * The width of every window below, and the odds of the wilder choices, as a
 * fraction. `mild` still moves everything it is asked to — it moves it a
 * little.
 */
const AMOUNT: Record<Intensity, number> = { mild: 0.2, moderate: 0.45, hard: 0.72, wild: 1 }

/**
 * What a roll may touch. The ids are the flow blocks' (`src/ui/groups.ts`),
 * so the scope checkboxes and the panels are the same list of sections.
 * `random` (the arpeggiator's note randomiser) and `gold` (the knob
 * assignments) are deliberately not here: neither is a sound, and a preset
 * whose gold knobs move around every roll is a preset you can't play.
 */
export const RANDOM_SECTIONS = [
  'osc', 'voice', 'filters', 'modfx', 'dist', 'delay', 'out', 'mods', 'cables', 'arp',
] as const
export type RandomSection = (typeof RANDOM_SECTIONS)[number]

/**
 * The sections a roll starts with. Distortion, output level and the
 * arpeggiator are off by default: the first two are how loud the patch is
 * rather than what it sounds like, and an arp turns every note you play into
 * a pattern, which is a decision about the song and not the sound.
 */
export const DEFAULT_SECTIONS: readonly RandomSection[] = [
  'osc', 'voice', 'filters', 'modfx', 'delay', 'mods', 'cables',
]

export interface RandomizeOptions {
  /** Firmware gate — `supports(feature)` for the selected version. */
  supports: (feature: string) => boolean
  intensity?: Intensity
  sections?: readonly RandomSection[]
  /** Omitted means a fresh seed, which the result reports back. */
  seed?: number
  /** This sound is a kit row (`Sound::isDrum`), which refuses `note` as a patch source. */
  drum?: boolean
}

export interface RandomizeResult {
  seed: number
  intensity: Intensity
  sections: RandomSection[]
}

/** `supports` for a parsed firmware version, for callers that have one. */
export const supportsFor = (version: FirmwareVersion) => (feature: string) => featureSupported(version, feature)

// ---- helpers --------------------------------------------------------------

/** A menu value near `centre`, in a window that opens up with intensity. */
function near(rng: Rng, centre: number, lo: number, hi: number, amount: number): number {
  const reach = ((hi - lo) * (0.15 + 0.85 * amount)) / 2
  return Math.round(clamp(rng.float(centre - reach, centre + reach), lo, hi))
}

/** A menu value anywhere in a curated band. */
const span = (rng: Rng, lo: number, hi: number): number => rng.int(Math.round(lo), Math.round(hi))

/** A band whose top rises with intensity: `lo` at nothing, `hi` at wild. */
const upTo = (rng: Rng, lo: number, hi: number, amount: number): number => span(rng, lo, lo + (hi - lo) * amount)

// ---- the roll -------------------------------------------------------------

export function randomizePatch(sound: SoundElement, opts: RandomizeOptions): RandomizeResult {
  const intensity = opts.intensity ?? 'moderate'
  const sections = (opts.sections ?? DEFAULT_SECTIONS).filter((s) =>
    (RANDOM_SECTIONS as readonly string[]).includes(s),
  )
  const seed = opts.seed ?? randomSeed()
  const rng = makeRng(seed)
  const amount = AMOUNT[intensity]
  const ctx: Ctx = { sound, rng, amount, supports: opts.supports, drum: opts.drum ?? false }
  const on = (s: RandomSection) => sections.includes(s)

  // Order matters: the oscillators decide the synth mode, the filters decide
  // whether an LPF exists, the LFOs decide whether their rate is patchable —
  // and the cables are only legal in terms of all three, so they go last.
  if (on('osc')) rollOsc(ctx)
  if (on('voice')) rollVoice(ctx)
  if (on('filters')) rollFilters(ctx)
  if (on('modfx')) rollModFx(ctx)
  if (on('dist')) rollDist(ctx)
  if (on('delay')) rollDelay(ctx)
  if (on('out')) rollOut(ctx)
  if (on('mods')) rollMods(ctx)
  if (on('arp')) rollArp(ctx)
  if (on('cables')) rollCables(ctx)

  return { seed, intensity, sections: [...sections] }
}

interface Ctx {
  sound: SoundElement
  rng: Rng
  amount: number
  supports: (feature: string) => boolean
  drum: boolean
}

/** Write a `<defaultParams>` value, unless the target firmware lacks the param. */
function param(ctx: Ctx, attr: SoundParamAttr, menu: number): void {
  if (!gateAllows(PARAM_ATTR_FEATURE, attr, ctx.supports)) return
  setParamMenu(ctx.sound, attr, menu)
}

const allowed = <T extends string>(values: readonly T[], gates: Partial<Record<T, Feature>>, ctx: Ctx): T[] =>
  values.filter((v) => gateAllows(gates, v, ctx.supports))

// ---- oscillators ----------------------------------------------------------

/**
 * The waveforms a generator can choose freely: the ones that need no file on
 * the card. `sample` and `wavetable` are reachable only by keeping one an
 * oscillator already has (below); `inLeft`/`inRight`/`inStereo` are the line
 * inputs, and `dx7` needs a 156-byte patch blob.
 */
const FREE_WAVEFORMS = ['sine', 'triangle', 'square', 'analogSquare', 'saw', 'analogSaw'] as const
/** Weighted towards the two that carry harmonics to filter. */
const WAVEFORM_WEIGHTS = [2, 2, 4, 3, 5, 4]

/** Transpose steps that stay musical: unison, octaves, a fifth, a fourth, a third. */
const INTERVALS = [0, 0, 0, 12, -12, 7, -5, 5, 4, -12, 24, -24]

function rollOsc(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const hasFile = (n: 1 | 2) => oscHasFile(osc(sound, n))
  const sampled = hasFile(1) || hasFile(2)

  // The synth mode reshapes the whole voice, so it only moves when nothing is
  // at stake: FM and ring mod never reach the sample player, so switching one
  // on would silence a preset built from samples.
  if (!sampled && rng.chance(0.12 + amount * 0.3)) {
    setAttr(sound, 'mode', rng.weighted(SYNTH_MODES, [6, 2, 1]), SOUND_ATTR_ORDER)
  }
  const fm = (sound.attrs.mode ?? 'subtractive') === 'fm'

  for (const n of [1, 2] as const) {
    const o = osc(sound, n)
    const keep = oscHasFile(o)
    // An oscillator with a file keeps its type and its file: a roll changes
    // the sound, it does not throw away the samples somebody chose.
    const el = ensureChild(sound, `osc${n}`, SOUND_CHILD_ORDER)
    if (!keep && !fm) setAttr(el, 'type', rng.weighted(FREE_WAVEFORMS, WAVEFORM_WEIGHTS), OSC_ATTR_ORDER)
    // Osc A stays at concert pitch more often than not — with both oscillators
    // transposed there is nothing for an interval to be an interval from.
    const interval = n === 1 ? (rng.chance(0.65) ? 0 : rng.pick(INTERVALS)) : rng.pick(INTERVALS)
    setAttr(el, 'transpose', String(interval), OSC_ATTR_ORDER)
    // Cents ±50 is the menu's own limit either side of a semitone
    // (`gui/menu_item/transpose.h`); a few cents is detune, fifty is a beat.
    setAttr(el, 'cents', String(near(rng, 0, -50, 50, amount * 0.5)), OSC_ATTR_ORDER)

    const type = fm ? 'sine' : (el.attrs.type ?? 'square')
    if (type === 'wavetable') param(ctx, n === 1 ? 'oscAWavetablePosition' : 'oscBWavetablePosition', span(rng, 0, 50))
    if (pulseWidthOffered(type, { fm, fileLoaded: oscHasFile(el) })) {
      param(ctx, n === 1 ? 'oscAPulseWidth' : 'oscBPulseWidth', near(rng, 25, 2, 48, amount))
    }
  }

  // One oscillator always at full level, so a roll can't come out quiet — the
  // second is free to sit anywhere under it. Ring mod ignores both.
  const leadA = rng.chance(0.75)
  param(ctx, 'oscAVolume', leadA ? 50 : span(rng, 20, 50))
  param(ctx, 'oscBVolume', leadA ? span(rng, 0, 50) : 50)
  // Noise is a texture on top, never the patch: mostly off, and never loud.
  param(ctx, 'noiseVolume', rng.chance(0.2 + amount * 0.2) ? upTo(rng, 3, 22, amount) : 0)

  if (!fm) {
    setAttr(ensureChild(sound, 'osc2', SOUND_CHILD_ORDER), 'oscillatorSync', rng.chance(0.15 + amount * 0.2) ? '1' : '0', OSC_ATTR_ORDER)
  } else {
    // FM: the modulators are the sound. Modulator 1 always says something;
    // modulator 2 and the feedbacks are the noisy end, so they stay optional.
    param(ctx, 'modulator1Amount', span(rng, 20, 30 + 20 * amount))
    param(ctx, 'modulator2Amount', rng.chance(0.5) ? span(rng, 8, 20 + 25 * amount) : 0)
    param(ctx, 'modulator1Feedback', rng.chance(0.3 * amount) ? upTo(rng, 2, 20, amount) : 0)
    param(ctx, 'modulator2Feedback', rng.chance(0.3 * amount) ? upTo(rng, 2, 20, amount) : 0)
    param(ctx, 'carrier1Feedback', rng.chance(0.25 * amount) ? upTo(rng, 2, 16, amount) : 0)
    param(ctx, 'carrier2Feedback', rng.chance(0.25 * amount) ? upTo(rng, 2, 16, amount) : 0)
    for (const n of [1, 2] as const) {
      const m = ensureChild(sound, `modulator${n}`, SOUND_CHILD_ORDER)
      // Whole-number ratios are what makes an FM patch sound like an
      // instrument rather than a bell; the octaves and the fifth are the
      // ratios that land on one.
      setAttr(m, 'transpose', String(rng.pick([0, 0, 12, 12, 24, 7, -12, 19])), MODULATOR_ATTR_ORDER)
      setAttr(m, 'cents', String(near(rng, 0, -50, 50, amount * 0.35)), MODULATOR_ATTR_ORDER)
    }
  }
}

// ---- voice ----------------------------------------------------------------

function rollVoice(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  // Poly is what a synth preset usually is; the rest are the interesting
  // minority. `auto` and `choke` are kit behaviours, so they stay out.
  setAttr(sound, 'polyphonic', rng.weighted(POLYPHONY_MODES.filter((p) => p !== 'auto' && p !== 'choke'), [7, 2, 1.5]), SOUND_ATTR_ORDER)

  const u = ensureChild(sound, 'unison', SOUND_CHILD_ORDER)
  // `kMaxNumVoicesUnison = 8` and `kMaxUnisonDetune`/`kMaxUnisonStereoSpread`
  // = 50 (`src/definitions_cxx.hpp:288, 769, 770`, upstream/community
  // bef6d9df). Stacking all eight is a CPU bill as much as a sound, so a roll
  // stops well below the ceiling unless it is a wild one.
  const voices = rng.chance(0.45 + amount * 0.25) ? span(rng, 2, 2 + Math.round(6 * amount)) : 1
  setAttr(u, 'num', String(voices), UNISON_ATTR_ORDER)
  setAttr(u, 'detune', String(voices > 1 ? span(rng, 3, 8 + 22 * amount) : 8), UNISON_ATTR_ORDER)
  if (ctx.supports('unisonSpread')) {
    setAttr(u, 'spread', String(voices > 1 && rng.chance(0.4) ? span(rng, 5, 50) : 0), UNISON_ATTR_ORDER)
  }
  // Portamento glues every note to the last one, so it is a garnish: usually
  // off, and short when it is on.
  param(ctx, 'portamento', rng.chance(0.15 + amount * 0.15) ? upTo(rng, 4, 26, amount) : 0)
}

// ---- filters --------------------------------------------------------------

function rollFilters(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const lpfModes = allowed(FILTER_MODES.filter((m) => m !== 'HPLadder' && m !== 'Off'), LPF_MODE_FEATURE, ctx)
  setAttr(sound, 'lpfMode', rng.pick(lpfModes), SOUND_ATTR_ORDER)
  if (ctx.supports('hpfMode')) {
    setAttr(sound, 'hpfMode', rng.pick(HPF_MODES.filter((m) => m !== 'Off')), SOUND_ATTR_ORDER)
  }
  if (ctx.supports('filterRoute')) {
    setAttr(sound, 'filterRoute', rng.weighted(FILTER_ROUTES, [6, 2, 1.5]), SOUND_ATTR_ORDER)
  }

  // A cutoff floor, so a roll is never a patch you can't hear. Both Python
  // randomizers in the prior art landed on the same guard rail; the floor
  // drops as intensity rises but never to nothing.
  const floor = 34 - 20 * amount
  param(ctx, 'lpfFrequency', span(rng, floor, 50))
  // Resonance is where a filter screams. It is allowed to, only at the top end.
  param(ctx, 'lpfResonance', upTo(rng, 0, 45, amount))
  // The HPF hollows the sound out, so it stays near closed unless asked.
  const hpf = rng.chance(0.25 + amount * 0.3)
  param(ctx, 'hpfFrequency', hpf ? upTo(rng, 3, 30, amount) : 0)
  param(ctx, 'hpfResonance', hpf ? upTo(rng, 0, 30, amount) : 0)

  if (ctx.supports('filterMorph')) {
    param(ctx, 'lpfMorph', rng.chance(0.3) ? span(rng, 0, Math.round(50 * amount)) : 0)
    param(ctx, 'hpfMorph', rng.chance(0.2) ? span(rng, 0, Math.round(50 * amount)) : 0)
  }
  // The wavefolder is a distortion in the filter block, and a loud one.
  if (ctx.supports('waveFold')) {
    param(ctx, 'waveFold', rng.chance(0.15 * amount) ? upTo(rng, 2, 25, amount) : 0)
  }
}

// ---- mod FX ---------------------------------------------------------------

function rollModFx(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const types = allowed(MOD_FX_TYPES.filter((t) => t !== 'none'), MOD_FX_FEATURE, ctx)
  const useIt = rng.chance(0.3 + amount * 0.45)
  setAttr(sound, 'modFXType', useIt ? rng.pick(types) : 'none', SOUND_ATTR_ORDER)
  if (!useIt) return
  param(ctx, 'modFXRate', span(rng, 4, 15 + 35 * amount))
  param(ctx, 'modFXDepth', span(rng, 8, 25 + 25 * amount))
  param(ctx, 'modFXOffset', span(rng, 0, Math.round(50 * amount)))
  // Feedback is where a flanger turns into a whistle; capped well short of it.
  param(ctx, 'modFXFeedback', upTo(rng, 0, 28, amount))
}

// ---- distortion -----------------------------------------------------------

function rollDist(ctx: Ctx): void {
  const { rng, amount } = ctx
  // Both destroy the top end fast, and both are commonly wanted at zero, so
  // they are rolled as "usually off, otherwise gentle".
  param(ctx, 'bitCrush', rng.chance(0.25 + amount * 0.25) ? upTo(rng, 2, 22, amount) : 0)
  param(ctx, 'sampleRateReduction', rng.chance(0.25 + amount * 0.25) ? upTo(rng, 2, 26, amount) : 0)
}

// ---- delay and reverb -----------------------------------------------------

/** Delay times worth landing on: eighths, sixteenths, quarters (`SYNC_LEVELS`). */
const DELAY_SYNC = ['5', '6', '7', '8']

function rollDelay(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const useDelay = rng.chance(0.3 + amount * 0.4)
  const d = ensureChild(sound, 'delay', SOUND_CHILD_ORDER)
  setAttr(d, 'syncLevel', rng.pick(DELAY_SYNC), DELAY_ATTR_ORDER)
  setAttr(d, 'pingPong', rng.chance(0.5) ? '1' : '0', DELAY_ATTR_ORDER)
  setAttr(d, 'analog', rng.chance(0.35) ? '1' : '0', DELAY_ATTR_ORDER)
  param(ctx, 'delayRate', useDelay ? span(rng, 10, 40) : 0)
  // The one cap the prior art states outright: high feedback on the Deluge's
  // delay runs away and swamps the patch, so a roll stays in the low end of
  // the knob even at wild.
  param(ctx, 'delayFeedback', useDelay ? span(rng, 4, 12 + 18 * amount) : 0)
  // Reverb is nearly always welcome and nearly never wanted at the top.
  param(ctx, 'reverbAmount', rng.chance(0.65) ? span(rng, 3, 15 + 20 * amount) : 0)
}

// ---- output ---------------------------------------------------------------

function rollOut(ctx: Ctx): void {
  const { rng, amount } = ctx
  // The init synth sits at 40 of 50. A roll stays around there: this knob is
  // how loud the preset is next to every other preset, not part of the sound.
  param(ctx, 'volume', near(ctx.rng, 40, 30, 50, amount * 0.6))
  // Pan is -25..25 (`kMaxMenuRelativeValue`); off-centre by default would be
  // a bug, so most rolls stay put.
  param(ctx, 'pan', rng.chance(0.25 + amount * 0.2) ? near(rng, 0, -25, 25, amount) : 0)
}

// ---- envelopes and LFOs ---------------------------------------------------

interface EnvShape {
  attack: readonly [number, number]
  decay: readonly [number, number]
  sustain: readonly [number, number]
  release: readonly [number, number]
}

/**
 * Amplitude-envelope archetypes, in menu values. Rolling four independent
 * numbers gives mush; rolling a shape and then a number inside it gives a
 * patch that sounds like it was meant. Every shape either sustains or decays
 * to something audible first, so no roll is a silent envelope.
 */
const ENV_SHAPES: Record<string, EnvShape> = {
  pluck: { attack: [0, 2], decay: [8, 22], sustain: [0, 8], release: [4, 18] },
  stab: { attack: [0, 4], decay: [10, 22], sustain: [12, 28], release: [5, 16] },
  pad: { attack: [16, 34], decay: [20, 36], sustain: [30, 50], release: [24, 42] },
  swell: { attack: [8, 22], decay: [18, 32], sustain: [24, 44], release: [16, 34] },
  organ: { attack: [0, 2], decay: [20, 32], sustain: [42, 50], release: [2, 10] },
}
const ENV_SHAPE_WEIGHTS = [3, 3, 2.5, 2, 1.5]

/** LFO rates that are movement rather than a tone: never the top of the knob. */
const LFO_RATE = [6, 34] as const

function rollMods(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const names = Object.keys(ENV_SHAPES)
  const shape = ENV_SHAPES[rng.weighted(names, ENV_SHAPE_WEIGHTS)]
  const stage = (b: readonly [number, number]) => span(rng, b[0], b[1])
  // Envelope 1 is the amplitude envelope (hardwired to the voice's volume).
  setEnvelopeMenu(sound, 1, 'attack', stage(shape.attack))
  setEnvelopeMenu(sound, 1, 'decay', stage(shape.decay))
  setEnvelopeMenu(sound, 1, 'sustain', stage(shape.sustain))
  setEnvelopeMenu(sound, 1, 'release', stage(shape.release))

  // Envelope 2 is free, and is usually pointed at the filter: it wants to be
  // faster than the amp envelope to be heard as movement at all.
  setEnvelopeMenu(sound, 2, 'attack', upTo(rng, 0, 22, amount))
  setEnvelopeMenu(sound, 2, 'decay', span(rng, 6, 20 + 18 * amount))
  setEnvelopeMenu(sound, 2, 'sustain', span(rng, 0, 40))
  setEnvelopeMenu(sound, 2, 'release', span(rng, 4, 18 + 20 * amount))
  for (const n of [3, 4] as const) {
    if (!ctx.supports(`env${n}`)) continue
    if (!rng.chance(0.25 + amount * 0.35)) continue
    setEnvelopeMenu(sound, n, 'attack', upTo(rng, 0, 30, amount))
    setEnvelopeMenu(sound, n, 'decay', span(rng, 5, 20 + 20 * amount))
    setEnvelopeMenu(sound, n, 'sustain', span(rng, 0, 45))
    setEnvelopeMenu(sound, n, 'release', span(rng, 4, 20 + 20 * amount))
  }

  const shapes = allowed(LFO_TYPES, LFO_TYPE_FEATURE, ctx)
  for (const n of [1, 2, 3, 4] as const) {
    if (n > 2 && !ctx.supports(`lfo${n}`)) continue
    const el = ensureChild(sound, `lfo${n}`, SOUND_CHILD_ORDER)
    setAttr(el, 'type', rng.pick(shapes), LFO_ATTR_ORDER)
    // Only the global LFOs (1 and 3) have a `syncLevel` before community
    // 1.2.0 gave the per-voice ones one, so on older firmware the attribute
    // is not written at all rather than written as off. A synced LFO gives up
    // its rate knob — `maySourcePatchToParam` refuses cables into a synced
    // LFO's rate, which `rollCables` respects.
    const canSync = n === 1 || n === 3 || ctx.supports('lfo2Sync')
    const sync = canSync && rng.chance(0.2 + amount * 0.2)
    if (canSync) setAttr(el, 'syncLevel', sync ? rng.pick(['4', '5', '6', '7']) : '0', LFO_ATTR_ORDER)
    if (!sync) param(ctx, `lfo${n}Rate` as SoundParamAttr, span(rng, LFO_RATE[0], LFO_RATE[1]))
  }
}

// ---- arpeggiator ----------------------------------------------------------

function rollArp(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const a = ensureChild(sound, 'arpeggiator', SOUND_CHILD_ORDER)
  const on = rng.chance(0.35 + amount * 0.25)
  if (ctx.supports('arpModes')) {
    setAttr(a, 'arpMode', on ? 'arp' : 'off', ARP_ATTR_ORDER)
    // `mode` is the pre-1.1 attribute, still written for older readers; the
    // note direction moved to `noteMode` when it was.
    setAttr(a, 'mode', on ? 'up' : 'off', ARP_ATTR_ORDER)
    const noteModes = ARP_NOTE_MODES.filter((m) =>
      ['walk1', 'walk2', 'walk3', 'pattern'].includes(m) ? ctx.supports('arpWalkPattern') : true,
    )
    setAttr(a, 'noteMode', rng.pick(noteModes), ARP_ATTR_ORDER)
    setAttr(a, 'octaveMode', rng.pick(ARP_OCTAVE_MODES), ARP_ATTR_ORDER)
  } else {
    // Before community 1.1 the direction *is* `mode` (`oldArpModeToString`).
    setAttr(a, 'mode', on ? rng.pick(['up', 'down', 'both', 'random']) : 'off', ARP_ATTR_ORDER)
  }
  if (!on) return
  setAttr(a, 'numOctaves', String(span(rng, 1, 3)), ARP_ATTR_ORDER)
  setAttr(a, 'syncLevel', rng.pick(['6', '7', '7', '8']), ARP_ATTR_ORDER)
  param(ctx, 'arpeggiatorGate', near(ctx.rng, 25, 8, 45, amount))
}

// ---- patch cables ---------------------------------------------------------

/**
 * Sources a roll owns. Everything else a file may carry — velocity,
 * aftertouch, note, the MPE axes, the sidechain — is *playing*, not sound
 * design, and survives every roll: an expressive preset stays expressive.
 */
const ROLLED_SOURCES: readonly PatchSource[] = [
  'lfo1', 'lfo2', 'lfo3', 'lfo4', 'envelope1', 'envelope2', 'envelope3', 'envelope4', 'random',
]

/**
 * Where modulation is worth sending, and how often. Weights are the whole
 * point: uniform picks over the forty-odd patchable params is what makes a
 * random patch sound like a fault rather than a synth.
 */
const DEST_WEIGHT: Partial<Record<ParamName, number>> = {
  lpfFrequency: 10,
  lpfResonance: 3,
  hpfFrequency: 2,
  oscAPhaseWidth: 4,
  oscBPhaseWidth: 3,
  oscAWavetablePosition: 5,
  oscBWavetablePosition: 4,
  volume: 4,
  pan: 3,
  pitch: 2,
  oscAPitch: 2,
  oscBPitch: 2,
  oscAVolume: 3,
  oscBVolume: 3,
  noiseVolume: 1,
  lpfMorph: 2,
  hpfMorph: 1,
  waveFold: 1,
  modulator1Volume: 4,
  modulator2Volume: 3,
  modulator1Feedback: 1,
  modulator2Feedback: 1,
  carrier1Feedback: 1,
  carrier2Feedback: 1,
  lfo2Rate: 1,
  lfo4Rate: 1,
  env1Attack: 0.5,
  env1Decay: 0.5,
  env1Release: 0.5,
  env2Decay: 0.5,
  modFXRate: 2,
  modFXDepth: 2,
  delayFeedback: 1,
  reverbAmount: 2,
}

/**
 * Pitch destinations are squared before they are applied
 * (`PatchCableSet::getModifiedPatchCableAmount`), so an amount that would be
 * a wobble anywhere else is inaudible here. These get their own, larger band.
 */
const PITCH_DESTS = new Set(['pitch', 'oscAPitch', 'oscBPitch', 'modulator1Pitch', 'modulator2Pitch'])

/**
 * At most this many *rolled* cables may share a destination. The firmware is
 * happy to sum five LFOs into the cutoff; the result is a cutoff that never
 * settles, which reads as noise rather than movement.
 */
const MAX_PER_DESTINATION = 2

/**
 * A destination the firmware allows but this particular sound has nothing at
 * the other end of: `maySourcePatchToParam` calls these EDITABLE rather than
 * DISALLOWED, so a cable to one is legal, saved, and silent. The menu's own
 * relevance tests are the reference — a wave index means nothing without a
 * wavetable, and `PulseWidth::isRelevant` decides where a pulse width is
 * offered at all.
 */
function cableIsInert(sound: SoundElement, dest: ParamName): boolean {
  const fm = (sound.attrs.mode ?? 'subtractive') === 'fm'
  for (const [n, letter] of [[1, 'A'], [2, 'B']] as const) {
    const o = osc(sound, n)
    const type = fm ? 'sine' : (o?.attrs.type ?? 'square')
    if (dest === `osc${letter}WavetablePosition`) return type !== 'wavetable'
    if (dest === `osc${letter}PhaseWidth`) return !pulseWidthOffered(type, { fm, fileLoaded: oscHasFile(o) })
  }
  return false
}

function rollCables(ctx: Ctx): void {
  const { sound, rng, amount } = ctx
  const rolled = new Set<string>(ROLLED_SOURCES)

  // Clear out the last roll's work, and only that.
  for (const c of cables(sound)) {
    if (c.attrs.source !== undefined && rolled.has(c.attrs.source)) removeCable(sound, c)
  }
  const kept = cables(sound)
  const used = new Set(kept.map((c) => `${c.attrs.source}>${c.attrs.destination}`))
  const perDest = new Map<string, number>()

  const sources = ROLLED_SOURCES.filter((s) => gateAllows(SOURCE_FEATURE, s, ctx.supports))
  const destinations = ([...PATCHED_LOCAL_PARAMS, ...PATCHED_GLOBAL_PARAMS] as ParamName[]).filter(
    (d) =>
      (DEST_WEIGHT[d] ?? 0) > 0 &&
      gateAllows(DEST_FEATURE, d, ctx.supports) &&
      !cableIsInert(sound, d),
  )

  // Every legal pairing, then a weighted draw without replacement. Building
  // the list first means no retry loop and no chance of a duplicate.
  const pool: { source: PatchSource; dest: ParamName; weight: number }[] = []
  for (const source of sources) {
    for (const dest of destinations) {
      if (used.has(`${source}>${dest}`)) continue
      if (!cableAllowed(sound, source, dest, { drum: ctx.drum })) continue
      pool.push({ source, dest, weight: (DEST_WEIGHT[dest] ?? 0) * sourceWeight(source) })
    }
  }

  const want = Math.min(
    span(rng, 2, Math.round(3 + 8 * amount)),
    pool.length,
    Math.max(0, MAX_PATCH_CABLES - kept.length),
  )
  for (let i = 0; i < want && pool.length > 0; i++) {
    const chosen = rng.weighted(pool, pool.map((p) => p.weight))
    const filled = (perDest.get(chosen.dest) ?? 0) + 1
    perDest.set(chosen.dest, filled)
    // Drop the pairing taken, and the whole destination once it is full.
    for (let j = pool.length - 1; j >= 0; j--) {
      if (pool[j] === chosen || (filled >= MAX_PER_DESTINATION && pool[j].dest === chosen.dest)) pool.splice(j, 1)
    }
    // Menu hundredths: the cable knob reads -50.00..50.00
    // (`PatchCableStrength::readCurrentValue`). Modulation that reaches the
    // end stop drowns whatever it is modulating, so a roll stays under it.
    const top = PITCH_DESTS.has(chosen.dest) ? 600 + 1800 * amount : 900 + 2600 * amount
    const size = span(rng, 250, top)
    addCable(sound, chosen.source, chosen.dest, rng.chance(0.5) ? size : -size)
  }
}

/** The envelopes and LFOs are what modulation usually means; `random` is a garnish. */
const sourceWeight = (s: PatchSource): number =>
  s === 'random' ? 0.6 : s === 'envelope1' ? 0.5 : s.startsWith('lfo') ? 2.5 : 2
