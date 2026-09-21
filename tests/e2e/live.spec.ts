import { expect, test } from '@playwright/test'
import { choose } from './bar.js'
import fs from 'node:fs'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')
const fixtureText = fs.readFileSync(FIXTURE, 'utf8')
const RINGMOD = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Ringmod.XML')
const ringmodText = fs.readFileSync(RINGMOD, 'utf8')

/** The fake Deluge the init script left on the page (`fake-deluge.entry.ts`). */
interface FakeCardWindow {
  __fakeCard: {
    text: (p: string) => string | null
    deluge: {
      loadInstrument: (xml: string, name: string, dir: string) => void
      deviceChange: (change: { name: string; value: number }) => void
      requests: Record<string, Record<string, unknown>>[]
      live: { type: string; name: string; dir: string; edited: boolean }
      currentPreset: () => string
    }
  }
}

test('Live Edit opens the Deluge’s sound, moves both ways, and saves through the device (docs/live-edit.md)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Tim.XML': fixtureText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  // The button needs no preset first: the mode opens the one the Deluge has.
  // The empty state says so, and the header is not there until the mode is.
  await expect(page.getByTestId('live-button')).toBeEnabled()
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  await page.evaluate((xml) => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.loadInstrument(xml, 'Tim', 'SYNTHS'), fixtureText)
  await page.getByTestId('live-button').click()

  // Entering connects, subscribes, pulls the device's preset and names it
  // after the device's own file; the card copy is identical, so nothing is
  // unsaved. The page is the whole editor, not Follow's subset.
  await expect(page.getByTestId('live-status')).toContainText('Live')
  await expect(page.getByTestId('live-inst')).toContainText('SYNTHS/Tim')
  await expect(page.getByTestId('file-name')).toHaveText('Tim.XML')
  await expect(page.getByTestId('change-count')).toHaveText('0')
  await expect(page.getByTestId('overview')).toBeVisible()
  await expect(page.getByTestId('follow-header')).toHaveCount(0)

  // A move on the device lands on the knob. It is a change against the card's
  // file — Save would write it — and it is counted, not sent back.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await expect(knob).toHaveAttribute('aria-valuenow', '28')
  await page.evaluate(() => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.deviceChange({ name: 'lpfFrequency', value: 0x7fffffff }))
  await expect(knob).toHaveAttribute('aria-valuenow', '50')
  await expect(page.getByTestId('live-counters')).toContainText('1 from Deluge')
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // A move here goes out as one `param`, by the fast path — no preset push.
  await knob.focus()
  await page.keyboard.press('ArrowDown')
  await expect(knob).toHaveAttribute('aria-valuenow', '49')
  await expect(page.getByTestId('live-counters')).toContainText('1 to Deluge')
  await expect(page.getByTestId('live-counters')).toContainText('0 preset pushes')
  const params = await page.evaluate(() => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.requests.filter((r) => 'param' in r).map((r) => r.param))
  expect(params).toHaveLength(1)
  expect(params[0]).toMatchObject({ name: 'lpfFrequency' })

  // Save › Overwrite is the device's own save: it writes its instrument over
  // its file, and the editor is clean against what it read back.
  await choose(page, 'card-overwrite')
  await expect(page.getByTestId('card-saved')).toContainText('Tim.XML written by the Deluge')
  await expect(page.getByTestId('change-count')).toHaveText('0')
  const saved = await page.evaluate(() => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.requests.filter((r) => 'save' in r).map((r) => r.save.path))
  expect(saved).toContain('/SYNTHS/Tim.XML')
  expect(await page.evaluate(() => (globalThis as unknown as FakeCardWindow).__fakeCard.text('/SYNTHS/Tim.XML'))).not.toBe(fixtureText)

  // Leaving keeps the preset as an ordinary loaded file with its card path.
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  await expect(page.getByTestId('file-name')).toHaveText('Tim.XML')
  await expect(knob).toHaveAttribute('aria-valuenow', '49')
})

