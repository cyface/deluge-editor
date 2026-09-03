import { expect, test } from '@playwright/test'
import { choose } from './bar.js'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Sample Ranges.XML')

test('read, move, remove and split a multi-sample oscillator (issue #29)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // The oscillator panel names every sample, not just the first, and draws
  // the key map as a thumbnail.
  const oscPanel = page.locator('[data-group="osc"]')
  await expect(oscPanel).toContainText('2 samples')
  await expect(oscPanel).toContainText('range-low.wav · range-high.wav')
  await expect(oscPanel.getByTestId('key-map-mini')).toBeVisible()

  // The editor opens full width, listing both ranges in sounding order.
  await page.getByTestId('edit-ranges-1').click()
  const editor = page.getByTestId('range-editor')
  await expect(editor).toContainText('Osc A Ranges')
  const rows = editor.locator('[data-range]')
  await expect(rows).toHaveCount(2)
  // rangeTopNote="72" is C4 in the Deluge's own naming, and it is inclusive.
  await expect(rows.nth(0)).toContainText('up to C4')
  await expect(rows.nth(0)).toContainText('range-low.wav')
  // The second range is unbounded (no rangeTopNote) and transpose="-12"
  // reads back as a root note an octave above middle C (which is C3 here).
  await expect(rows.nth(1)).toContainText('above C#4')
  await expect(rows.nth(1)).toContainText('C4')
  await expect(rows.nth(1)).toContainText('-12 st')

  // One band per range on the map, and one split between them.
  await expect(editor.locator('[data-band]')).toHaveCount(2)
  const split = editor.locator('[data-split="0"]')
  await expect(split).toHaveAttribute('aria-valuenow', '72')

  // The split moves from the keyboard, and that is the only change in the file.
  await split.focus()
  await page.keyboard.press('ArrowUp')
  await expect(split).toHaveAttribute('aria-valuenow', '73')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.getByTestId('changes-button').click()
  const changes = page.locator('[data-testid="changes"] [data-change]')
  await expect(changes).toHaveCount(1)
  await expect(changes.first()).toHaveAttribute('data-change', /sampleRange.*rangeTopNote/)
  await page.getByTestId('changes-button').click()

  // Back down, and the file is byte-identical again.
  await split.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('change-count')).toHaveText('0')
  await page.getByTestId('changes-button').click()
  await expect(page.getByTestId('identical')).toContainText('byte-identical')
  await page.getByTestId('changes-button').click()

  // The same split drags with the mouse, snapping to the note under it.
  const map = editor.getByTestId('key-map')
  const mapBox = (await map.boundingBox())!
  const splitBox = (await split.boundingBox())!
  await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(mapBox.x + (mapBox.width * 60) / 128 + 2, splitBox.y + splitBox.height / 2)
  await page.mouse.up()
  await expect(split).toHaveAttribute('aria-valuenow', '60')
  await expect(rows.nth(0)).toContainText('up to C3')

  // Typing the old note back into the field leaves the file as it was found.
  await editor.locator('[data-attr="range.topNote"]').fill('72')
  await editor.locator('[data-attr="range.topNote"]').press('Enter')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // Deleting the low range leaves one, which the firmware writes flattened
  // onto the <osc> — no <sampleRanges> wrapper, so the shape switched.
  await rows.nth(0).getByTestId('range-remove').click()
  await expect(editor.locator('[data-range]')).toHaveCount(1)
  await expect(oscPanel).toContainText('Sample')
  await expect(oscPanel).toContainText('range-high.wav')
  // The dock sees the move for what it is: the range's fields land on the
  // oscillator and the whole <sampleRanges> element goes.
  await page.getByTestId('changes-button').click()
  const dock = page.locator('[data-testid="changes"]')
  await expect(dock).toContainText('Osc A File Name')
  await expect(dock).toContainText('removed · 12 values')
  await page.getByTestId('changes-button').click()

  // Splitting it puts a new sample below, dividing the keyboard at the midpoint.
  // The file is chosen in the shared dialog — here from this computer, which
  // is the way in with no Deluge plugged in.
  await editor.getByTestId('range-split-below').click()
  await page.getByTestId('sample-file-input').setInputFiles({
    name: 'range-low.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(asciiWav(40), 'latin1'),
  })
  const after = editor.locator('[data-range]')
  await expect(after).toHaveCount(2)
  await expect(after.nth(0)).toContainText('up to D#3') // note 63, the midpoint of 0..127
  await expect(after.nth(0)).toContainText('range-low.wav')
  await expect(after.nth(1)).toContainText('range-high.wav')

  // A range's root note is edited as a note, and lands in transpose/cents.
  await after.nth(0).click()
  await editor.locator('[data-attr="range.root"]').fill('48')
  await editor.locator('[data-attr="range.root"]').press('Enter')
  await expect(after.nth(0)).toContainText('C2')
  await expect(after.nth(0)).toContainText('+12 st')
})

