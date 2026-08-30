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

/** A few codes get a human sentence; the rest show their FatFS name. */
const FRIENDLY: Record<number, string> = {
  3: 'the card is not ready',
  4: 'no such file',
  5: 'no such folder',
  7: 'access denied (card full, or the folder is full)',
  10: 'the card is write-protected',
  13: 'no filesystem on the card',
}

export const fresultMessage = (code: number): string => FRIENDLY[code] ?? fresultName(code)
