import { expect, test } from '@playwright/test'
import { choose, reveal } from './bar.js'
import fs from 'node:fs'
import path from 'node:path'

const SYNTH = fs.readFileSync(path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML'), 'utf8')
const RINGMOD = fs.readFileSync(path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Ringmod.XML'), 'utf8')

test('Open › Recent: Deluge files reopen by path after a reload, and a file the card lost drops out', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Default Synth.XML': SYNTH, '/SYNTHS/Ringmod.XML': RINGMOD })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  // Empty at first, but there to be found.
  await expect(await reveal(page, 'recent-none')).toBeDisabled()
  await page.keyboard.press('Escape')

  await choose(page, 'card-open-button')
  await page.locator('[data-entry="Ringmod.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Ringmod.XML')
  await choose(page, 'card-open-button')
  await page.locator('[data-entry="Default Synth.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')

  // Newest first, each with its folder.
  await expect(await reveal(page, 'recent-0')).toContainText('Default Synth.XML')
  await expect(page.getByTestId('recent-0')).toContainText('SYNTHS')
  await expect(page.getByTestId('recent-1')).toContainText('Ringmod.XML')
  await page.keyboard.press('Escape')

  // A reload keeps the list, on the start page too; opening an entry
  // connects by itself and reads the path.
  await page.reload()
  await expect(page.getByTestId('landing-recent-0')).toContainText('Default Synth.XML')
  await expect(page.getByTestId('landing-recent-1')).toContainText('Ringmod.XML')
  await page.getByTestId('landing-recent-1').click()
  await expect(page.getByTestId('file-name')).toHaveText('Ringmod.XML')
  await expect(page.getByTestId('card-panel')).toHaveCount(0)
  // Reopened, it moves to the top.
  await expect(await reveal(page, 'recent-0')).toContainText('Ringmod.XML')
  await page.keyboard.press('Escape')

  // A file the card no longer has says so and leaves the list.
  await page.evaluate(() =>
    (globalThis as unknown as { __fakeCard: { files: Map<string, unknown> } }).__fakeCard.files.delete('/SYNTHS/Default Synth.XML'),
  )
  await choose(page, 'recent-1')
  await expect(page.getByRole('alert')).toContainText('/SYNTHS/Default Synth.XML is no longer on the Deluge')
  await expect(page.getByTestId('file-name')).toHaveText('Ringmod.XML')
  await expect(await reveal(page, 'recent-1')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await choose(page, 'recent-clear')
  await expect(await reveal(page, 'recent-none')).toBeVisible()
})

test('Open › Recent: a file picked on this computer reopens through its handle, as it is on disk now', async ({ page }) => {
  // The native picker is out of Playwright's reach: stand in for it with a
  // handle whose file can change between opens, as a file on disk can.
  await page.addInitScript((texts) => {
    const disk = { name: 'Mine.XML', text: texts.synth }
    const handle = {
      kind: 'file',
      name: disk.name,
      getFile: async () => new File([disk.text], disk.name),
      isSameEntry: async (o: { name: string }) => o.name === disk.name,
      queryPermission: async () => 'granted',
    }
    const w = globalThis as unknown as Record<string, unknown>
    w.showOpenFilePicker = async () => [handle]
    w.__disk = disk
    w.__ringmod = texts.ringmod
  }, { synth: SYNTH, ringmod: RINGMOD })
  await page.goto('/')

  await choose(page, 'file-open-button')
  await expect(page.getByTestId('file-name')).toHaveText('Mine.XML')
  await expect(page.getByTestId('summary')).toContainText('Saw and square')
  await expect(await reveal(page, 'recent-0')).toContainText('this computer')
  await page.keyboard.press('Escape')

  // The file changes on disk; Recent reads it again rather than a copy.
  await choose(page, 'new-synth')
  await page.evaluate(() => {
    const w = globalThis as unknown as { __disk: { text: string }; __ringmod: string }
    w.__disk.text = w.__ringmod
  })
  await choose(page, 'recent-0')
  await expect(page.getByTestId('file-name')).toHaveText('Mine.XML')
  await expect(page.getByTestId('summary')).toContainText('ring-modulated')
})
