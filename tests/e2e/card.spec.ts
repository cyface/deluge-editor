import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FIXTURE = path.resolve('tests/e2e/../fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')
const fixtureText = fs.readFileSync(FIXTURE, 'utf8')
const OFFICIAL = path.resolve('tests/e2e/../fixtures/official-4.0.1/Attribute Format Baseline.XML')
const officialText = fs.readFileSync(OFFICIAL, 'utf8')

test('card: connect, browse, load, edit, save with verification, reload', async ({ page }) => {
  await page.addInitScript((seed) => {
    ;(globalThis as unknown as { __cardSeed: unknown }).__cardSeed = seed
  }, { '/SYNTHS/Default Synth.XML': fixtureText, '/SYNTHS/Baseline.XML': officialText })
  await page.addInitScript({ path: path.resolve('tests/e2e/fake-deluge.js') })
  await page.goto('/')

  // Connect: the Card button opens the panel, which finds the (fake) Deluge,
  // reads its identity, and lists /SYNTHS.
  await expect(page.getByTestId('card-button')).toHaveText('Connect')
  await page.getByTestId('card-button').click()
  await expect(page.getByTestId('card-panel')).toBeVisible()
  await expect(page.getByTestId('card-button')).toHaveText('Browse Card')
  await expect(page.getByTestId('card-path')).toHaveText('/SYNTHS')
  await expect(page.getByTestId('card-panel')).toContainText('fw 1.3.0')

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

  // Save: the existing name arms first, overwrites second, then the client
  // reads the file back and byte-compares before reporting success.
  await page.getByTestId('card-button').click()
  await expect(page.getByTestId('card-save-name')).toHaveValue('Default Synth.XML')
  await page.getByTestId('card-save').click()
  await expect(page.getByTestId('card-save')).toHaveText('Overwrite?')
  await page.getByTestId('card-save').click()
  await expect(page.getByTestId('card-saved')).toContainText('byte-identical')

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
  await page.locator('[data-entry="Default Synth.XML"]').click()
  await expect(knob).toHaveAttribute('aria-valuenow', '29')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // A file written by official 4.0.1 does not clobber the device's firmware:
  // the connected Deluge outranks the file's provenance (issue #7).
  await page.getByTestId('card-button').click()
  await page.locator('[data-entry="Baseline.XML"]').click()
  await expect(page.getByTestId('file-name')).toHaveText('Baseline.XML')
  await expect(page.getByTestId('firmware-locked')).toHaveText('c1.3.0')
})
