/**
 * The card over smSysex, as a `CardFS`. Paths pass straight through — both
 * sides use the protocol's leading-slash form. `mkdir` swallows FR_EXIST,
 * which is the contract (`fs.ts`): asking for a folder that is there is not
 * a failure.
 */

import { isDirectory, SysexError, type SmsClient } from '../sysex'
import type { CardFS } from './fs'

const FR_EXIST = 8

export function smsFS(client: SmsClient): CardFS {
  return {
    async list(path) {
      return (await client.listDirectory(path)).map((e) => ({
        name: e.name,
        size: e.size,
        date: e.date,
        time: e.time,
        dir: isDirectory(e),
      }))
    },
    read: (path, onProgress) => client.readFile(path, onProgress),
    reader: (path) => client.openRead(path),
    // Preset XML gets the byte-for-byte verify, as the editor's own saves do.
    write: (path, data, onProgress) => client.writeFile(path, data, onProgress, 'full'),
    rename: (from, to) => client.rename(from, to),
    remove: (path) => client.deleteFile(path),
    async mkdir(path) {
      try {
        await client.mkdir(path)
      } catch (e) {
        if (!(e instanceof SysexError && e.code === FR_EXIST)) throw e
      }
    },
  }
}
