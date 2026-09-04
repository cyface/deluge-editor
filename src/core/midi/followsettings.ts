/**
 * The Deluge's MIDI-Follow configuration as read off the card, in three parts
 * under one name:
 *
 * - `followfile.ts` — `SETTINGS/MIDIFollow.XML`: the three channel slots and
 *   the feedback setting.
 * - `mpezones.ts` — `SETTINGS/MIDIDevices.XML` and the per-cable defaults:
 *   which MIDI channels are MPE zones on which USB port.
 * - `followadvice.ts` — what the two together mean for sending from here,
 *   and the advice lines the follow sheet shows.
 *
 * Import from here as before; the split is only so each part reads whole.
 */

export * from './followfile'
export * from './mpezones'
export * from './followadvice'
