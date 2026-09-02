import { expect, test } from '@playwright/test'
import { choose, reveal } from './bar.js'

test('roll a random patch: seeded, scoped, and every change listed', async ({ page }) => {
  await page.goto('/')

  // The button needs no preset: it starts from the firmware's init synth.
  await choose(page, 'randomize-button')
  await expect(page.getByTestId('randomize-panel')).toBeVisible()
  await expect(page.getByTestId('file-name')).toHaveText('UNNAMED')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // A seeded roll is reproducible, so the test can name the patch it expects.
  await page.getByTestId('randomize-seed').fill('C0FFEE')
  await page.getByTestId('randomize-roll').click()

  // It changed a lot, and it named the unnamed preset from what it rolled.
  const count = Number(await page.getByTestId('change-count').textContent())
  expect(count).toBeGreaterThan(10)
  const named = await page.getByTestId('file-name').textContent()
  expect(named).toMatch(/^[A-Z0-9]+ [A-Z0-9]+\.XML$/)

  // The same seed again is the same patch: the change count doesn't move.
  await page.getByTestId('randomize-roll').click()
  await expect(page.getByTestId('change-count')).toHaveText(String(count))

  // A fresh roll is a different patch, and with Name it on, a different name.
  await page.getByTestId('randomize-seed').fill('')
  await page.getByTestId('randomize-roll').click()
  await expect(page.getByTestId('file-name')).not.toHaveText(named!)
  await expect(page.getByTestId('file-name')).toHaveText(/^[A-Z0-9]+ [A-Z0-9]+\.XML$/)

  // Name it off: the name stays put through a roll.
  await page.getByTestId('randomize-name').click()
  const kept = await page.getByTestId('file-name').textContent()
  await page.getByTestId('randomize-roll').click()
  await expect(page.getByTestId('file-name')).toHaveText(kept!)
  await page.getByTestId('randomize-name').click()

  // Scope: filters only, and the changes dock shows nothing else moved.
  // The roll is unsaved work, so New asks first.
  await choose(page, 'new-synth')
  await page.getByTestId('confirm-go').click()
  await expect(page.getByTestId('change-count')).toHaveText('0')
  await page.locator('[data-section]').filter({ hasText: 'Oscillators' }).click() // off
  for (const section of ['Voice', 'Mod FX', 'Delay & Reverb', 'Envelopes & LFOs', 'Mod Matrix']) {
    await page.locator('[data-section]').filter({ hasText: section }).first().click()
  }
  await expect(page.locator('[data-section][aria-pressed="true"]')).toHaveCount(1)
  await page.getByTestId('randomize-seed').fill('42')
  await page.getByTestId('randomize-roll').click()

  await page.getByTestId('changes-button').click()
  const rows = page.locator('[data-testid="changes"] [data-change]')
  await expect(rows.first()).toBeVisible()
  for (const path of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-change')))) {
    expect(path).toMatch(/@(lpf|hpf|filterRoute|waveFold)/)
  }

  // Every roll is an ordinary edit: one row's × puts that value back.
  const before = Number(await page.getByTestId('change-count').textContent())
  await rows.first().getByRole('button').click()
  await expect(page.getByTestId('change-count')).toHaveText(String(before - 1))
})

test('intensity and scope stay put while the panel is open, and Escape closes it', async ({ page }) => {
  await page.goto('/')
  await choose(page, 'new-synth')
  await choose(page, 'randomize-button')

  await page.locator('[data-level="wild"]').click()
  await expect(page.locator('[data-level="wild"]')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('randomize-roll').click()
  await expect(page.locator('[data-level="wild"]')).toHaveAttribute('aria-pressed', 'true')

  // "Same seed" only lights up once there is a seed to repeat.
  await expect(page.getByTestId('randomize-again')).toBeEnabled()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('randomize-panel')).toHaveCount(0)
  // Reopening keeps the choices; it is a panel, not a wizard.
  await choose(page, 'randomize-button')
  await expect(page.locator('[data-level="wild"]')).toHaveAttribute('aria-pressed', 'true')
})

test('the generator and the arpeggiator’s own Randomiser stay distinct', async ({ page }) => {
  await page.goto('/')
  await choose(page, 'new-synth')
  // The firmware's note randomiser is a panel in the grid, under its own name.
  await expect(page.locator('[data-group="random"] h2')).toHaveText('Randomiser')
  // The generator is a New menu item and a strip, and never uses that word:
  // it is called Randomize everywhere it appears.
  const item = await reveal(page, 'randomize-button')
  await expect(item).toHaveText('Randomize')
  await item.click()
  const strip = page.getByTestId('randomize-panel')
  await expect(strip).toBeVisible()
  await expect(strip).not.toContainText('Randomiser')
  // …and it is a strip in the flow, not something floating over the patch.
  await expect(strip).toHaveCSS('position', 'relative')
})
