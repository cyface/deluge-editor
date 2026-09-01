import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * A minimal PCM WAV (16-bit mono) with the given frame count. Not a fixture:
 * the fixture rule covers Deluge preset XML; these bytes only exercise the
 * builder's RIFF walk, and their frame counts must land in `endSamplePos`.
 */
function wavBytes(frames: number): Buffer {
  const dataBytes = frames * 2
  const b = Buffer.alloc(44 + dataBytes)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dataBytes, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(1, 22) // mono
  b.writeUInt32LE(44100, 24)
  b.writeUInt32LE(44100 * 2, 28)
  b.writeUInt16LE(2, 32) // block align
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dataBytes, 40)
  return b
}

test('build a kit from a sample folder: guessed order, reorder, rename, share zip (issue #10)', async ({ page }) => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-kit-')), 'My Kit')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'Open Hat.wav'), wavBytes(400))
  fs.writeFileSync(path.join(dir, 'Kick.wav'), wavBytes(1000))
  fs.writeFileSync(path.join(dir, 'Perc Loop.wav'), wavBytes(800))
  fs.writeFileSync(path.join(dir, 'Snare.wav'), wavBytes(600))

  await page.goto('/')
  await page.getByTestId('new-kit').click()
  const rows = page.locator('[data-testid="kit-rows"] tbody tr')
  await expect(rows).toHaveCount(1) // the blank kit's one silent row

  // Pick the folder: rows land in the guessed order, replacing the blank row.
  await page.getByTestId('folder-input').setInputFiles(dir)
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0)).toContainText('Kick')
  await expect(rows.nth(1)).toContainText('Snare')
  await expect(rows.nth(2)).toContainText('Open Hat')
  await expect(rows.nth(3)).toContainText('Perc Loop')
  await expect(rows.nth(0)).toContainText('SAMPLES/My Kit/Kick.wav')

  // Local bytes decode in the background: every row grows a waveform thumbnail.
  await expect(page.getByTestId('row-wave')).toHaveCount(4)

  // Regression: previewing after that background decode must not die on a
  // missing playback context ("Cannot read properties of null").
  await rows.nth(0).getByTestId('row-play').click()
  await page.waitForTimeout(150)
  await expect(page.locator('p.err')).toHaveCount(0)

  // The Mode column edits loopMode in place; built rows start at Once.
  const mode = rows.nth(0).getByTestId('row-mode')
  await expect(mode).toHaveValue('1')
  await mode.selectOption('2')
  await expect(mode).toHaveValue('2')

  // So does the Dir column (reversed on the sample oscillator).
  const direction = rows.nth(0).getByTestId('row-direction')
  await expect(direction).toHaveValue('0')
  await direction.selectOption('1')
  await expect(direction).toHaveValue('1')

  // Vol and Pan edit in place, in the Deluge's own numbers.
  const volCell = rows.nth(0).getByTestId('row-vol')
  await volCell.fill('40')
  await volCell.blur()
  await expect(volCell).toHaveValue('40')
  const panCell = rows.nth(0).getByTestId('row-pan')
  await panCell.fill('l10')
  await panCell.blur()
  await expect(panCell).toHaveValue('L10')
  await panCell.fill('r') // a bare side letter pans hard
  await panCell.blur()
  await expect(panCell).toHaveValue('R25')

  // Reorder with the arrows: Snare up to the bottom pad.
  await rows.nth(1).getByRole('button', { name: 'Move row 2 up' }).click()
  await expect(rows.nth(0)).toContainText('Snare')
  await expect(rows.nth(1)).toContainText('Kick')

  // Rename the selected row inline.
  await rows.nth(0).click()
  const name = page.getByTestId('row-name')
  await name.fill('SNR')
  await name.blur()
  await rows.nth(1).click() // deselect: the name renders as text again
  await expect(rows.nth(0)).toContainText('SNR')

  // The Changes dock collapses each built row to one entry (and the blank
  // row it replaced to one), instead of listing every value (~150 per row).
  await page.getByTestId('changes-button').click()
  await expect(page.getByTestId('change-count')).toHaveText('5')
  const entries = page.locator('[data-testid="changes"] [data-change]')
  await expect(entries).toHaveCount(5)
  await expect(entries.nth(0)).toContainText('Row 1')
  await expect(entries.nth(0)).toContainText('SNR') // the group shows the row's name
  // The blank row can't come back among indexed rows, so its group has no restore.
  await expect(page.locator('[data-testid="changes"] [data-change="kit/soundSources/sound"] button')).toHaveCount(0)

  // Remove a row: a group's × takes the whole built row out again.
  await page.locator('[data-testid="changes"] [data-change="kit/soundSources/sound[3]"] button').click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByTestId('change-count')).toHaveText('4')
  await page.getByTestId('changes-button').click() // close the dock

  // Share zip: README + KITS/ + the three samples still in the kit.
  await page.locator('#kit-author').fill('Tim')
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('download-zip-top').click()
  const download = await downloadPromise
  const zipPath = await download.path()
  const zip = fs.readFileSync(zipPath!)
  const text = zip.toString('latin1')
  expect(text).toContain('README.md')
  expect(text).toContain('KITS/My Kit.XML')
  expect(text).toContain('SAMPLES/My Kit/Kick.wav')
  expect(text).toContain('SAMPLES/My Kit/Snare.wav')
  expect(text).not.toContain('SAMPLES/My Kit/Perc Loop.wav') // removed row's sample is not packaged
})

test("a row's sample is chosen from the rows table itself", async ({ page }) => {
  const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-one-')), 'Kick.wav')
  fs.writeFileSync(wav, wavBytes(1000))

  await page.goto('/')
  await page.getByTestId('new-kit').click()
  const rows = page.locator('[data-testid="kit-rows"] tbody tr')
  await expect(rows).toHaveCount(1)
  // The blank row the device writes carries `fileName=""`, which used to leave
  // the Source column empty with nothing in it to click.
  await expect(rows.nth(0)).toContainText('(no file)')

  // The same question the folder import asks, for one file.
  await rows.nth(0).getByTestId('row-sample').click()
  const picker = page.getByTestId('sample-picker')
  await expect(picker).toBeVisible()
  await picker.getByTestId('sample-file-input').setInputFiles(wav)

  await expect(picker).toHaveCount(0)
  await expect(rows.nth(0)).toContainText('Kick.wav')
  // A drum has no key map, so choosing its sample does not open one.
  await expect(page.getByTestId('range-editor')).toHaveCount(0)
  // 1000 frames at 44.1 kHz is well under two seconds, so the instrument's own
  // rule makes it Once rather than leaving the template's Cut.
  await expect(rows.nth(0).getByTestId('row-mode')).toHaveValue('1')

  // Written where the firmware writes it, on the row's own oscillator.
  await page.getByTestId('changes-button').click()
  await expect(
    page.locator('[data-testid="changes"] [data-change="kit/soundSources/sound/osc1@fileName"]'),
  ).toHaveCount(1)
  await page.getByTestId('changes-button').click()

  // A second, empty row: named the way the instrument's drum creator names
  // one, selected, and ready for its own sample.
  await page.getByTestId('add-row').click()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toHaveClass(/on/)
  await expect(rows.nth(1).getByTestId('row-name')).toHaveValue('U2')
  await expect(rows.nth(1)).toContainText('(no file)')
})
