import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIXTURE = path.resolve('tests/e2e/../fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')
const fixtureText = fs.readFileSync(FIXTURE, 'utf8')
const OFFICIAL = path.resolve('tests/e2e/../fixtures/official-4.0.1/Attribute Format Baseline.XML')
const officialText = fs.readFileSync(OFFICIAL, 'utf8')

/**
 * A PCM WAV whose every byte is ≤ 0x7F, as a latin1 string — the card seed
 * crosses into the page as JSON text and is UTF-8 encoded there, so only
 * ASCII-safe bytes survive. 4096 Hz mono 16-bit keeps all the header words
 * under 0x80; `frames` must stay ≤ 45 so the RIFF size does too.
 */
function asciiWav(frames: number): string {
  const dataBytes = frames * 2
  const b = Buffer.alloc(44 + dataBytes)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dataBytes, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22) // mono
  b.writeUInt32LE(4096, 24)
  b.writeUInt32LE(4096 * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dataBytes, 40)
  return b.toString('latin1')
}

test('kit builder: rows from card samples via header reads, local samples pushed to the card (issue #10)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, {
    '/SAMPLES/Fixtures/kick.wav': asciiWav(32),
    '/SAMPLES/Fixtures/snare.wav': asciiWav(45),
  })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  await page.getByTestId('card-open-button').click()
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await page.getByTestId('card-open-button').click() // close the panel; the connection stays
  await page.getByTestId('new-kit').click()

  // Browse SAMPLES/ on the device and build rows from the WAVs' headers.
  await page.getByTestId('browse-card-samples').click()
  await page.locator('[data-testid="card-sample-browser"] button', { hasText: 'Fixtures' }).click()
  await page.getByTestId('add-card-folder').click()
  const rows = page.locator('[data-testid="kit-rows"] tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('SAMPLES/Fixtures/kick.wav')
  await expect(rows.nth(1)).toContainText('SAMPLES/Fixtures/snare.wav')

  // The zone ends are the WAVs' exact frame counts, read over SysEx.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download XML', exact: true }).click()
  const xml = fs.readFileSync((await (await downloadPromise).path())!, 'utf8')
  expect(xml).toContain('endSamplePos="32"')
  expect(xml).toContain('endSamplePos="45"')

  // Local samples land as rows AND can be pushed to SAMPLES/<folder>/ on the card.
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-push-')), 'Loops')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'Clap.wav'), Buffer.from(asciiWav(40), 'latin1'))
  await page.getByTestId('folder-input').setInputFiles(dir)
  await expect(rows).toHaveCount(3)

  // The local sample isn't on the card yet: its row carries a warning (amber
  // "will be copied" — we hold the bytes); the card-sourced rows don't.
  await expect(page.getByTestId('row-missing')).toHaveCount(1)
  await expect(page.getByTestId('missing-count')).toContainText('1 sample not on the card')

  // Saving the kit retargets its local samples to the saved folder path
  // (KITS/Rumbles.XML → SAMPLES/Rumbles/) and copies them along.
  await page.getByTestId('card-save-button').click()
  await page.getByTestId('card-panel').getByRole('button', { name: 'Up', exact: true }).click()
  await page.locator('[data-entry="KITS"]').click()
  await page.getByTestId('card-save-name').fill('Rumbles')
  await page.getByTestId('card-save').click()
  await expect(page.getByTestId('card-saved')).toContainText('Rumbles.XML and 1 sample written')
  const pushed = await page.evaluate(() =>
    (globalThis as unknown as { __fakeCard: { files: Map<string, unknown> } }).__fakeCard.files.has(
      '/SAMPLES/Rumbles/Clap.wav',
    ),
  )
  expect(pushed).toBe(true)
  const xmlOnCard = await page.evaluate(() =>
    (globalThis as unknown as { __fakeCard: { text: (p: string) => string | null } }).__fakeCard.text(
      '/KITS/Rumbles.XML',
    ),
  )
  expect(xmlOnCard).toContain('SAMPLES/Rumbles/Clap.wav')

  // The copy cleared the warning.
  await expect(page.getByTestId('row-missing')).toHaveCount(0)

  // A second push finds nothing missing: the sync skips what the card holds.
  await page.getByTestId('card-save-button').click() // close the panel over the builder
  await page.getByTestId('push-samples').click()
  await expect(page.getByTestId('kit-notice')).toContainText('already on the card')
})

