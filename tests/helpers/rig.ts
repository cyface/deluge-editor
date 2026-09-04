/**
 * A client wired straight to a fake Deluge: what every SysEx-level test
 * starts from. Replies are synchronous, so the timeouts are short — a test
 * about a lost request waits milliseconds, not the seconds a real card gets.
 */

import { SmsClient, type SmsClientOptions } from '../../src/core/sysex/client'
import { FakeDeluge, type FakeOptions } from '../../src/core/sysex/fake-deluge'

/** The retry ladder tests use unless they say otherwise. */
export const TEST_TIMEOUTS: readonly number[] = [20, 20, 50, 100]

export function rig(fakeOpts: FakeOptions = {}, clientOpts: SmsClientOptions = {}): { client: SmsClient; fake: FakeDeluge } {
  let client: SmsClient
  const fake = new FakeDeluge((bytes) => client!.receive(bytes), fakeOpts)
  client = new SmsClient((bytes) => fake.receive(bytes), { timeouts: [...TEST_TIMEOUTS], ...clientOpts })
  return { client, fake }
}
