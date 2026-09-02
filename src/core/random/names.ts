/**
 * A name for a rolled patch.
 *
 * A generator that leaves every preset called UNNAMED makes a folder of them
 * unusable, and the Deluge shows the file name and nothing else. The name
 * describes what the roll actually produced — it reads the sound back through
 * the same accessors the panels do — so "FM BELL" is an FM patch and "SAW
 * SWELL" really has a slow attack.
 */

import { envelopeMenu, osc, paramMenu } from '../preset/sound'
import type { SoundElement } from '../preset/types'
import type { Rng } from './rng'

/** What the voice is made of. */
const CHARACTER: Record<string, string[]> = {
  fm: ['FM', 'DX', 'OPERATOR'],
  ringmod: ['RING', 'CLANG', 'METAL'],
  sine: ['SINE', 'PURE', 'GLASS'],
  triangle: ['TRI', 'SOFT', 'HOLLOW'],
  square: ['SQUARE', 'PULSE', 'HOLLOW'],
  analogSquare: ['ANALOG', 'PULSE', 'RUBBER'],
  saw: ['SAW', 'BRIGHT', 'BLADE'],
  analogSaw: ['ANALOG', 'VINTAGE', 'SAW'],
  wavetable: ['WAVE', 'TABLE', 'MORPH'],
  sample: ['SAMPLE', 'FIELD', 'TAPE'],
  dx7: ['DX7', 'YAMAHA', 'FM'],
}

/** What the amplitude envelope does, read back off envelope 1. */
const GESTURE = {
  pluck: ['PLUCK', 'STAB', 'BLIP', 'SPARK'],
  swell: ['SWELL', 'RISE', 'BLOOM', 'TIDE'],
  pad: ['PAD', 'DRIFT', 'HAZE', 'CLOUD'],
  sustain: ['DRONE', 'HOLD', 'BED', 'WALL'],
}

/** The colour the filter and the effects lend it. */
const FLAVOUR = [
  'DUST', 'GLOW', 'SHADOW', 'ECHO', 'FROST', 'EMBER', 'STATIC', 'VAPOUR',
  'CIRCUIT', 'HARBOUR', 'ORBIT', 'LANTERN', 'MARBLE', 'THICKET', 'SIGNAL', 'QUARRY',
]

/**
 * Two words, upper case, from what the sound turned out to be. Deterministic
 * for a given rng position, so the same seed names the same patch.
 */
export function randomPatchName(sound: SoundElement, rng: Rng): string {
  const mode = sound.attrs.mode ?? 'subtractive'
  const type = osc(sound, 1)?.attrs.type ?? 'square'
  const character = CHARACTER[mode === 'subtractive' ? type : mode] ?? CHARACTER.square

  const attack = envelopeMenu(sound, 1, 'attack') ?? 0
  const sustain = envelopeMenu(sound, 1, 'sustain') ?? 25
  const gesture =
    attack > 14 ? GESTURE.swell : sustain < 12 ? GESTURE.pluck : attack > 8 || sustain > 42 ? GESTURE.pad : GESTURE.sustain

  // Three ways to say the same patch, so a folder of rolls doesn't read as a
  // list of the same two words: character + gesture, character + flavour, or
  // gesture + flavour.
  const wet = (paramMenu(sound, 'reverbAmount') ?? 0) + (paramMenu(sound, 'delayFeedback') ?? 0)
  const pool: [string[], string[]][] = [
    [character, gesture],
    [character, FLAVOUR],
    [gesture, FLAVOUR],
  ]
  const [a, b] = rng.weighted(pool, [3, 2, wet > 20 ? 3 : 1])
  const first = rng.pick(a)
  let second = rng.pick(b)
  if (second === first) second = rng.pick(FLAVOUR)
  return `${first} ${second}`
}

/**
 * The name as a preset file name. The card browser writes what it is given,
 * so this is the same string the instrument will list.
 */
export const patchFileName = (name: string): string => `${name}.XML`
