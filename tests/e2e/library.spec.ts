import { expect, test, type Page } from '@playwright/test'
import { choose } from './bar.js'
import fs from 'node:fs'
import path from 'node:path'

const KIT = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML')
const kitText = fs.readFileSync(KIT, 'utf8')
const RANGES = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML')
const rangesText = fs.readFileSync(RANGES, 'utf8')

/**
 * The sample library runs over two cards: the Deluge over SysEx (the fake in
 * `fake-deluge.js`) and a card in a reader over the File System Access API.
 * The same scenario is run over both, so the two backends cannot drift in
 * what they let the library do.
 */
interface Backend {
  name: string
  /** Seed the card and install the backend; before `page.goto`. */
  install(page: Page, seed: Record<string, string>): Promise<void>
  /** The top-bar item that opens the library on this card. */
  open: string
  /** What the panel says about where the samples are. */
  source: { attr: string; heading: string }
  cardText(page: Page, p: string): Promise<string | null>
  cardPaths(page: Page): Promise<string[]>
}

const seedScript = (page: Page, seed: Record<string, string>) =>
  page.addInitScript((s) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = s
  }, seed)

const sysex: Backend = {
  name: 'the Deluge over SysEx',
  async install(page, seed) {
    await seedScript(page, seed)
    await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  },
  open: 'library-button',
  source: { attr: 'deluge', heading: 'Samples on the Deluge' },
  cardText: (page, p) =>
    page.evaluate((q) => (globalThis as unknown as { __fakeCard: { text: (p: string) => string | null } }).__fakeCard.text(q), p),
  cardPaths: (page) => page.evaluate(() => (globalThis as unknown as { __fakeCard: { paths: () => string[] } }).__fakeCard.paths()),
}

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

const mounted: Backend = {
  name: 'a card in a reader',
  async install(page, seed) {
    await seedScript(page, seed)
    await page.addInitScript(MOUNT)
  },
  open: 'library-mounted-button',
  source: { attr: 'mounted', heading: 'Samples on the card' },
  cardText: (page, p) => page.evaluate((q) => (globalThis as unknown as Mounted).__mounted.text(q), p),
  cardPaths: (page) => page.evaluate(() => (globalThis as unknown as Mounted).__mounted.paths()),
}

const BACKENDS = [sysex, mounted]

/** The fixtures' card: a kit and a synth naming samples under one folder, plus one sample nothing names. */
function fixtureCard(): Record<string, string> {
  const seed: Record<string, string> = {
    '/KITS/Kit Sample Rows.XML': kitText,
    '/SYNTHS/Sample Ranges.XML': rangesText,
  }
  for (const f of ['kick', 'snare', 'hat-closed', 'hat-open', 'crash', 'range-low', 'range-high', 'unused']) {
    seed[`/SAMPLES/Fixtures/${f}.wav`] = `RIFF${f}`
  }
  return seed
}

/** The page's one question dialog: read it, say yes. */
async function agree(page: Page, expected: RegExp): Promise<void> {
  await expect(page.getByTestId('confirm')).toContainText(expected)
  await page.getByTestId('confirm-go').click()
}

