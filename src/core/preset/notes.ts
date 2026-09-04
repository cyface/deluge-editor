/**
 * Note codes as the Deluge names them.
 *
 * `noteCodeToString` (`util/functions.cpp:1917`, upstream/community bef6d9df)
 * computes `octave = noteCode / 12 - 2`, so note 60 is **C3**, not C4: the
 * Deluge follows the Yamaha convention. A root or key range shown in the
 * editor has to read the same as the one on the instrument's screen, so
 * nothing here re-bases to scientific pitch.
 *
 * Letters come from `noteCodeToNoteLetter` / `noteCodeToNoteLetterFlats` and
 * `noteCodeIsSharp` (`util/lookuptables/lookuptables.cpp:485-488`). Sharps
 * are the shipped default (`FlashStorage::defaultUseSharps = true`,
 * `storage/flash_storage.cpp:262`); the instrument can be set to flats, which
 * changes only how a note is spelled.
 */

/** Note 60, the Deluge's C3 and the pitch a sample plays back untransposed. */
export const MIDDLE_C = 60

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/**
 * The octave number the Deluge prints. Its own division truncates, which only
 * differs from this below note 0 — territory a preset can't reach, and where
 * the firmware's own naming goes non-monotonic (note -1 prints "B-2", above
 * note 0's "C-2").
 */
export const noteOctave = (note: number): number => Math.floor(note / 12) - 2

/** 0..11, C first. */
export const noteWithinOctave = (note: number): number => ((note % 12) + 12) % 12

/** A note code as the instrument spells it: `noteName(60) === 'C3'`. */
export function noteName(note: number, sharps = true): string {
  const n = Math.round(note)
  const letters = sharps ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT
  return `${letters[noteWithinOctave(n)]}${noteOctave(n)}`
}