test('a Deluge whose grant lacks Live Edit leaves the button disabled, with the reason', async ({ page }) => {
  // The ops are there but the device's Sysex Live Edit toggle is off: the
  // grant has no `live`, which the page learns on connecting.
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __fakeOpts: unknown }).__fakeOpts = { liveEdit: 'off' }
  })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')
  await expect(page.getByTestId('live-button')).toBeEnabled() // not connected yet: nothing is known

  await choose(page, 'card-open-button')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await page.keyboard.press('Escape')
  const button = page.getByTestId('live-button')
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('title', /does not offer Live Edit/)
})

test('entering Live Edit over unsaved changes asks first, and Cancel connects nothing (issue #44)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Tim.XML': fixtureText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')
  await page.evaluate((xml) => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.loadInstrument(xml, 'Tim', 'SYNTHS'), fixtureText)
  const subscribed = () =>
    page.evaluate(() => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.requests.filter((r) => 'sub' in r).length)

  // The mode replaces the document with the Deluge's sound, so an edit in
  // the way is asked about in New's words.
  await choose(page, 'new-synth')
  const knob = page.locator('[data-param="lpfFrequency"]')
  await knob.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('confirm')).toContainText(
    'Discard changes to your unsaved preset? Live Edit opens the Deluge’s sound in its place — 1 unsaved change.',
  )
  await expect(page.getByTestId('confirm-go')).toHaveText('Discard')

  // Cancel: the mode stays off, nothing was asked of the Deluge, the edit stays.
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  await expect(page.getByTestId('change-count')).toHaveText('1')
  expect(await subscribed()).toBe(0)

  // Discard: the Deluge's sound takes its place, as from a clean start.
  await page.getByTestId('live-button').click()
  await page.getByTestId('confirm-go').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')
  await expect(page.getByTestId('file-name')).toHaveText('Tim.XML')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // Leaving never asks: the preset stays loaded.
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  await expect(page.getByTestId('confirm')).toHaveCount(0)
})

test('another preset, or a new one, leaves Live Edit and the Deluge keeps its sound (issue #46)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Tim.XML': fixtureText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')
  await page.evaluate((xml) => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.loadInstrument(xml, 'Tim', 'SYNTHS'), fixtureText)
  const device = () =>
    page.evaluate(() => {
      const d = (globalThis as unknown as FakeCardWindow).__fakeCard.deluge
      return { ...d.live, preset: d.currentPreset(), loads: d.requests.filter((r) => 'load' in r).length }
    })
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')

  // Nothing is unsaved, so Open › From this computer just goes, as it does
  // outside the mode. The file is a new document, not an edit to send: the
  // mode ends, and the Deluge still has Tim, untouched.
  await page.getByTestId('file-input').setInputFiles(RINGMOD)
  await expect(page.getByTestId('file-name')).toHaveText('Ringmod.XML')
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  await expect(page.getByTestId('live-button')).not.toHaveClass(/\bon\b/)
  await expect(page.getByTestId('change-count')).toHaveText('0')
  expect(await device()).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS', edited: false, preset: fixtureText, loads: 0 })

  // Back in, with an edit the Deluge has taken. The edit is the Deluge's, so
  // nothing is discarded: an Open asks, says the mode ends, and says where
  // the work stays. Cancel keeps both the mode and the edit.
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')
  await expect(page.getByTestId('file-name')).toHaveText('Tim.XML')
  const knob = page.locator('[data-param="lpfFrequency"]')
  await knob.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('live-counters')).toContainText('1 to Deluge')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.getByTestId('file-input').setInputFiles(RINGMOD)
  await expect(page.getByTestId('confirm')).toContainText('Open Ringmod.XML and leave Live Edit? The Deluge keeps Tim and its 1 unsaved change.')
  await expect(page.getByTestId('confirm-go')).toHaveText('Open')
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // New › Kit asks the same way, and its button is what it does. The blank
  // kit is an ordinary file, and no kit went to the synth clip, which the
  // Deluge would refuse. It keeps Tim, edit and all.
  await choose(page, 'new-kit')
  await expect(page.getByTestId('confirm')).toContainText('Leave Live Edit for a new kit? The Deluge keeps Tim and its 1 unsaved change.')
  await expect(page.getByTestId('confirm-go')).toHaveText('New kit')
  await page.getByTestId('confirm-go').click()
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  await expect(page.getByTestId('file-name')).toHaveText('(unnamed)')
  await expect(page.getByTestId('kit-rows')).toBeVisible()
  expect(await device()).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS', edited: true, loads: 0 })
})

