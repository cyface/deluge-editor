/**
 * The FatFS result table, pinned to `FRESULT` in `src/fatfs/ff.h`
 * (SynthstromAudible/DelugeFirmware `beta`, lines 279-298): twenty codes,
 * FR_OK = 0 through FR_INVALID_PARAMETER = 19, in this order. Every reply's
 * `err` is one of these, so a shifted entry would name the wrong fault.
 */
import { describe, expect, it } from 'vitest'
import { FRESULT_NAMES, fresultMessage, fresultName } from './fatfs'

/** `ff.h` `FRESULT`, transcribed with its numbering. */
const FF_H: Record<number, string> = {
  0: 'FR_OK',
  1: 'FR_DISK_ERR',
  2: 'FR_INT_ERR',
  3: 'FR_NOT_READY',
  4: 'FR_NO_FILE',
  5: 'FR_NO_PATH',
  6: 'FR_INVALID_NAME',
  7: 'FR_DENIED',
  8: 'FR_EXIST',
  9: 'FR_INVALID_OBJECT',
  10: 'FR_WRITE_PROTECTED',
  11: 'FR_INVALID_DRIVE',
  12: 'FR_NOT_ENABLED',
  13: 'FR_NO_FILESYSTEM',
  14: 'FR_MKFS_ABORTED',
  15: 'FR_TIMEOUT',
  16: 'FR_LOCKED',
  17: 'FR_NOT_ENOUGH_CORE',
  18: 'FR_TOO_MANY_OPEN_FILES',
  19: 'FR_INVALID_PARAMETER',
}

describe('FRESULT', () => {
  it('is the ff.h enum, in the ff.h order', () => {
    expect(FRESULT_NAMES.length).toBe(20)
    for (const [code, name] of Object.entries(FF_H)) expect(fresultName(Number(code))).toBe(name)
  })

  it('has a readable clause for every code, and a fallback past the table', () => {
    for (let code = 0; code < FRESULT_NAMES.length; code++) {
      const msg = fresultMessage(code)
      expect(msg, FRESULT_NAMES[code]).not.toContain('error 2') // the fallback would say "error N"
      expect(msg.length).toBeGreaterThan(0)
      expect(msg).not.toMatch(/FR_/) // the FatFS name is for the log, not the screen
    }
    expect(fresultName(20)).toBe('FRESULT 20')
    expect(fresultMessage(20)).toBe('the card reported error 20')
  })

  it('the codes the library code acts on sit where it expects them', () => {
    // `src/core/library/fs.ts` `cardErrorCode` reads these three by number.
    expect(fresultName(4)).toBe('FR_NO_FILE')
    expect(fresultName(5)).toBe('FR_NO_PATH')
    expect(fresultName(8)).toBe('FR_EXIST')
  })
})
