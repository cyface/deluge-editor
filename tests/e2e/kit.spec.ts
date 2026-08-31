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

  // Remove a row.
  await rows.nth(3).getByRole('button', { name: 'Remove row 4' }).click()
  await expect(rows).toHaveCount(3)

  // Share zip: README + KITS/ + the three samples still in the kit.
  await page.locator('#kit-author').fill('Tim')
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('download-zip').click()
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
