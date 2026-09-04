/**
 * The on-device folder browser the kit builder, sample picker and folder
 * import share. The card is a stand-in here: what is checked is the
 * navigation — that the newest listing wins whichever order the card
 * answers in, where Up stops, and what a listing says about its WAVs.
 */
import { describe, expect, it } from 'vitest'
import { Activity } from './activity.svelte'
import { CardBrowser, type BrowseEntry } from './cardbrowser.svelte'

type Listing = { promise: Promise<BrowseEntry[]>; resolve: (e: BrowseEntry[]) => void; reject: (e: unknown) => void }

/** A card whose every listing is settled by the test, in whatever order it likes. */
function fakeCard() {
  const pending = new Map<string, Listing>()
  const list = (path: string): Promise<BrowseEntry[]> => {
    let resolve!: Listing['resolve']
    let reject!: Listing['reject']
    const promise = new Promise<BrowseEntry[]>((res, rej) => {
      resolve = res
      reject = rej
    })
    pending.set(path, { promise, resolve, reject })
    return promise
  }
  return { list, answer: (path: string, entries: BrowseEntry[]) => pending.get(path)!.resolve(entries), fail: (path: string, e: unknown) => pending.get(path)!.reject(e) }
}

const rig = (onListed?: () => void) => {
  const card = fakeCard()
  const activity = new Activity()
  const browser = new CardBrowser(activity, { connect: async () => {}, list: card.list, onListed })
  return { card, activity, browser }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('CardBrowser', () => {
  it('opens at its root, on the owner’s busy line, and remembers where it was', async () => {
    const { card, activity, browser } = rig()
    const open = browser.open()
    await settle()
    expect(activity.busy).toBe('Reading /SAMPLES')
    card.answer('/SAMPLES', [{ name: 'Drums', dir: true }])
    await open
    expect(browser.path).toBe('/SAMPLES')
    expect(browser.entries).toEqual([{ name: 'Drums', dir: true }])
    expect(browser.last).toBe('/SAMPLES')
    expect(activity.busy).toBeNull()
  })

  it('shows the newest listing when an older one lands after it', async () => {
    const { card, browser } = rig()
    const a = browser.open('/SAMPLES/A')
    const b = browser.open('/SAMPLES/B')
    await settle()
    card.answer('/SAMPLES/B', [{ name: 'b.wav', dir: false }])
    await b
    expect(browser.path).toBe('/SAMPLES/B')
    card.answer('/SAMPLES/A', [{ name: 'a.wav', dir: false }])
    await a
    // A's reply arrived last and was dropped: B is what the user asked for most recently.
    expect(browser.path).toBe('/SAMPLES/B')
    expect(browser.entries).toEqual([{ name: 'b.wav', dir: false }])
    expect(browser.last).toBe('/SAMPLES/B')
  })

  it('shows the newest listing when the older one lands first, too', async () => {
    const { card, browser, activity } = rig()
    const a = browser.open('/SAMPLES/A')
    const b = browser.open('/SAMPLES/B')
    await settle()
    card.answer('/SAMPLES/A', [{ name: 'a.wav', dir: false }])
    await a
    expect(browser.path).toBeNull() // A is stale; nothing has landed yet
    expect(activity.busy).toBe('Reading /SAMPLES/B')
    card.answer('/SAMPLES/B', [])
    await b
    expect(browser.path).toBe('/SAMPLES/B')
  })

  it('a stale listing’s failure is not reported over the newer one', async () => {
    const { card, browser, activity } = rig()
    const a = browser.open('/SAMPLES/A')
    const b = browser.open('/SAMPLES/B')
    await settle()
    card.answer('/SAMPLES/B', [])
    await b
    card.fail('/SAMPLES/A', new Error('timed out'))
    await a
    expect(activity.error).toBeNull()
  })

  it('goes up one folder and no further than the root, and into a folder of the one on show', async () => {
    const { card, browser } = rig()
    const open = browser.open('/SAMPLES/Drums/808')
    await settle()
    card.answer('/SAMPLES/Drums/808', [])
    await open
    browser.up()
    await settle()
    card.answer('/SAMPLES/Drums', [{ name: '909', dir: true }])
    await settle()
    expect(browser.path).toBe('/SAMPLES/Drums')
    browser.enter('909')
    await settle()
    card.answer('/SAMPLES/Drums/909', [])
    await settle()
    expect(browser.path).toBe('/SAMPLES/Drums/909')
    browser.up()
    await settle()
    card.answer('/SAMPLES/Drums', [])
    await settle()
    browser.up()
    await settle()
    card.answer('/SAMPLES', [])
    await settle()
    expect(browser.path).toBe('/SAMPLES')
    browser.up() // at the root: nothing to list, nothing listed
    await settle()
    expect(browser.path).toBe('/SAMPLES')
  })

  it('says whether the folder holds a WAV, tells its owner a listing landed, and forgets the folder on close', async () => {
    let listed = 0
    const { card, browser } = rig(() => listed++)
    const open = browser.open()
    await settle()
    card.answer('/SAMPLES', [{ name: 'Drums', dir: true }, { name: 'notes.txt', dir: false }])
    await open
    expect(browser.hasWavs).toBe(false)
    expect(listed).toBe(1)
    browser.entries = [{ name: 'Kick.WAV', dir: false }]
    expect(browser.hasWavs).toBe(true)
    browser.close()
    expect(browser.path).toBeNull()
    expect(browser.entries).toEqual([])
    expect(browser.last).toBe('/SAMPLES') // where to reopen is kept
  })
})
