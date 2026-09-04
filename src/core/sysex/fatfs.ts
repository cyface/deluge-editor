/**
 * FatFS result codes, as the firmware reports them in every reply's `err`
 * attribute. Source: `FRESULT` in `src/fatfs/ff.h`, upstream/main 3f898e95.
 */

export const FRESULT_NAMES = [
  'FR_OK',
  'FR_DISK_ERR',
  'FR_INT_ERR',
  'FR_NOT_READY',
  'FR_NO_FILE',
  'FR_NO_PATH',
  'FR_INVALID_NAME',
  'FR_DENIED',
  'FR_EXIST',
  'FR_INVALID_OBJECT',
  'FR_WRITE_PROTECTED',
  'FR_INVALID_DRIVE',
  'FR_NOT_ENABLED',
  'FR_NO_FILESYSTEM',
  'FR_MKFS_ABORTED',
  'FR_TIMEOUT',
  'FR_LOCKED',
  'FR_NOT_ENOUGH_CORE',
  'FR_TOO_MANY_OPEN_FILES',
  'FR_INVALID_PARAMETER',
] as const

export const fresultName = (code: number): string => FRESULT_NAMES[code] ?? `FRESULT ${code}`

/**
 * Every code as a lower-case clause a user can read (the meanings are the
 * `FRESULT` comments in `ff.h`); the FatFS name is for the log, not the
 * screen — `src/ui/errtext.ts` puts these in front of people.
 */
const FRIENDLY: Record<number, string> = {
  0: 'no error',
  1: 'the card could not be read — is an SD card inserted?',
  2: 'the card reported an internal error',
  3: 'the card is not ready',
  4: 'no such file',
  5: 'no such folder',
  6: 'that name is not valid on the card',
  7: 'access denied (card full, or the folder is full)',
  8: 'a file or folder with that name already exists',
  9: 'the file was no longer open on the Deluge',
  10: 'the card is write-protected',
  11: 'no such drive',
  12: 'the card is not mounted',
  13: 'no filesystem on the card',
  14: 'formatting was aborted',
  15: 'the card timed out',
  16: 'the file is in use on the Deluge',
  17: 'the Deluge ran out of memory',
  18: 'too many files are open on the Deluge',
  19: 'the Deluge rejected the request as invalid',
}

export const fresultMessage = (code: number): string => FRIENDLY[code] ?? `the card reported error ${code}`
