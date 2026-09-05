/**
 * The card over smSysex, as a `CardFS`. Paths pass straight through — both
 * sides use the protocol's leading-slash form. A `SysexError` comes out as a
 * `CardError` carrying the FatFS code's meaning (`cardErrorCode`) and the
 * original as `cause`. The client's other failures are plain errors: a
 * read-back that differs becomes `verify`, and the rest — no reply, a frame
 * too big — are `io`, so nothing the transport does can read as absence.
 * `mkdir` swallows FR_EXIST, which is the contract (`fs.ts`): asking for a
 * folder that is there is not a failure.
 */

import { SysexError, type SmsClient } from '../sysex'
import { CardError, cardErrorCode, type CardFS } from './fs'

const FR_EXIST = 8

const asCardError = (e: unknown): unknown => {
  if (e instanceof CardError) return e
  if (e instanceof SysexError) return new CardError(cardErrorCode(e.code), e.message, { cause: e })
  if (e instanceof Error) return new CardError(e.message.startsWith('verify ') ? 'verify' : 'io', e.message, { cause: e })
  return e
}

const mapped = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run()
  } catch (e) {
    throw asCardError(e)
  }
}

export function smsFS(client: SmsClient): CardFS {
  return {
    list: (path) => mapped(() => client.listDirectory(path)),
    read: (path, onProgress) => mapped(() => client.readFile(path, onProgress)),
    reader: (path) => mapped(() => client.openRead(path)),
    // Preset XML gets the byte-for-byte verify, as the editor's own saves do.
    write: (path, data, onProgress) => mapped(() => client.writeFile(path, data, onProgress, 'full')),
    rename: (from, to) => mapped(() => client.rename(from, to)),
    remove: (path) => mapped(() => client.deleteFile(path)),
    async mkdir(path) {
      try {
        await client.mkdir(path)
      } catch (e) {
        if (!(e instanceof SysexError && e.code === FR_EXIST)) throw asCardError(e)
      }
    },
  }
}
