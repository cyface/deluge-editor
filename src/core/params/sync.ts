/**
 * `syncLevel` and `syncType` as the file has them.
 *
 * syncLevel (`<lfo1 syncLevel>`, `<delay syncLevel>`, `<sidechain syncLevel>`,
 * `<arpeggiator syncLevel>`): 0 is off; otherwise the file value is an absolute
 * note length that the reader shifts into the song's resolution
 * (`Song::convertSyncLevelFromFileValueToInternalValue`: `fileValue + 1 -
 * inputTickMagnitude`, clamped to 1). The menu name for the internal level
 * (`syncValueToString`, `src/deluge/model/sync.cpp`, via
 * `getNoteLengthNameFromMagnitude`, `util/functions.cpp`) therefore depends on
 * the file value alone: magnitude `3 - fileValue`, positive for bars, negative
 * for divisions. With that table a preset written on any song reads the same.
 *
 * syncType: `Serializer::writeSyncTypeToFile` writes the `SyncType` enum
 * value (`src/deluge/model/sync.h`): even 0, triplet 10, dotted 19.
 */

export const SYNC_LEVELS = [
  { value: '0', label: 'Off' },
  { value: '1', label: '4-bar' },
  { value: '2', label: '2-bar' },
  { value: '3', label: '1-bar' },
  { value: '4', label: '2nd' },
  { value: '5', label: '4th' },
  { value: '6', label: '8th' },
  { value: '7', label: '16th' },
  { value: '8', label: '32nd' },
  { value: '9', label: '64th' },
] as const

/** Name for a file `syncLevel`; unknown values come back as the raw string. */
export function syncLevelName(fileValue: string | undefined): string {
  if (fileValue === undefined) return 'Off'
  const n = Number(fileValue)
  if (!Number.isInteger(n) || n < 0) return fileValue
  if (n === 0) return 'Off'
  const magnitude = 3 - n
  if (magnitude >= 0) return `${2 ** magnitude}-bar`
  const division = 2 ** -magnitude
  return `${division}${division % 10 === 2 ? 'nd' : 'th'}`
}

export const SYNC_TYPES = [
  { value: '0', label: 'Even' },
  { value: '10', label: 'Triplet' },
  { value: '19', label: 'Dotted' },
] as const
