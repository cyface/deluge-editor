import { expect, test, type Page } from '@playwright/test'
import { choose } from './bar.js'
import fs from 'node:fs'
import path from 'node:path'

const KIT = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML')
const kitText = fs.readFileSync(KIT, 'utf8')
const RANGES = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML')
const rangesText = fs.readFileSync(RANGES, 'utf8')

/**
 * The card in a reader, played by Chrome's origin-private file system: a
 * real `FileSystemDirectoryHandle`, so `localcard.ts` runs against the
 * browser's own implementation — `entries()`, `createWritable()`, `move()`
 * for files, and the copy-then-remove path for a folder, which no browser
 * moves as a handle. `showDirectoryPicker` is replaced by a function that
 * seeds that root from the spec's card and returns it.
 */
const MOUNT = `(() => {
  const seed = globalThis.__cardSeed || {}
  globalThis.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory()
    for await (const [name] of root.entries()) await root.removeEntry(name, { recursive: true })
    for (const [p, text] of Object.entries(seed)) {
      const parts = p.split('/').filter(Boolean)
      let dir = root
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true })
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true })
      const w = await fh.createWritable()
      await w.write(new TextEncoder().encode(text))
      await w.close()
    }
    return root
  }
  const walk = async (dir, prefix, out) => {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'directory') await walk(h, prefix + '/' + name, out)
      else out.push(prefix + '/' + name)
    }
    return out
  }
  globalThis.__mounted = {
    paths: async () => (await walk(await navigator.storage.getDirectory(), '', [])).sort(),
    text: async (p) => {
      let dir = await navigator.storage.getDirectory()
      const parts = p.split('/').filter(Boolean)
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg)
      return await (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text()
    },
  }
})()`

type Mounted = { __mounted: { paths: () => Promise<string[]>; text: (p: string) => Promise<string> } }
const cardText = (page: Page, p: string): Promise<string> =>
  page.evaluate((q) => (globalThis as unknown as Mounted).__mounted.text(q), p)
const cardPaths = (page: Page): Promise<string[]> => page.evaluate(() => (globalThis as unknown as Mounted).__mounted.paths())

async function agree(page: Page, expected: RegExp): Promise<void> {
  await expect(page.getByTestId('confirm')).toContainText(expected)
  await page.getByTestId('confirm-go').click()
}

test('sample library on a mounted card: the same rename, folder move and delete over the File System Access API', async ({ page }) => {
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
  await page.addInitScript(MOUNT)
  await page.goto('/')

  await choose(page, 'library-mounted-button')
  const panel = page.getByTestId('library-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-source', 'mounted')
  await expect(panel).toContainText('Samples on the card')
  await expect(page.getByTestId('library-index')).toContainText('0 songs, 1 kits, 1 synths')

  // Usage counts come out the same as over SysEx: the index is the same code.
  const fixtures = panel.locator('[data-entry="Fixtures"]')
  await expect(fixtures.getByTestId('library-used')).toHaveText('2')
  await fixtures.locator('.entry').click()
  const kick = panel.locator('[data-entry="kick.wav"]')
  await expect(kick.getByTestId('library-used')).toHaveText('1')
  await expect(panel.locator('[data-entry="unused.wav"]').getByTestId('library-delete')).toHaveCount(1)

  // Rename a file: FileSystemFileHandle.move(), and the kit rewritten beside itself.
  await kick.getByTestId('library-rename-start').click()
  await page.getByTestId('library-rename').fill('Kick 808.wav')
  await page.getByTestId('library-rename-go').click()
  await agree(page, /Rename sample SAMPLES\/Fixtures\/kick\.wav to Kick 808\.wav\? 1 file will be rewritten/)
  await expect(page.getByTestId('library-notice')).toContainText('1 file updated')
  const kitAfterRename = await cardText(page, '/KITS/Kit Sample Rows.XML')
  expect(kitAfterRename).toBe(kitText.replace('SAMPLES/Fixtures/kick.wav', 'SAMPLES/Fixtures/Kick 808.wav'))
  expect(await cardPaths(page)).toContain('/SAMPLES/Fixtures/Kick 808.wav')
  expect(await cardPaths(page)).not.toContain('/SAMPLES/Fixtures/kick.wav')
  expect((await cardPaths(page)).filter((p) => /\.(tmp|bak)$/.test(p))).toEqual([])

  // A rename that only changes case: the same entry, allowed, no collision.
  const kick808 = panel.locator('[data-entry="Kick 808.wav"]')
  await kick808.getByTestId('library-rename-start').click()
  await page.getByTestId('library-rename').fill('KICK 808.wav')
  await page.getByTestId('library-rename-go').click()
  await agree(page, /Rename sample SAMPLES\/Fixtures\/Kick 808\.wav to KICK 808\.wav\?/)
  await expect(page.getByTestId('library-notice')).toContainText('SAMPLES/Fixtures/KICK 808.wav · 1 file updated')
  expect(await cardPaths(page)).toContain('/SAMPLES/Fixtures/KICK 808.wav')

  // Move the folder: no browser moves a directory handle, so this is the copy-then-remove path.
  await panel.getByLabel('Up', { exact: true }).click()
  await panel.getByRole('button', { name: 'New folder' }).click()
  await page.getByTestId('library-new-folder').fill('Library')
  await page.getByTestId('library-new-folder').press('Enter')
  await expect(panel.locator('[data-entry="Library"]')).toBeVisible()
  await panel.locator('[data-entry="Fixtures"]').getByTestId('library-move-start').click()
  await page.getByTestId('library-move-picker').getByRole('button', { name: '▸ Library' }).click()
  await page.getByTestId('library-move-here').click()
  await agree(page, /Move folder SAMPLES\/Fixtures to SAMPLES\/Library\/\? 2 files will be rewritten/)
  await expect(page.getByTestId('library-notice')).toContainText('2 files updated')
  expect(await cardText(page, '/SYNTHS/Sample Ranges.XML')).toBe(rangesText.replaceAll('SAMPLES/Fixtures/', 'SAMPLES/Library/Fixtures/'))
  const paths = await cardPaths(page)
  expect(paths).toContain('/SAMPLES/Library/Fixtures/KICK 808.wav')
  expect(paths).toContain('/SAMPLES/Library/Fixtures/snare.wav')
  expect(paths.some((p) => p.startsWith('/SAMPLES/Fixtures/'))).toBe(false)

  // Delete the unreferenced sample.
  await panel.locator('[data-entry="Library"] .entry').click()
  await panel.locator('[data-entry="Fixtures"] .entry').click()
  await panel.locator('[data-entry="unused.wav"]').getByTestId('library-delete').click()
  await agree(page, /Delete SAMPLES\/Library\/Fixtures\/unused\.wav\?/)
  await expect(page.getByTestId('library-notice')).toContainText('unused.wav deleted')
  expect(await cardPaths(page)).not.toContain('/SAMPLES/Library/Fixtures/unused.wav')
})

test('a folder that is not a Deluge card is refused before anything is read', async ({ page }) => {
  await page.addInitScript((s) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = s
  }, { '/Photos/holiday.txt': 'not a card' })
  await page.addInitScript(MOUNT)
  await page.goto('/')
  await choose(page, 'library-mounted-button')
  await expect(page.getByTestId('library-error')).toContainText('not a Deluge card')
})
