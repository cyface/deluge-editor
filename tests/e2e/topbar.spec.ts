import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { choose } from './bar.js'

const SYNTH = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')
const KIT = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML')

/** An iPad in landscape is 1024 and in portrait 768–834, half a 1440 screen 720, a phone 390. */
const WIDTHS = [1280, 1100, 1024, 834, 768, 720, 640, 390]
/** Below this the bar is two rows (`TopBar.svelte`). */
const TWO_ROWS = 1100

/** How far the page scrolls sideways; zero when it does not. */
const sideways = (page: Page) => page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!

test('the top bar folds to two rows and never scrolls the page sideways (issue #45)', async ({ page }) => {
  await page.goto('/')
  for (const loaded of ['nothing', 'a synth', 'a kit']) {
    if (loaded === 'a synth') await page.getByTestId('file-input').setInputFiles(SYNTH)
    if (loaded === 'a kit') await page.getByTestId('file-input').setInputFiles(KIT)
    for (const width of WIDTHS) {
      await test.step(`${loaded} at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 800 })
        await expect.poll(() => sideways(page)).toBeLessThanOrEqual(0)
        // Two rows below the breakpoint: the commands sit under the preset.
        const bar = await page.locator('.bar').boundingBox()
        const acts = await box(page, 'bar-actions')
        expect(acts.y > bar!.y + 20).toBe(width < TWO_ROWS)
        // The name is not cut short at any of these widths: one row from where
        // it leaves the name room, and below that the top row to itself. The
        // same tolerance as the #37 check (`edit.spec.ts`).
        if (loaded !== 'nothing') {
          await expect
            .poll(() => page.getByTestId('file-name').evaluate((el) => el.scrollWidth - el.clientWidth))
            .toBeLessThanOrEqual(4)
        }
      })
    }
  }
})

test('on a phone the second row scrolls, and every command is still reachable (issue #45)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(SYNTH)

  // The labels shorten, and the row is wider than the phone: it scrolls
  // within itself, the page does not.
  await expect(page.getByTestId('follow-button').locator('.long')).toBeHidden()
  await expect(page.getByTestId('live-button').locator('.long')).toBeHidden()
  await expect(page.getByTestId('follow-button')).toHaveAccessibleName('Follow')
  const row = page.getByTestId('bar-actions')
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(await sideways(page)).toBeLessThanOrEqual(0)

  // New › Synth opens and is chosen.
  await choose(page, 'new-synth')
  await expect(page.getByTestId('file-name')).toHaveText('(unnamed)')

  // Scrolled to its end, a menu still opens under its own button, inside the window.
  await row.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await page.getByTestId('menu-save').click()
  const button = await box(page, 'menu-save')
  const list = await box(page, 'menu-save-list')
  expect(Math.abs(list.y - (button.y + button.height + 5))).toBeLessThanOrEqual(1)
  expect(list.x).toBeGreaterThanOrEqual(0)
  expect(list.x + list.width).toBeLessThanOrEqual(390)
  expect(Math.abs(list.x - Math.min(button.x, 390 - list.width - 8))).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')

  // The last button, off the edge until the row scrolls to it, still works,
  // and the dock it opens starts under the two-row bar.
  await row.evaluate((el) => (el.scrollLeft = 0))
  await page.getByTestId('changes-button').click()
  const bar = await page.locator('.bar').boundingBox()
  const dock = await page.locator('.dock').boundingBox()
  expect(Math.abs(dock!.y - (bar!.y + bar!.height))).toBeLessThanOrEqual(1)
})
