/**
 * One job at a time, with what the panel shows about it: a `busy` label,
 * `progress` 0..1, and the `error` or `notice` it left behind. Every store
 * that talks to the card extends this (`card`, `kit`, `samplePick`,
 * `multisample`, `library`), so busy-ness reads the same way everywhere and
 * the guard below is written once.
 *
 * Re-entry: a second `run()` while one is in flight is **refused** — it
 * returns false at once, leaves the running job's state alone, and says so in
 * `notice` ("Still reading /SAMPLES…"). Refusing rather than queueing because
 * the SysEx client does not serialise requests, so two jobs would interleave
 * on the wire and the older could land last; and because every button that
 * starts a job is disabled while `busy` anyway, a refusal is only ever met by
 * code, where a silent queue would hide the race.
 *
 * The one exception is navigation: a folder browser wants the newest listing
 * to win, not the first. `{ supersede: true }` lets a run start over one in
 * flight; the older run's outcome — its error, its clearing of `busy` — is
 * then dropped when it lands, and its job is handed `live()` to ask whether
 * its result still matters (`cardbrowser.svelte.ts`).
 */

import { errorText } from '../errtext'

export interface RunOptions {
  /** Start over a run in flight instead of being refused; see above. */
  supersede?: boolean
}

export class Activity {
  private own = $state<string | null>(null)
  /** What is running, in words; null when idle. A subclass may widen it (`Card` shows the library's transfers too). */
  get busy(): string | null {
    return this.own
  }
  set busy(label: string | null) {
    this.own = label
  }
  progress = $state(0)
  error = $state<string | null>(null)
  /** What the last job did, in words. A new job clears it. */
  notice = $state<string | null>(null)

  /** Counts runs, so a superseded one can tell it no longer speaks for the store. */
  private seq = 0

  /**
   * Run one job. Resolves true when it ran to the end and was not superseded;
   * false when it was refused, threw (the sentence is in `error`), or a newer
   * run took over while it was in flight.
   */
  async run(label: string, fn: (live: () => boolean) => Promise<void>, opts: RunOptions = {}): Promise<boolean> {
    if (this.busy !== null && !opts.supersede) {
      this.notice = `Still ${lowerFirst(this.busy)}…`
      return false
    }
    const mine = ++this.seq
    const live = (): boolean => this.seq === mine
    this.busy = label
    this.progress = 0
    this.error = null
    this.notice = null
    this.onStart(label)
    try {
      await fn(live)
      return live()
    } catch (e) {
      this.onFail(label, e)
      if (live()) this.error = errorText(e)
      return false
    } finally {
      if (live()) {
        this.busy = null
        this.onEnd()
      }
    }
  }

  /** Update the label and/or progress from inside a job. */
  step(label: string | null, progress?: number): void {
    if (label) this.busy = label
    if (progress !== undefined) this.progress = progress
  }

  /** Hooks for a subclass: a run began; a run ended (however); a run threw `e`. */
  protected onStart(_label: string): void {}
  protected onEnd(): void {}
  protected onFail(_label: string, _e: unknown): void {}
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)
