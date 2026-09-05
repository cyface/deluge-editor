import { expect, test } from '@playwright/test'
import { choose } from './bar.js'
import fs from 'node:fs'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')
const fixtureText = fs.readFileSync(FIXTURE, 'utf8')

/** The fake Deluge the init script left on the page (`fake-deluge.entry.ts`). */
interface FakeCardWindow {
  __fakeCard: {
    text: (p: string) => string | null
    deluge: {
      loadInstrument: (xml: string, name: string, dir: string) => void
      deviceChange: (change: { name: string; value: number }) => void
      requests: Record<string, Record<string, unknown>>[]
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
