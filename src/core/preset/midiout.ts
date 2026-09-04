/**
 * The `<midiOutput channel>` sentinels, as `src/definitions_cxx.hpp` defines
 * them (`beta` e7bae539): `MIDI_CHANNEL_MPE_LOWER_ZONE = 16` (line 954),
 * `MIDI_CHANNEL_MPE_UPPER_ZONE = 17` (955) and `MIDI_CHANNEL_NONE = 255`
 * (957). A plain channel is stored zero-based, 0–15.
 *
 * `Sound::writeToFile` writes `outputMidiChannel` as it is
 * (`src/deluge/processing/sound/sound.cpp:4259-4261`), and the sound's own
 * menu (`OutputMidiChannel`, `src/deluge/gui/menu_item/midi/sound/channel.h`)
 * runs 0–16, storing `MIDI_CHANNEL_NONE` for 0 and `value - 1` otherwise, so
 * a synth or kit-row sound can hold a channel or none; the zone values come
 * from the MIDI-side code that shares the field's type, and the label names
 * them so a file that carries one reads as what it is rather than as "ch 17".
 * That menu shows `OFF` or the one-based number; the labels here are the
 * editor's, with the same numbering.
 */

export const MIDI_CHANNEL_NONE = 255
export const MIDI_CHANNEL_MPE_LOWER_ZONE = 16
export const MIDI_CHANNEL_MPE_UPPER_ZONE = 17

/** The stored channel as the Out panel labels it: `none`, the MPE zones, or one-based `ch N`. */
export function midiOutputChannelLabel(n: number): string {
  if (n === MIDI_CHANNEL_NONE) return 'none'
  if (n === MIDI_CHANNEL_MPE_LOWER_ZONE) return 'MPE lower'
  if (n === MIDI_CHANNEL_MPE_UPPER_ZONE) return 'MPE upper'
  return `ch ${n + 1}`
}