for (const card of BACKENDS) {
  test(`sample library over ${card.name}: usages, rename, move a folder and delete, with every referencing file rewritten`, async ({ page }) => {
    await card.install(page, fixtureCard())
    await page.goto('/')

    await choose(page, card.open)
    const panel = page.getByTestId('library-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-source', card.source.attr)
    await expect(panel).toContainText(card.source.heading)
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
    const kitAfterRename = await card.cardText(page, '/KITS/Kit Sample Rows.XML')
    expect(kitAfterRename).toBe(kitText.replace('SAMPLES/Fixtures/kick.wav', 'SAMPLES/Fixtures/Kick 808.wav'))
    expect(await card.cardPaths(page)).toContain('/SAMPLES/Fixtures/Kick 808.wav')
    expect(await card.cardPaths(page)).not.toContain('/SAMPLES/Fixtures/kick.wav')
    expect((await card.cardPaths(page)).filter((p) => /\.(tmp|bak)$/.test(p))).toEqual([])

    // A rename that only changes case: the same entry, allowed, no collision
    // (FAT's `f_rename` lets an entry take its own name in other capitals;
    // the browser's `move()` does the same).
    const kick808 = panel.locator('[data-entry="Kick 808.wav"]')
    await kick808.getByTestId('library-rename-start').click()
    await page.getByTestId('library-rename').fill('KICK 808.wav')
    await page.getByTestId('library-rename-go').click()
    await agree(page, /Rename sample SAMPLES\/Fixtures\/Kick 808\.wav to KICK 808\.wav\?/)
    await expect(page.getByTestId('library-notice')).toContainText('SAMPLES/Fixtures/KICK 808.wav · 1 file updated')
    expect(await card.cardPaths(page)).toContain('/SAMPLES/Fixtures/KICK 808.wav')
    const kitAfterCase = kitAfterRename!.replace('SAMPLES/Fixtures/Kick 808.wav', 'SAMPLES/Fixtures/KICK 808.wav')
    expect(await card.cardText(page, '/KITS/Kit Sample Rows.XML')).toBe(kitAfterCase)

    // Move the whole folder: both files follow, every reference under it.
    await panel.getByLabel('Up', { exact: true }).click()
    await expect(page.getByTestId('library-path')).toHaveText('/SAMPLES')
    await panel.getByRole('button', { name: 'New folder' }).click()
    await page.getByTestId('library-new-folder').fill('Library')
    await page.getByTestId('library-new-folder').press('Enter')
    await expect(panel.locator('[data-entry="Library"]')).toBeVisible()
    await panel.locator('[data-entry="Fixtures"]').getByTestId('library-move-start').click()
    await page.getByTestId('library-move-picker').getByRole('button', { name: '▸ Library' }).click()
    await page.getByTestId('library-move-here').click()
    await agree(page, /Move folder SAMPLES\/Fixtures to SAMPLES\/Library\/\? 2 files will be rewritten/)
    await expect(page.getByTestId('library-notice')).toContainText('2 files updated')
    expect(await card.cardText(page, '/SYNTHS/Sample Ranges.XML')).toBe(
      rangesText.replaceAll('SAMPLES/Fixtures/', 'SAMPLES/Library/Fixtures/'),
    )
    expect(await card.cardText(page, '/KITS/Kit Sample Rows.XML')).toBe(
      kitAfterCase.replaceAll('SAMPLES/Fixtures/', 'SAMPLES/Library/Fixtures/'),
    )
    const paths = await card.cardPaths(page)
    expect(paths).toContain('/SAMPLES/Library/Fixtures/KICK 808.wav')
    expect(paths).toContain('/SAMPLES/Library/Fixtures/snare.wav')
    expect(paths.some((p) => p.startsWith('/SAMPLES/Fixtures/'))).toBe(false)

    // Delete the one sample nothing names; the folder itself is still used, so it can't go.
    await panel.locator('[data-entry="Library"] .entry').click()
    await panel.locator('[data-entry="Fixtures"] .entry').click()
    await expect(page.getByTestId('library-path')).toHaveText('/SAMPLES/Library/Fixtures')
    await panel.locator('[data-entry="unused.wav"]').getByTestId('library-delete').click()
    await agree(page, /Delete SAMPLES\/Library\/Fixtures\/unused\.wav\?/)
    await expect(page.getByTestId('library-notice')).toContainText('unused.wav deleted')
    expect(await card.cardPaths(page)).not.toContain('/SAMPLES/Library/Fixtures/unused.wav')
    await expect(panel.locator('[data-entry="unused.wav"]')).toHaveCount(0)
  })
}

test('a preset open in the editor follows a rename on the card it came from', async ({ page }) => {
  // Over SysEx the same connection serves the editor and the library, so the
  // kit on screen is rewritten too — as one change the dock can show, not a
  // reload that would throw away the rest of a session's edits.
  await sysex.install(page, fixtureCard())
  await page.goto('/')

  await choose(page, 'card-open-button')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await page.getByLabel('Up').click()
  await page.locator('[data-testid="card-panel"] [data-entry="KITS"]').click()
  await page.locator('[data-testid="card-panel"] [data-entry="Kit Sample Rows.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Kit Sample Rows.XML')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  await choose(page, sysex.open)
  const panel = page.getByTestId('library-panel')
  await panel.locator('[data-entry="Fixtures"] .entry').click()
  const kick = panel.locator('[data-entry="kick.wav"]')
  await kick.getByTestId('library-rename-start').click()
  await page.getByTestId('library-rename').fill('Kick 808.wav')
  await page.getByTestId('library-rename-go').click()
  await agree(page, /Rename sample SAMPLES\/Fixtures\/kick\.wav to Kick 808\.wav\?/)
  await expect(page.getByTestId('library-notice')).toContainText('1 file updated')
  await expect(page.getByTestId('change-count')).toHaveText('1')
})

test('a folder that is not a Deluge card is refused before anything is read', async ({ page }) => {
  await mounted.install(page, { '/Photos/holiday.txt': 'not a card' })
  await page.goto('/')
  await choose(page, 'library-mounted-button')
  await expect(page.getByTestId('library-error')).toContainText('not a Deluge card')
})
