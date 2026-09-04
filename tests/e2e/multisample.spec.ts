import { expect, test, type Page } from '@playwright/test'
import { choose } from './bar.js'
import { monoWav as wavBytes } from '../helpers/wav.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Drop a folder on the page, the way a file manager does: the directory
 * entries the browser hands `collectDroppedSamples` (`src/ui/dropdir.ts`),
 * which Playwright cannot produce with a real drag.
 */
function dropFolder(page: Page, folder: string, names: string[]): Promise<void> {
  return page.evaluate(([dir, files]) => {
    // globalThis-cast: the browser DOM types aren't in the node tsconfig's lib
    const g = globalThis as unknown as {
      File: new (bits: string[], name: string) => unknown
      dispatchEvent(e: Event): boolean
    }
    const fileEntry = (name: string) => ({
      isFile: true,
      isDirectory: false,
      name,
      file: (ok: (f: unknown) => void) => ok(new g.File(['x'], name)),
    })
    const entry = {
      isFile: false,
      isDirectory: true,
      name: dir,
      createReader() {
        let done = false
        return {
          // Asynchronous and empty the second time, as the real reader is:
          // `readAllEntries` keeps calling until it gets nothing.
          readEntries(ok: (e: unknown[]) => void) {
            const batch = done ? [] : files.map(fileEntry)
            done = true
            queueMicrotask(() => ok(batch))
          },
        }
      },
    }
    const dataTransfer = { items: [{ webkitGetAsEntry: () => entry }], files: [] }
    g.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer }))
  }, [folder, names] as const)
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
  await choose(page, 'new-synth')

  // The folder import belongs to a sample oscillator: the waveform is the way
  // in, and only then does the panel ask where the samples are.
  const waveform = page.locator('[data-attr="osc1.type"]')
  await expect(waveform).toHaveValue('square')
  await expect(page.getByTestId('build-multisample-1')).toHaveCount(0)
  await waveform.selectOption('sample')
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

test('re-detect the roots of ranges that are already there (issue #33)', async ({ page }) => {
  // The one thing the instrument cannot do: ask the question again without
  // throwing the ranges away first.
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-ms-')), 'Piano')
  fs.mkdirSync(dir)
  for (const name of ['Piano C4.wav', 'Piano C5.wav', 'Piano C6.wav']) {
    fs.writeFileSync(path.join(dir, name), wavBytes(1000))
  }

  await page.goto('/')
  await choose(page, 'new-synth')
  await page.locator('[data-attr="osc1.type"]').selectOption('sample')
  await page.getByTestId('build-multisample-1').click()
  await page.getByTestId('ms-folder-input').setInputFiles(dir)

  const editor = page.getByTestId('range-editor')
  const rows = editor.locator('[data-range]')
  await expect(rows).toHaveCount(3)

  // Knock the whole instrument an octave out, then put the import's row away:
  // what follows has to stand on the ranges themselves.
  await editor.getByRole('button', { name: 'Down an octave' }).click()
  await expect(rows.nth(0)).toContainText('C3')
  await editor.getByTestId('range-import-dismiss').click()
  // The Keys cell, not the whole row: the row's text is about to gain a
  // provenance column and its root is meant to change.
  const keys = rows.nth(0).locator('td').nth(1)
  const boundary = await keys.innerText()

  await editor.getByTestId('range-redetect-start').click()
  const proposal = editor.getByTestId('range-redetect')
  await expect(proposal).toContainText('3 of 3 roots would move')
  await expect(proposal).toContainText('C3 → C4')
  // Still a proposal: the ranges have not moved.
  await expect(rows.nth(0)).toContainText('C3')

  await proposal.getByTestId('range-redetect-apply').click()
  await expect(editor.getByTestId('range-redetect')).toHaveCount(0)
  await expect(rows.nth(0)).toContainText('C4')
  await expect(editor.getByTestId('range-import')).toContainText('3 roots changed')
  // Roots only. The boundary is where the shift left it, because a boundary is
  // a decision and this was not asked to repair one.
  await expect(keys).toHaveText(boundary)
})

test('dismissing the folder question leaves the oscillator as it was (issue #33)', async ({ page }) => {
  // A folder dropped on a synth is a multi-sample import wherever the waveform
  // stood, so this is the way in that can find a square oscillator: it becomes
  // a sample oscillator while the question is up, and only stays one if a
  // sample lands on it.
  await page.goto('/')
  await choose(page, 'new-synth')
  const waveform = page.locator('[data-attr="osc1.type"]')

  await dropFolder(page, 'Piano', ['notes.txt'])
  await expect(page.getByTestId('folder-import')).toContainText('no .wav files in that folder')
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
  await choose(page, 'new-synth')
  await page.locator('[data-attr="osc1.type"]').selectOption('sample')
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

test('a synth takes one sample, without a folder', async ({ page }) => {
  // Named as a sample library names things: the note is in the name, and the
  // instrument tunes to it when the file is chosen.
  const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deluge-one-')), 'Piano F3.wav')
  fs.writeFileSync(wav, wavBytes(1000))

  await page.goto('/')
  await choose(page, 'new-synth')
  const waveform = page.locator('[data-attr="osc1.type"]')
  await expect(waveform).toHaveValue('square')

  // Nothing is offered until the oscillator is a sample oscillator; then one
  // sample and a whole folder are offered side by side.
  await expect(page.getByTestId('pick-sample-1')).toHaveCount(0)
  await waveform.selectOption('sample')
  await expect(page.getByTestId('build-multisample-1')).toBeVisible()
  await page.getByTestId('pick-sample-1').click()
  const picker = page.getByTestId('sample-picker')
  await expect(picker).toContainText('Sample for Osc A')

  // Dismissed, it leaves nothing behind: the waveform the user chose, and no
  // file on it.
  await picker.getByTestId('sample-cancel').click()
  await expect(waveform).toHaveValue('sample')
  await expect(page.getByTestId('osc-no-sample-1')).toBeVisible()

  await page.getByTestId('pick-sample-1').click()
  await picker.getByTestId('sample-file-input').setInputFiles(wav)
  await expect(picker).toHaveCount(0)

  // The oscillator plays the file, at the pitch the file says it was recorded
  // at, in the repeat mode the browser would set for something this short.
  await expect(waveform).toHaveValue('sample')
  await expect(page.locator('[data-group="osc"]')).toContainText('Piano F3.wav')
  await expect(page.locator('[data-attr="osc1.loopMode"]')).toHaveValue('1')
  await page.getByTestId('edit-ranges-1').click()
  const row = page.getByTestId('range-editor').locator('[data-range="0"]')
  await expect(row).toContainText('F3')
  await expect(row).toContainText('-5 st')

  // And it is one sample, not the start of a key map: the same button now
  // changes it, and the folder import is still the other way in.
  await expect(page.getByTestId('pick-sample-1')).toHaveText('Change sample…')
  await expect(page.getByTestId('build-multisample-1')).toBeVisible()
})
