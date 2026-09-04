/**
 * The one job-at-a-time rule every card-facing store inherits: what `run()`
 * shows while a job runs, what it leaves behind, and — the part that matters
 * — that a second job cannot start over the first, except where navigation
 * asks to supersede it, in which case the older job's outcome is dropped.
 */
import { describe, expect, it } from 'vitest'
import { Activity } from './activity.svelte'

/** A promise to settle by hand, so two jobs can be made to land in either order. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Activity.run', () => {
  it('shows the label while the job runs and clears it after', async () => {
    const a = new Activity()
    const job = deferred()
    a.notice = 'from last time'
    const done = a.run('Reading /SAMPLES', async () => {
      a.step(null, 0.5)
      await job.promise
    })
    expect(a.busy).toBe('Reading /SAMPLES')
    expect(a.notice).toBeNull() // a new job supersedes the last one's report
    expect(a.progress).toBe(0.5)
    job.resolve()
    expect(await done).toBe(true)
    expect(a.busy).toBeNull()
    expect(a.error).toBeNull()
  })

  it('turns a thrown error into the panel sentence and reports the job as not done', async () => {
    const a = new Activity()
    expect(await a.run('Writing X', async () => Promise.reject(new Error('no such file.')))).toBe(false)
    expect(a.error).toBe('No such file')
    expect(a.busy).toBeNull()
  })

  it('refuses a second job while one is in flight, and says so', async () => {
    const a = new Activity()
    const first = deferred()
    let secondRan = false
    const p1 = a.run('Reading /SAMPLES', () => first.promise)
    const p2 = a.run('Writing Kit.XML', async () => {
      secondRan = true
    })
    expect(await p2).toBe(false)
    expect(secondRan).toBe(false)
    expect(a.busy).toBe('Reading /SAMPLES') // the running job's state is untouched
    expect(a.notice).toBe('Still reading /SAMPLES…')
    first.resolve()
    expect(await p1).toBe(true)
    // Idle again: the next job is taken.
    expect(await a.run('Writing Kit.XML', async () => {})).toBe(true)
  })

  it('lets a superseding job start, and drops the older job when it lands last', async () => {
    const a = new Activity()
    const older = deferred()
    const newer = deferred()
    let olderLive: boolean | null = null
    const p1 = a.run(
      'Reading /A',
      async (live) => {
        await older.promise
        olderLive = live()
        throw new Error('A went wrong late')
      },
      { supersede: true },
    )
    const p2 = a.run('Reading /B', () => newer.promise, { supersede: true })
    expect(a.busy).toBe('Reading /B')
    newer.resolve()
    expect(await p2).toBe(true)
    expect(a.busy).toBeNull()
    older.resolve()
    expect(await p1).toBe(false)
    expect(olderLive).toBe(false)
    expect(a.error).toBeNull() // the stale job's failure is nobody's news
    expect(a.busy).toBeNull()
  })

  it('a superseded job that lands first does not clear the newer one’s busy line', async () => {
    const a = new Activity()
    const older = deferred()
    const newer = deferred()
    const p1 = a.run('Reading /A', () => older.promise, { supersede: true })
    const p2 = a.run('Reading /B', () => newer.promise, { supersede: true })
    older.resolve()
    expect(await p1).toBe(false)
    expect(a.busy).toBe('Reading /B')
    newer.resolve()
    expect(await p2).toBe(true)
    expect(a.busy).toBeNull()
  })
})
