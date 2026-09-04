import { expect, test, type Page } from '@playwright/test'
import { choose } from './bar.js'
import fs from 'node:fs'
import path from 'node:path'

const KIT = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML')
const kitText = fs.readFileSync(KIT, 'utf8')
const RANGES = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML')
const rangesText = fs.readFileSync(RANGES, 'utf8')

/** The fake card's view, from the page. */
const cardText = (page: Page, p: string): Promise<string | null> =>
  page.evaluate((q) => (globalThis as unknown as { __fakeCard: { text: (p: string) => string | null } }).__fakeCard.text(q), p)
const cardPaths = (page: Page): Promise<string[]> =>
  page.evaluate(() => (globalThis as unknown as { __fakeCard: { paths: () => string[] } }).__fakeCard.paths())

/** The page's one question dialog: read it, say yes. */
async function agree(page: Page, expected: RegExp): Promise<void> {
  await expect(page.getByTestId('confirm')).toContainText(expected)
  await page.getByTestId('confirm-go').click()
}

test('sample library: usages, rename, move a folder and delete, with every referencing file rewritten', async ({ page }) => {
  const seed: Record<string, string> = {
    '/KITS/Kit Sample Rows.XML': kitText,
    '/SYNTHS/Sample Ranges.XML': rangesText,
  }
  for (const f of ['kick', 'snare', 'hat-closed', 'hat-open', 'crash', 'range-low', 'range-high', 'unused']) {
    seed[`/SAMPLES/Fixtures/${f}.wav`] = `RIFF${f}`
  }
  await page.addInitScript((s) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = s
  }, seed)
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  // Open the kit in the editor first: the library keeps it in step too.
  await choose(page, 'card-open-button')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await page.getByLabel('Up').click()
  await page.locator('[data-testid="card-panel"] [data-entry="KITS"]').click()
  await page.locator('[data-testid="card-panel"] [data-entry="Kit Sample Rows.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Kit Sample Rows.XML')

  await choose(page, 'library-button')
  const panel = page.getByTestId('library-panel')
  await expect(panel).toBeVisible()
  // The references are read from every song, kit and synth on the card.
  await expect(page.getByTestId('library-index')).toContainText('0 songs, 1 kits, 1 synths')
  await expect(page.getByTestId('library-path')).toHaveText('/SAMPLES')

  // The folder is named by both files; inside it each sample says who names it.
  const fixtures = panel.locator('[data-entry="Fixtures"]')
  await expect(fixtures.getByTestId('library-used')).toHaveText('2')
  await fixtures.locator('.entry').click()
  await expect(page.getByTestId('library-path')).toHaveText('/SAMPLES/Fixtures')
  const kick = panel.locator('[data-entry="kick.wav"]')
  const unused = panel.locator('[data-entry="unused.wav"]')
  await expect(kick.getByTestId('library-used')).toHaveText('1')
  await expect(unused.getByTestId('library-used')).toHaveText('0')
  // Only an unreferenced sample offers Delete.
  await expect(kick.getByTestId('library-delete')).toHaveCount(0)
  await expect(unused.getByTestId('library-delete')).toHaveCount(1)
  await kick.locator('.entry').click()
  await expect(page.getByTestId('library-usages')).toContainText('Kit Sample Rows.XML')

  // Rename: the kit that names it is rewritten, and nothing is left beside it.
  await kick.getByTestId('library-rename-start').click()
  await page.getByTestId('library-rename').fill('Kick 808.wav')
  await page.getByTestId('library-rename-go').click()
  await agree(page, /Rename sample SAMPLES\/Fixtures\/kick\.wav to Kick 808\.wav\? 1 file will be rewritten to follow: KITS\/Kit Sample Rows\.XML/)
  await expect(page.getByTestId('library-notice')).toContainText('1 file updated')
  const kitAfterRename = await cardText(page, '/KITS/Kit Sample Rows.XML')
  expect(kitAfterRename).toBe(kitText.replace('SAMPLES/Fixtures/kick.wav', 'SAMPLES/Fixtures/Kick 808.wav'))
  expect(await cardPaths(page)).toContain('/SAMPLES/Fixtures/Kick 808.wav')
  expect((await cardPaths(page)).filter((p) => /\.(tmp|bak)$/.test(p))).toEqual([])
  // The kit open in the editor followed, as one change the dock can show.
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // Move the whole folder: both files follow, every reference under it.
  await panel.getByLabel('Up', { exact: true }).click()
  await expect(page.getByTestId('library-path')).toHaveText('/SAMPLES')
  await panel.getByRole('button', { name: 'New folder' }).click()
  await page.getByTestId('library-new-folder').fill('Library')
  await page.getByTestId('library-new-folder').press('Enter')
  await expect(panel.locator('[data-entry="Library"]')).toBeVisible()
  await panel.locator('[data-entry="Fixtures"]').getByTestId('library-move-start').click()
  const picker = page.getByTestId('library-move-picker')
  await picker.getByRole('button', { name: '▸ Library' }).click()
  await page.getByTestId('library-move-here').click()
  await agree(page, /Move folder SAMPLES\/Fixtures to SAMPLES\/Library\/\? 2 files will be rewritten/)
  await expect(page.getByTestId('library-notice')).toContainText('2 files updated')
  expect(await cardText(page, '/SYNTHS/Sample Ranges.XML')).toBe(
    rangesText.replaceAll('SAMPLES/Fixtures/', 'SAMPLES/Library/Fixtures/'),
  )
  expect(await cardText(page, '/KITS/Kit Sample Rows.XML')).toBe(
    kitAfterRename!.replaceAll('SAMPLES/Fixtures/', 'SAMPLES/Library/Fixtures/'),
  )
  expect(await cardPaths(page)).toContain('/SAMPLES/Library/Fixtures/Kick 808.wav')
  expect((await cardPaths(page)).some((p) => p.startsWith('/SAMPLES/Fixtures/'))).toBe(false)

  // Delete the one sample nothing names; the folder itself is still used, so it can't go.
  await panel.locator('[data-entry="Library"] .entry').click()
  await panel.locator('[data-entry="Fixtures"] .entry').click()
  await expect(page.getByTestId('library-path')).toHaveText('/SAMPLES/Library/Fixtures')
  await panel.locator('[data-entry="unused.wav"]').getByTestId('library-delete').click()
  await agree(page, /Delete SAMPLES\/Library\/Fixtures\/unused\.wav\?/)
  await expect(page.getByTestId('library-notice')).toContainText('unused.wav deleted')
  expect(await cardPaths(page)).not.toContain('/SAMPLES/Library/Fixtures/unused.wav')
  await expect(panel.locator('[data-entry="unused.wav"]')).toHaveCount(0)
})