test('card: connect, browse, load, edit, save with verification, reload', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, {
    '/SYNTHS/Default Synth.XML': fixtureText,
    '/SYNTHS/Baseline.XML': officialText,
    // macOS droppings a real FAT card grows (issue #24): an AppleDouble
    // sidecar masquerading as XML, and .DS_Store. The browser must hide them.
    '/SYNTHS/._Default Synth.XML': '\x00\x05\x16\x07\x00\x02\x00\x00',
    '/SYNTHS/.DS_Store': '\x00\x00\x00\x01Bud1',
  })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  // Connect: Open from Deluge connects on first use and opens the panel in
  // open mode; Save to Deluge is disabled until something is loaded.
  await expect(page.getByTestId('card-save-button')).toBeDisabled()
  await page.getByTestId('card-open-button').click()
  await expect(page.getByTestId('card-panel')).toBeVisible()
  await expect(page.getByTestId('card-panel')).toContainText('Open from Deluge')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await expect(page.getByTestId('card-panel')).toContainText('fw 1.3.0')

  // Hidden files stay hidden: only the two presets list, no `._*`/.DS_Store.
  await expect(page.locator('[data-entry]')).toHaveCount(2)

  // The identity reply locks the top-bar selector to the device's firmware:
  // a static pill, no dropdown, while connected (issue #7).
  await expect(page.getByTestId('firmware-locked')).toHaveText('c1.3.0')
  await expect(page.getByTestId('firmware')).toHaveCount(0)

  // Load: same round-trip guarantees as drag-drop.
  await page.locator('[data-entry="Default Synth.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')
  await expect(page.getByTestId('summary')).toContainText('Saw and square')
  await expect(page.getByTestId('card-panel')).toBeHidden()
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // Edit one value from the keyboard.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await expect(knob).toHaveAttribute('aria-valuenow', '28')
  await knob.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // Save: in save mode, clicking a file row picks it as the target — the
  // name fills and the overwrite arms (the gesture that used to open the
  // file instead). The write is still read back and byte-compared.
  await page.getByTestId('card-save-button').click()
  await expect(page.getByTestId('card-panel')).toContainText('Save to Deluge')
  await page.locator('[data-entry="Default Synth.XML"]').click()
  await expect(page.getByTestId('card-save-name')).toHaveValue('Default Synth.XML')
  await expect(page.getByTestId('card-save')).toHaveText('Overwrite?')
  await page.getByTestId('card-save').click()
  await expect(page.getByTestId('card-saved')).toContainText('Default Synth.XML written')
  // The verified card copy became the clean baseline: nothing left unsaved.
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // The card's copy is the editor's output — changed, and holding the edit.
  const onCard = await page.evaluate(() =>
    (globalThis as unknown as { __fakeCard: { text: (p: string) => string | null } }).__fakeCard.text(
      '/SYNTHS/Default Synth.XML',
    ),
  )
  expect(onCard).not.toBeNull()
  expect(onCard).not.toBe(fixtureText)
  expect(onCard).toContain('lpfFrequency')

  // Reload from the card: the edit persisted and is now the clean baseline.
  await page.getByTestId('card-open-button').click()
  await page.locator('[data-entry="Default Synth.XML"]').click()
  await expect(knob).toHaveAttribute('aria-valuenow', '29')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // A name typed without an extension gets .XML appended — a bare name would
  // save fine but never show in the Deluge's preset browser.
  await page.getByTestId('card-save-button').click()
  await page.getByTestId('card-save-name').fill('Rumbles')
  await page.getByTestId('card-save').click()
  await expect(page.getByTestId('card-save-name')).toHaveValue('Rumbles.XML')
  await expect(page.getByTestId('card-saved')).toContainText('Rumbles.XML')
  const bare = await page.evaluate(() =>
    (globalThis as unknown as { __fakeCard: { files: Map<string, unknown> } }).__fakeCard.files.has('/SYNTHS/Rumbles.XML'),
  )
  expect(bare).toBe(true)

  // Open mode guards unsaved work: with an edit pending, the first click on
  // a file arms it instead of loading; the second click goes through. A
  // file written by official 4.0.1 does not clobber the device's firmware:
  // the connected Deluge outranks the file's provenance (issue #7).
  await knob.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.getByTestId('card-open-button').click()
  await page.locator('[data-entry="Baseline.XML"]').click()
  await expect(page.getByTestId('card-panel')).toContainText('discards your changes?')
  await expect(page.getByTestId('file-name')).toHaveText('Rumbles.XML') // not loaded yet
  await page.locator('[data-entry="Baseline.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Baseline.XML')
  await expect(page.getByTestId('firmware-locked')).toHaveText('c1.3.0')
})
