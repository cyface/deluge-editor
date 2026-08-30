import { expect, test } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')

test('load a fixture, see the whole preset, focus a block, edit one value, see exactly that change', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)

  // The whole preset: OLED summary, firmware from the file, every block expanded.
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')
  await expect(page.getByTestId('firmware')).toHaveValue('c1.3.0')
  await expect(page.getByTestId('summary')).toContainText('Saw and square, 4 voices thick')
  const panels = page.locator('[data-group]')
  await expect(panels).toHaveCount(11)
  await expect(page.getByTestId('collapsed')).toHaveCount(0)
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // Clicking a flow block is a filter: Filters stays, the other ten collapse to chips.
  await page.locator('[data-blk="filters"]').click()
  await expect(panels).toHaveCount(1)
  await expect(page.locator('[data-group="filters"]')).toBeVisible()
  await expect(page.locator('[data-chip]')).toHaveCount(10)

  // Shift-click pins a second block.
  await page.locator('[data-blk="out"]').click({ modifiers: ['Shift'] })
  await expect(panels).toHaveCount(2)

  // Edit one value: LPF cutoff 28 → 29 from the keyboard.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await expect(knob).toHaveAttribute('aria-valuenow', '28')
  await knob.focus()
  await page.keyboard.press('ArrowUp')
  await expect(knob).toHaveAttribute('aria-valuenow', '29')

  // The flattened diff against the source shows exactly that one change.
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.getByTestId('changes-button').click()
  const rows = page.locator('[data-testid="changes"] [data-change]')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toHaveAttribute('data-change', 'sound/defaultParams@lpfFrequency')
  await expect(rows.first()).toContainText('0x10000000')

  // Clicking the strip's background expands everything again.
  await page.getByTestId('flow-strip').click({ position: { x: 5, y: 5 } })
  await expect(panels).toHaveCount(11)
})

test('re-targeting the firmware drops controls it cannot honour, without touching the file', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await expect(page.locator('[data-param="waveFold"]')).toHaveCount(1)
  await page.getByTestId('firmware').selectOption('4.1.4')
  await expect(page.locator('[data-param="waveFold"]')).toHaveCount(0)
  await expect(page.locator('[data-param="lpfFrequency"]')).toHaveCount(1)
  await expect(page.getByTestId('change-count')).toHaveText('0')
})

test('a kit shows its rows and edits the selected one', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML'))
  await expect(page.getByTestId('summary')).toContainText('Sample kick.wav')
  const rows = page.locator('[data-testid="kit-rows"] tbody tr')
  await expect(rows).toHaveCount(5)
  await rows.nth(1).click()
  await expect(rows.nth(1)).toHaveClass(/on/)
  const knob = page.locator('[data-param="volume"]').first()
  await knob.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.getByTestId('changes-button').click()
  await expect(page.locator('[data-testid="changes"] [data-change]').first()).toHaveAttribute('data-change', /^kit\/soundSources\/sound\[1\]\/defaultParams@volume$/)
})