test('an edit the Deluge has not taken is the one thing leaving Live Edit discards, and it says so (issue #46)', async ({ page }) => {
  // A menu open on the Deluge: it refuses every whole-document load as busy.
  await page.addInitScript((seed) => {
    const w = globalThis as unknown as { __cardSeed: unknown; __fakeOpts: unknown }
    w.__cardSeed = seed
    w.__fakeOpts = { liveBusy: true }
  }, { '/SYNTHS/Tim.XML': fixtureText, '/SYNTHS/Ringmod.XML': ringmodText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')
  await page.evaluate((xml) => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.loadInstrument(xml, 'Tim', 'SYNTHS'), fixtureText)
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')

  // An enum goes by the whole document, which the Deluge refuses.
  await page.locator('[data-attr="polyphonic"]').selectOption('mono')
  await expect(page.getByTestId('live-error')).toContainText('menu or browser open')

  // New › Kit tries once more before asking; refused, the edit would be lost,
  // so this question says Discard.
  await choose(page, 'new-kit')
  await expect(page.getByTestId('confirm')).toContainText('Discard the edit the Deluge hasn’t taken? Starting a new kit leaves Live Edit.')
  await expect(page.getByTestId('confirm-go')).toHaveText('Discard')
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')
  await expect(page.locator('[data-attr="polyphonic"]')).toHaveValue('mono')

  // Open › From Deluge arms its row with the same words (issue #47).
  await choose(page, 'card-open-button')
  await page.locator('[data-entry="Ringmod.XML"]').click()
  await expect(page.getByTestId('card-armed')).toHaveText('discards the edit the Deluge hasn’t taken and leaves Live Edit?')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('live-status')).toContainText('Live')

  await choose(page, 'new-kit')
  await page.getByTestId('confirm-go').click()
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  const polyphony = await page.evaluate(() => {
    const d = (globalThis as unknown as FakeCardWindow).__fakeCard.deluge
    return /polyphonic="(\w+)"/.exec(d.currentPreset())?.[1]
  })
  expect(polyphony).toBe('poly')
})

test('Open › From Deluge arms with Live Edit’s words, and the Deluge keeps the edit (issue #47)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Tim.XML': fixtureText, '/SYNTHS/Ringmod.XML': ringmodText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')
  await page.evaluate((xml) => (globalThis as unknown as FakeCardWindow).__fakeCard.deluge.loadInstrument(xml, 'Tim', 'SYNTHS'), fixtureText)
  await page.getByTestId('live-button').click()
  await expect(page.getByTestId('live-status')).toContainText('Live')
  const knob = page.locator('[data-param="lpfFrequency"]')
  await knob.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // The browser arms rather than asks, as it does outside the mode, but the
  // row does not call the edit discarded: the Deluge keeps it.
  await choose(page, 'card-open-button')
  await page.locator('[data-entry="Ringmod.XML"]').click()
  await expect(page.getByTestId('card-armed')).toHaveText('leaves Live Edit? The Deluge keeps Tim and its 1 unsaved change')
  await expect(page.getByTestId('file-name')).toHaveText('Tim.XML') // not loaded yet
  await expect(page.getByTestId('live-status')).toContainText('Live')

  // The second click opens the card's file as an ordinary one, and the mode
  // ends with the Deluge still holding Tim, edit and all. Nothing was pushed.
  await page.locator('[data-entry="Ringmod.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Ringmod.XML')
  await expect(page.getByTestId('live-header')).toHaveCount(0)
  const device = await page.evaluate(() => {
    const d = (globalThis as unknown as FakeCardWindow).__fakeCard.deluge
    return { ...d.live, loads: d.requests.filter((r) => 'load' in r).length, params: d.requests.filter((r) => 'param' in r).length }
  })
  expect(device).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS', edited: true, loads: 0, params: 1 })
})