test('the editor closes and the panel button says so', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await page.getByTestId('edit-ranges-1').click()
  await expect(page.getByTestId('range-editor')).toBeVisible()
  await expect(page.getByTestId('edit-ranges-1')).toContainText('Close ranges')
  await page.getByTestId('edit-ranges-1').click()
  await expect(page.getByTestId('range-editor')).toHaveCount(0)
})

/**
 * A PCM WAV whose bytes all stay ≤ 0x7F, as a latin1 string — the fake card's
 * seed crosses into the page as JSON text (see card.spec.ts).
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
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(4096, 24)
  b.writeUInt32LE(4096 * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dataBytes, 40)
  return b.toString('latin1')
}

test('assign a range a sample browsed on the card, zone and all', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SAMPLES/Fixtures/kick.wav': asciiWav(32) })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  await choose(page, 'card-open-button')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await page.keyboard.press('Escape') // dismiss the dialog, keep the connection
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await page.getByTestId('edit-ranges-1').click()

  const editor = page.getByTestId('range-editor')
  await editor.getByTestId('range-change').click()
  // Connected already, so the dialog opens on the card rather than asking twice.
  const picker = page.getByTestId('sample-picker')
  await expect(picker.getByTestId('sample-card-browser')).toContainText('/SAMPLES')
  await picker.locator('.entry', { hasText: 'Fixtures' }).click()
  // A file is picked out first and taken with Select.
  await expect(picker.getByTestId('sample-select')).toBeDisabled()
  await picker.locator('.entry', { hasText: 'kick.wav' }).click()
  await picker.getByTestId('sample-select').click()

  // The new sample's own length becomes the zone: 32 frames, read from the
  // header over SysEx. The old file's end would have overrun it.
  const row = editor.locator('[data-range="0"]')
  await expect(row).toContainText('kick.wav')
  await expect(row).toContainText('0–32')
  await expect(editor.locator('[data-attr="range.endSamplePos"]')).toHaveValue('32')
})

test('a one-sample kit row is offered its file, not a key map', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(
    path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML'),
  )
  // Each row holds one sample, so the panel says "Sample", not "N samples".
  const oscPanel = page.locator('[data-group="osc"]')
  await expect(oscPanel).toContainText('Sample')
  await expect(oscPanel).toContainText('kick.wav')

  // Every hit on a drum sounds the same note, so there are no key bands to
  // show and no folder to import: the oscillator offers the one file.
  await expect(page.getByTestId('edit-ranges-1')).toHaveCount(0)
  await expect(page.getByTestId('build-multisample-1')).toHaveCount(0)
  await expect(page.getByTestId('pick-sample-1')).toHaveText('Change sample…')
})

test('in a kit the layer editor follows the selected row', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(
    path.resolve('tests/fixtures/fork-c1.3.0-local-fixes-fbba6b4f/Kit Velocity Layers.XML'),
  )
  // Layered rows are the one kit case with more than one range to look at.
  await page.getByTestId('edit-ranges-1').click()
  const editor = page.getByTestId('range-editor')
  await expect(editor.locator('[data-range="0"]')).toContainText('vel-kick-1.wav')

  // Selecting another pad shows that row's layers, in place.
  await page.locator('[data-testid="kit-rows"] tbody tr').nth(1).click()
  await expect(editor.locator('[data-range="0"]')).toContainText('vel-snare-1.wav')
})

test('velocity-keyed drum rows are shown, and shown as read-only', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(
    path.resolve('tests/fixtures/fork-c1.3.0-local-fixes-fbba6b4f/Kit Velocity Layers.XML'),
  )
  await expect(page.locator('[data-group="osc"]')).toContainText('4 samples')

  await page.getByTestId('edit-ranges-1').click()
  const editor = page.getByTestId('range-editor')
  await expect(editor.locator('[data-range]')).toHaveCount(4)
  await expect(editor.getByTestId('range-velocity')).toContainText('keyed by velocity')

  // Nothing to drag, nothing to press: the layers have no top note to move,
  // and every writer refuses, so the file goes back out as it came in.
  await expect(editor.locator('[data-split]')).toHaveCount(0)
  await expect(editor.getByTestId('range-add')).toHaveCount(0)
  await expect(editor.getByTestId('range-remove')).toHaveCount(0)
  await editor.locator('[data-band]').first().click()
  await expect(page.getByTestId('change-count')).toHaveText('0')
})
