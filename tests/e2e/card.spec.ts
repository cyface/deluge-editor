import { expect, test } from '@playwright/test'
import { choose, reveal } from './bar.js'
import { asciiWav } from '../helpers/wav.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIXTURE = path.resolve('tests/e2e/../fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')
const fixtureText = fs.readFileSync(FIXTURE, 'utf8')
const OFFICIAL = path.resolve('tests/e2e/../fixtures/official-4.0.1/Attribute Format Baseline.XML')
const officialText = fs.readFileSync(OFFICIAL, 'utf8')

test('kit builder: rows from card samples via header reads, local samples pushed to the card (issue #10)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, {
    '/SAMPLES/Fixtures/kick.wav': asciiWav(32),
    '/SAMPLES/Fixtures/snare.wav': asciiWav(45),
  })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  await choose(page, 'card-open-button')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await page.keyboard.press('Escape') // dismiss the dialog; the connection stays
  await choose(page, 'new-kit')

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
  await choose(page, 'download-xml')
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
  await choose(page, 'card-save-button')
  // The kit has no name yet, so the one its samples suggest is offered.
  await expect(page.getByTestId('card-save-name')).toHaveValue('Fixtures.XML')
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
  // (The save closed the dialog by itself, so the builder is reachable.)
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

  const cardText = (p: string) =>
    page.evaluate((q) => (globalThis as unknown as { __fakeCard: { text: (p: string) => string | null } }).__fakeCard.text(q), p)
  const knob = page.locator('[data-param="lpfFrequency"]')

  // One scenario, because each step stands on the state the last one left;
  // the steps name where a failure happened.
  await test.step('connect: Open › From Deluge connects and opens the panel; Save › To Deluge waits for something to save', async () => {
    await expect(await reveal(page, 'card-save-button')).toBeDisabled()
    await expect(page.getByTestId('card-overwrite')).toBeDisabled()
    await page.keyboard.press('Escape')
    await choose(page, 'card-open-button')
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
  })

  await test.step('load: same round-trip guarantees as drag-drop', async () => {
    await page.locator('[data-entry="Default Synth.XML"]').click()
    await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')
    await expect(page.getByTestId('summary')).toContainText('Saw and square')
    await expect(page.getByTestId('card-panel')).toBeHidden()
    await expect(page.getByTestId('change-count')).toHaveText('0')
  })

  await test.step('edit one value from the keyboard', async () => {
    await expect(knob).toHaveAttribute('aria-valuenow', '28')
    await knob.focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('change-count')).toHaveText('1')
  })

  // Save: in save mode, clicking a file row picks it as the target — the
  // name fills and the overwrite arms (the gesture that used to open the
  // file instead). The write is still read back and byte-compared.
  const onCard = await test.step('save over the file it came from, verified by read-back', async () => {
    await choose(page, 'card-save-button')
    await expect(page.getByTestId('card-panel')).toContainText('Save to Deluge')
    await page.locator('[data-entry="Default Synth.XML"]').click()
    await expect(page.getByTestId('card-save-name')).toHaveValue('Default Synth.XML')
    await expect(page.getByTestId('card-save')).toHaveText('Overwrite?')
    await page.getByTestId('card-save').click()
    await expect(page.getByTestId('card-saved')).toContainText('Default Synth.XML written')
    // The verified card copy became the clean baseline: nothing left unsaved.
    await expect(page.getByTestId('change-count')).toHaveText('0')

    // The card's copy is the editor's output — changed, and holding the edit.
    const written = await cardText('/SYNTHS/Default Synth.XML')
    expect(written).not.toBeNull()
    expect(written).not.toBe(fixtureText)
    expect(written).toContain('lpfFrequency')
    return written
  })

  await test.step('reload from the card: the edit persisted and is the clean baseline', async () => {
    // The panel closing is what says the load has landed — the knob already
    // read 29 before it, so that alone would pass on the old state.
    await choose(page, 'card-open-button')
    await page.locator('[data-entry="Default Synth.XML"]').click()
    await expect(page.getByTestId('card-panel')).toBeHidden()
    await expect(knob).toHaveAttribute('aria-valuenow', '29')
    await expect(page.getByTestId('change-count')).toHaveText('0')
  })

  await test.step('Save › To Deluge – Overwrite writes straight back, no dialog, no arming', async () => {
    // The path is on the item.
    await knob.focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('change-count')).toHaveText('1')
    const overwrite = await reveal(page, 'card-overwrite')
    await expect(overwrite).toBeEnabled()
    await expect(overwrite).toContainText('/SYNTHS/Default Synth.XML')
    await overwrite.click()
    await expect(page.getByTestId('card-saved')).toContainText('Default Synth.XML written')
    await expect(page.getByTestId('card-panel')).toBeHidden()
    await expect(page.getByTestId('change-count')).toHaveText('0')
    expect(await cardText('/SYNTHS/Default Synth.XML')).not.toBe(onCard)
  })

  await test.step('a name typed without an extension gets .XML, and Overwrite follows the new file', async () => {
    // A bare name would save fine but never show in the Deluge's preset browser.
    await choose(page, 'card-save-button')
    await page.getByTestId('card-save-name').fill('Rumbles')
    await page.getByTestId('card-save').click()
    // A verified save closes the dialog and leaves its confirmation on the page.
    await expect(page.getByTestId('card-panel')).toBeHidden()
    await expect(page.getByTestId('card-saved')).toContainText('Rumbles.XML')
    // The name the save actually used, kept for the next one — and Overwrite
    // now points at the new file, not the one the preset was opened from.
    await choose(page, 'card-save-button')
    await expect(page.getByTestId('card-save-name')).toHaveValue('Rumbles.XML')
    await page.keyboard.press('Escape')
    await expect(await reveal(page, 'card-overwrite')).toContainText('/SYNTHS/Rumbles.XML')
    await page.keyboard.press('Escape')
    const bare = await page.evaluate(() =>
      (globalThis as unknown as { __fakeCard: { files: Map<string, unknown> } }).__fakeCard.files.has('/SYNTHS/Rumbles.XML'),
    )
    expect(bare).toBe(true)
  })

  await test.step('open mode guards unsaved work, and a file from official firmware does not clobber the device firmware', async () => {
    // With an edit pending, the first click on a file arms it instead of
    // loading; the second click goes through. A file written by official
    // 4.0.1 does not clobber the device's firmware: the connected Deluge
    // outranks the file's provenance (issue #7).
    await knob.focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('change-count')).toHaveText('1')
    await choose(page, 'card-open-button')
    await page.locator('[data-entry="Baseline.XML"]').click()
    await expect(page.getByTestId('card-panel')).toContainText('discards your changes?')
    await expect(page.getByTestId('file-name')).toHaveText('Rumbles.XML') // not loaded yet
    await page.locator('[data-entry="Baseline.XML"]').click()
    await expect(page.getByTestId('file-name')).toHaveText('Baseline.XML')
    await expect(page.getByTestId('firmware-locked')).toHaveText('c1.3.0')
    await expect(await reveal(page, 'card-overwrite')).toContainText('/SYNTHS/Baseline.XML')
    await page.keyboard.press('Escape')
  })

  await test.step('a preset from this computer is not the card\'s copy, whatever its name', async () => {
    // Overwrite has nowhere to go until it is opened from or saved to the card.
    await page.getByTestId('file-input').setInputFiles({ name: 'Baseline.XML', mimeType: 'text/xml', buffer: Buffer.from(officialText) })
    await expect(await reveal(page, 'card-overwrite')).toBeDisabled()
    await page.keyboard.press('Escape')
  })

  await test.step('the save dialog offers the preset\'s name as it is now, not the last card operation\'s', async () => {
    // A renamed preset (the generator renames on every roll) saves under its
    // new name, and an unnamed one offers nothing.
    await page.getByTestId('file-input').setInputFiles({ name: 'Fresh.XML', mimeType: 'text/xml', buffer: Buffer.from(officialText) })
    await choose(page, 'card-save-button')
    await expect(page.getByTestId('card-save-name')).toHaveValue('Fresh.XML')
    await page.keyboard.press('Escape')
    await choose(page, 'new-synth') // clean, so no question
    await choose(page, 'card-save-button')
    await expect(page.getByTestId('card-save-name')).toHaveValue('')
    await page.keyboard.press('Escape')
  })
})

