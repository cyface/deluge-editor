import { expect, test } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')

test('load a fixture, see the whole preset, focus a block, edit one value, see exactly that change', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)

  // The whole preset: OLED summary, firmware from the file, every block expanded.
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')
  await expect(page.getByTestId('firmware')).toHaveValue('c1.3.0')
  await expect(page.getByTestId('summary')).toContainText('Saw and square, 4 voices in unison')
  const panels = page.locator('[data-group]')
  await expect(panels).toHaveCount(12)
  await expect(page.getByTestId('collapsed')).toHaveCount(0)
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // Clicking a flow block is a filter: Filters stays, the other eleven collapse to chips.
  await page.locator('[data-blk="filters"]').click()
  await expect(panels).toHaveCount(1)
  await expect(page.locator('[data-group="filters"]')).toBeVisible()
  await expect(page.locator('[data-chip]')).toHaveCount(11)

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
  // Worded like the control, in the Deluge's own numbers; raw path and hex live in the tooltip.
  await expect(rows.first()).toContainText('LPF Freq')
  await expect(rows.first()).toContainText('28 → 29')
  await expect(rows.first()).toHaveAttribute('title', /0x10000000/)

  // The row's × puts the value back the way the file had it.
  await rows.first().getByRole('button').click()
  await expect(page.getByTestId('change-count')).toHaveText('0')
  await expect(page.getByTestId('identical')).toContainText('byte-identical')
  await page.getByTestId('changes-button').click()

  // Clicking the strip's background expands everything again.
  await page.getByTestId('flow-strip').click({ position: { x: 5, y: 5 } })
  await expect(panels).toHaveCount(12)
})

test('reassign a gold knob: one change, the brass face follows (issue #23)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)

  // Stock: page 2's top knob (file index 3) is LPF Freq, drawn with a brass face.
  await expect(page.locator('.k.gold [data-param="lpfFrequency"]')).toHaveCount(1)
  await expect(page.locator('.k.gold [data-param="hpfFrequency"]')).toHaveCount(0)

  await page.locator('[data-attr="modKnob3.controlsParam"]').selectOption('hpfFrequency')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await expect(page.locator('.k.gold [data-param="hpfFrequency"]')).toHaveCount(1)
  await expect(page.locator('.k.gold [data-param="lpfFrequency"]')).toHaveCount(0)

  // Putting the stock assignment back restores the file byte for byte.
  await page.locator('[data-attr="modKnob3.controlsParam"]').selectOption('lpfFrequency')
  await expect(page.getByTestId('change-count')).toHaveText('0')
  await expect(page.getByTestId('identical')).toContainText('byte-identical')
})

test('New Synth starts from the Deluge-authored init template (issue #25)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('new-synth').click()

  // The template loads like an opened file: unnamed, c1.3.0-authored, clean.
  await expect(page.getByTestId('file-name')).toHaveText('UNNAMED')
  await expect(page.getByTestId('firmware')).toHaveValue('c1.3.0')
  await expect(page.getByTestId('summary')).toContainText('Saw and square, 4 voices in unison')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // The round-trip baseline is the template itself, from the first click.
  await page.getByTestId('changes-button').click()
  await expect(page.getByTestId('identical')).toContainText('byte-identical')

  // An edit diffs against the template; its × restores the template's bytes.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await expect(knob).toHaveAttribute('aria-valuenow', '28')
  await knob.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await page.locator('[data-testid="changes"] [data-change]').first().getByRole('button').click()
  await expect(page.getByTestId('change-count')).toHaveText('0')
  await expect(page.getByTestId('identical')).toContainText('byte-identical')
})

test('a picked ._ AppleDouble sidecar is refused with a plain message (issue #24)', async ({ page }) => {
  await page.goto('/')
  // The picker's `accept=".xml,.XML"` matches `._Default Synth.XML`, and
  // drag-and-drop bypasses `accept` entirely — so the load itself must say no.
  await page.getByTestId('file-input').setInputFiles({
    name: '._Default Synth.XML',
    mimeType: 'application/xml',
    buffer: Buffer.from([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00]),
  })
  await expect(page.getByRole('alert')).toContainText('macOS metadata sidecar')
  await expect(page.getByRole('alert')).toContainText('load Default Synth.XML instead')

  // The real preset still loads afterwards, clearing the message.
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('re-targeting the firmware drops controls it cannot honour, without touching the file', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await expect(page.locator('[data-param="waveFold"]')).toHaveCount(1)
  await expect(page.locator('[data-group="random"]')).toHaveCount(1)
  await page.getByTestId('firmware').selectOption('4.1.4')
  await expect(page.locator('[data-param="waveFold"]')).toHaveCount(0)
  // The whole Randomiser block predates 4.1.4, so the panel goes with its controls.
  await expect(page.locator('[data-group="random"]')).toHaveCount(0)
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

test('right-click a patchable knob, pick a source, land on the new cable (issue #13)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('change-count')).toHaveText('0')

  const rows = page.locator('[data-cable]')
  const before = await rows.count()

  // Right-click LPF Res (patchable, nothing patched to it yet) and pick LFO 2.
  await page.locator('[data-param="lpfResonance"]').click({ button: 'right' })
  await expect(page.getByTestId('cable-picker')).toBeVisible()
  await expect(page.getByTestId('cable-picker')).toContainText('LPF Res')
  await page.getByRole('menuitem', { name: 'LFO 2', exact: true }).click()
  await expect(page.getByTestId('cable-picker')).toHaveCount(0)

  // One new cable, amount 0, both sides as picked.
  await expect(rows).toHaveCount(before + 1)
  const row = page.locator('.cable.new')
  await expect(row.locator('select').first()).toHaveValue('lfo2')
  await expect(row.locator('select').nth(1)).toHaveValue('lpfResonance')
  await expect(page.getByTestId('change-count')).not.toHaveText('0')

  // The same pair again is revealed, not duplicated.
  await page.locator('[data-param="lpfResonance"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'LFO 2', exact: true }).click()
  await expect(rows).toHaveCount(before + 1)
})
