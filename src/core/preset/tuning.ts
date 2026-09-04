/**
 * A sample's root note as `transpose`/`cents` encode it, and back.
 *
 * The firmware derives the pair from a sample's detected pitch as
 * `semitones = 60 - midiNote`, split into whole semitones and cents
 * (`SampleHolderForVoice::setTransposeAccordingToSamplePitch`,
 * `model/sample/sample_holder_for_voice.cpp:137`, upstream/community
 * bef6d9df). Reading them back the same way is what lets the editor show the
 * root note the instrument would show without storing anything extra: the
 * file already carries it losslessly. Roots are in hundredths of a semitone
 * throughout, not a float, so a value survives the round trip exactly.
 */

import { MIDDLE_C, noteName } from './notes'

/** The root note `transpose`/`cents` encode, in hundredths of a semitone. */
export const rootCents = (transpose: number, cents: number): number => MIDDLE_C * 100 - transpose * 100 - cents

/** Round half away from zero, C's `roundf` — never returning `-0`. */
function roundf(x: number): number {
  const n = Math.round(Math.abs(x))
  return x < 0 && n !== 0 ? -n : n
}

/**
 * The inverse of `rootCents`, split the way the firmware splits it. Only for
 * a root the *user* changed: `transpose`/`cents` a file already has are read
 * verbatim and never re-derived, since the instrument doesn't re-derive them
 * either and a stored pair can carry deliberate detuning.
 *
 * (The transpose *menu* splits ties the other way —
 * `computeFinalValuesForTranspose`, `gui/menu_item/value_scaling.cpp:68`,
 * rounds a half up rather than away from zero. Same pitch either way.)
 */
export function rootToTransposeCents(root: number): { transpose: number; cents: number } {
  const semitones = MIDDLE_C * 100 - root
  const transpose = roundf(semitones / 100)
  return { transpose, cents: semitones - transpose * 100 }
}

/**
 * The tuning the instrument gives a sample the moment it is *chosen* for a
 * synth: transpose and cents from the note the sample was recorded at
 * (`SampleHolderForVoice::setTransposeAccordingToSamplePitch`,
 * `model/sample/sample_holder_for_voice.cpp:137-168`, upstream/community
 * bef6d9df). `minimizeOctaves` is the firmware's own flag, passed when the
 * source has exactly one range (`sample_browser.cpp:1034`): a lone sample is
 * folded into the nearest octave, so a C5 recording plays at pitch across the
 * keyboard instead of transposing two octaves down.
 *
 * A kit row never gets this — the browser's pitch detection is the synth half
 * of that branch, and a drum sounds one fixed note anyway.
 */
export function tuningForSamplePitch(root: number, minimizeOctaves = false): { transpose: number; cents: number } {
  const { transpose, cents } = rootToTransposeCents(root)
  if (!minimizeOctaves) return { transpose, cents }
  let semitones = transpose
  while (semitones <= -6) semitones += 12
  while (semitones > 6) semitones -= 12
  return { transpose: semitones, cents }
}

/** A root note as a note code plus its offset in cents, for display. */
export function rootParts(root: number): { note: number; cents: number } {
  const note = roundf(root / 100)
  return { note, cents: root - note * 100 }
}

/** `"C3"`, or `"F2 -8¢"` when the root sits between two notes. */
export function rootName(root: number, sharps = true): string {
  const { note, cents } = rootParts(root)
  return cents === 0 ? noteName(note, sharps) : `${noteName(note, sharps)} ${cents > 0 ? '+' : '-'}${Math.abs(cents)}¢`
}