test('card: a second editor on the same Deluge is detected and warned about (issue #8)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Default Synth.XML': fixtureText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  // Web MIDI is not exclusive: another tab's replies arrive here too. Until
  // one does, nothing is claimed — a lone editor sees no advisory.
  await choose(page, 'card-open-button')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await expect(page.getByTestId('card-other-editor')).toHaveCount(0)
  await page.locator('[data-entry="Default Synth.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')

  // One reply on another session's msgIds is the whole tell.
  await page.evaluate(() => (globalThis as unknown as { __fakeCard: { otherEditor: () => void } }).__fakeCard.otherEditor())
  await choose(page, 'card-save-button')
  await expect(page.getByTestId('card-other-editor')).toContainText('Another editor is talking to this Deluge')

  // Saving is not blocked — no client can stop the other one writing — but
  // the verified save says plainly that it may not stay written.
  await page.getByTestId('card-save-name').fill('Contended.XML')
  await page.getByTestId('card-save').click()
  await expect(page.getByTestId('card-saved')).toContainText('Contended.XML written — another editor is also on this Deluge')
  const onCard = await page.evaluate(() =>
    (globalThis as unknown as { __fakeCard: { files: Map<string, unknown> } }).__fakeCard.files.has('/SYNTHS/Contended.XML'),
  )
  expect(onCard).toBe(true)
})

test('multi-sample import: the Deluge option connects by itself and builds from headers read over SysEx (issue #33)', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, {
    '/SAMPLES/Piano/Piano C3.wav': asciiWav(300),
    '/SAMPLES/Piano/Piano D3.wav': asciiWav(400),
    '/SAMPLES/Piano/Piano E3.wav': asciiWav(500),
  })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')
  await choose(page, 'new-synth')
  await page.locator('[data-attr="osc1.type"]').selectOption('sample')
  await page.getByTestId('build-multisample-1').click()

  // Nothing has connected yet — no dot on the firmware pill: choosing the
  // Deluge does it, the way Open › From Deluge does.
  await expect(page.getByTestId('deluge-dot')).toHaveCount(0)
  await page.getByTestId('ms-source-card').click()
  const browser = page.getByTestId('ms-card-browser')
  await expect(browser).toContainText('/SAMPLES')
  await browser.locator('button', { hasText: 'Piano' }).click()
  await page.getByTestId('ms-take-card-folder').click()

  // Roots come from the file names; the frame counts came from the headers.
  const rows = page.locator('[data-testid="range-editor"] [data-range]')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Piano C3.wav')
  await expect(rows.nth(0)).toContainText('up to C#3')

  const downloadPromise = page.waitForEvent('download')
  await choose(page, 'download-xml')
  const xml = fs.readFileSync((await (await downloadPromise).path())!, 'utf8')
  expect(xml).toContain('fileName="SAMPLES/Piano/Piano C3.wav"')
  expect(xml).toContain('endSamplePos="300"')
  expect(xml).toContain('rangeTopNote="61"')

  // The samples are already on the card, so nothing is queued to copy.
  await expect(page.getByTestId('range-missing')).toHaveCount(0)
})
