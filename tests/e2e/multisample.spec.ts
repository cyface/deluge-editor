import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * A minimal PCM WAV (16-bit mono). Not a fixture: the fixture rule covers
 * Deluge preset XML, and these bytes only exercise the RIFF walk. They carry
 * no embedded root note on purpose — the file names carry this import, which
 * is the case the review table exists for.
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

test('build a multi-sampled synth from a folder of samples (issue #33)', async ({ page }) => {
  // Named the way a sampled library names things — an octave above what the
  // Deluge calls the same note, which is what the shift is for.
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-ms-')), 'Piano')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'Piano C4.wav'), wavBytes(1000))
  fs.writeFileSync(path.join(dir, 'Piano C5.wav'), wavBytes(900))
  fs.writeFileSync(path.join(dir, 'Piano C6.wav'), wavBytes(800))
  fs.writeFileSync(path.join(dir, 'room tone.wav'), wavBytes(700))

  await page.goto('/')
  await page.getByTestId('new-synth').click()

  // The oscillator asks where the samples are, and turns into a sample
  // oscillator while the question is up.
  const waveform = page.locator('[data-attr="osc1.type"]')
  await expect(waveform).toHaveValue('square')
  await page.getByTestId('build-multisample-1').click()
  await expect(page.getByTestId('folder-import')).toContainText('Build Osc A from a folder')
  await expect(waveform).toHaveValue('sample')
  await page.getByTestId('ms-folder-input').setInputFiles(dir)

  // Answering it lands in the range editor: no second panel, no build step.
  await expect(page.getByTestId('folder-import')).toHaveCount(0)
  const editor = page.getByTestId('range-editor')
  const rows = editor.locator('[data-range]')
  await expect(rows).toHaveCount(3)
  await expect(editor.getByTestId('range-import')).toContainText('Piano')
  await expect(editor.getByTestId('range-import')).toContainText('3 samples placed, 1 left out')

  // Each range says where its root came from, spelled out under the table.
  await expect(rows.nth(0)).toContainText('Piano C4.wav')
  await expect(rows.nth(0)).toContainText('C4')
  await expect(rows.nth(0)).toContainText('file name')
  await expect(rows.nth(0)).toContainText('up to F#4')
  await expect(editor.getByTestId('range-legend')).toContainText('the note the file itself declares')

  // One control moves the whole instrument: down an octave, roots and
  // boundaries together.
  await editor.getByRole('button', { name: 'Down an octave' }).click()
  await expect(rows.nth(0)).toContainText('C3')
  await expect(rows.nth(0)).toContainText('up to F#3')
  await expect(rows.nth(2)).toContainText('above G4')

  // The file with no note in its name was kept, not dropped, and goes on the
  // keyboard where it is told.
  const left = editor.getByTestId('range-left-out')
  await expect(left).toContainText('room tone.wav')
  await expect(left).toContainText('no note in its name or its header')
  await left.getByRole('spinbutton').fill('96')
  await left.getByRole('spinbutton').blur()
  await editor.getByTestId('range-assign').click()
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(3)).toContainText('room tone.wav')
  await expect(rows.nth(3)).toContainText('C6')
  await expect(editor.getByTestId('range-left-out')).toHaveCount(0)

  // Zones came from the headers, so each range ends at its own length.
  await expect(rows.nth(0)).toContainText('0–1000')
})

test('dismissing the folder question leaves the oscillator as it was (issue #33)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('new-synth').click()
  const waveform = page.locator('[data-attr="osc1.type"]')

  await page.getByTestId('build-multisample-1').click()
  await expect(waveform).toHaveValue('sample')
  // While it is in that state the oscillator says what it would do on the
  // instrument, because silence is the hardest fault to find there.
  await expect(page.getByTestId('osc-no-sample-1')).toContainText('it will be silent on the Deluge')
  await page.getByTestId('ms-cancel').click()
  await expect(waveform).toHaveValue('square')
  await expect(page.getByTestId('change-count')).toHaveText('0')
})

test('the preview button keeps its width when it becomes a stop button (issue #33)', async ({ page }) => {
  // ▶ and ■ do not measure the same, so a button sized by its glyph nudged the
  // whole row sideways every time a preview started.
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-ms-')), 'Piano')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'Piano C3.wav'), wavBytes(1000))
  fs.writeFileSync(path.join(dir, 'Piano C4.wav'), wavBytes(900))

  await page.goto('/')
  await page.getByTestId('new-synth').click()
  await page.getByTestId('build-multisample-1').click()
  await page.getByTestId('ms-folder-input').setInputFiles(dir)

  const play = page.locator('[data-range="0"] td.acts button').first()
  const widths = () =>
    play.evaluate((el) => {
      const cell = el.parentElement
      return [el.getBoundingClientRect().width, cell ? cell.getBoundingClientRect().width : 0]
    })
  const playing = await widths()
  await play.evaluate((el) => (el.textContent = '■'))
  expect(await widths()).toEqual(playing)
})
