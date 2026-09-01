import { expect, test } from '@playwright/test'
import fs from 'node:fs'
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

  // The slot is a one-line summary until clicked; the selects appear in place (issue #27).
  await expect(page.locator('[data-attr="modKnob3.controlsParam"]')).toHaveCount(0)
  await page.locator('[data-knob="3"]').click()
  await page.locator('[data-attr="modKnob3.controlsParam"]').selectOption('hpfFrequency')
  await expect(page.locator('[data-knob="3"]')).toContainText('HPF Freq')
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
  await expect(page.getByTestId('summary')).toContainText('One square wave')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // The round-trip baseline is the template itself, from the first click.
  await page.getByTestId('changes-button').click()
  await expect(page.getByTestId('identical')).toContainText('byte-identical')

  // An edit diffs against the template; its × restores the template's bytes.
  // The blank synth's LPF starts wide open (50), like the device's own.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await expect(knob).toHaveAttribute('aria-valuenow', '50')
  await knob.focus()
  await page.keyboard.press('ArrowDown')
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

test('a dropped file over a loaded preset asks before replacing it', async ({ page }) => {
  await page.goto('/')

  // Nothing loaded: a dropped preset opens straight away, no dialog.
  const dropXml = (name: string, xml: string) =>
    page.evaluate(([n, x]) => {
      // globalThis-cast: the browser DOM types aren't in the node tsconfig's lib
      const g = globalThis as unknown as {
        DataTransfer: new () => { items: { add(f: unknown): void } }
        File: new (bits: string[], name: string, opts: { type: string }) => unknown
        dispatchEvent(e: Event): boolean
      }
      const dt = new g.DataTransfer()
      dt.items.add(new g.File([x], n, { type: 'text/xml' }))
      g.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: dt }))
    }, [name, xml] as const)
  const xml = fs.readFileSync(FIXTURE, 'utf8')
  await dropXml('Default Synth.XML', xml)
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')
  await expect(page.getByTestId('drop-confirm')).toHaveCount(0)

  // A preset is loaded: the next drop must ask. Cancel keeps everything.
  await dropXml('Other.XML', xml)
  await expect(page.getByTestId('drop-confirm')).toBeVisible()
  await page.getByTestId('drop-confirm-cancel').click()
  await expect(page.getByTestId('drop-confirm')).toHaveCount(0)
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')

  // Replace goes through, and the dialog names unsaved changes when there are any.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await knob.focus()
  await page.keyboard.press('ArrowUp')
  await dropXml('Other.XML', xml)
  await expect(page.getByTestId('drop-confirm')).toContainText('1 unsaved change')
  await page.getByTestId('drop-confirm-replace').click()
  await expect(page.getByTestId('file-name')).toHaveText('Other.XML')
  await expect(page.getByTestId('change-count')).toHaveText('0')
})

test('the top bar’s buttons are grouped by dividers that stay put (issue #34)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)

  // Four dividers cut the nine buttons into five groups: the Deluge over MIDI,
  // starting from a template, opening from this computer, downloads, changes.
  const seps = page.getByTestId('bar-sep')
  await expect(seps).toHaveCount(4)
  const groups = async () =>
    page.locator('.bar').evaluate((bar) =>
      [...bar.children]
        .filter((el) => el.tagName === 'BUTTON' || el.dataset.testid === 'bar-sep')
        .map((el) => (el.dataset.testid === 'bar-sep' ? '|' : (el.textContent ?? '').trim()))
        .join(' '),
    )
  expect(await groups()).toBe(
    'Open from Deluge Save to Deluge Follow Mode | New Synth New Kit | Open File | Download XML | Changes 0',
  )

  // Download Zip is conditional, so the last divider has to live outside it:
  // a kit grows a button in that group and the divider does not move.
  await page.getByTestId('new-kit').click()
  await expect(page.getByTestId('download-zip-top')).toBeVisible()
  await expect(seps).toHaveCount(4)
  expect(await groups()).toBe(
    'Open from Deluge Save to Deluge Follow Mode | New Synth New Kit | Open File | Download XML Download Zip | Changes 0',
  )

  // A divider is a drawn line, nothing more: not announced, not reachable.
  for (const sep of await seps.all()) await expect(sep).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.bar [data-testid="bar-sep"][tabindex]')).toHaveCount(0)
})

test('every control in the panels says what it does (issue #20)', async ({ page }) => {
  // The promise of the tooltip pass is that there is nothing left to hover in
  // vain, so the test is the sweep rather than a sample of it. A knob and a
  // toggle carry the title themselves; a select and a number field carry it on
  // the field around them, so the label is covered too.
  const sweep = async () =>
    page.locator('body').evaluate((body) => {
      const controls = [...body.querySelectorAll('[data-group] select, [data-group] input[type="number"], [data-group] .toggle, [data-group] .k')]
      const untitled = controls
        .filter((el) => {
          // The title may sit on the control or on the field around it, but it
          // has to be inside the same panel to be about this control.
          const titled = el.closest('[title]')
          const panel = el.closest('[data-group]')
          return !(titled && panel?.contains(titled) && (titled.getAttribute('title') ?? '').trim() !== '')
        })
        .map((el) => `${el.closest('[data-group]')?.getAttribute('data-group')}: ${el.tagName.toLowerCase()}.${el.className || el.getAttribute('data-attr')}`)
      return { total: controls.length, untitled }
    })

  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  await expect(page.locator('[data-group]')).toHaveCount(12)
  const synth = await sweep()
  expect(synth.untitled).toEqual([])
  // Not a sweep of nothing: the fixture's panels really are full of controls.
  expect(synth.total).toBeGreaterThan(60)

  // Every panel header carries the block's own line as well.
  const headings = page.locator('[data-group] h2')
  expect(await headings.evaluateAll((hs) => hs.filter((h) => !h.title).length)).toBe(0)

  // And the same sweep over a kit, whose bus panel and rows are different code.
  await page.getByTestId('new-kit').click()
  await expect(page.locator('[data-group="kit"]')).toBeVisible()
  const kit = await sweep()
  expect(kit.untitled).toEqual([])
  expect(kit.total).toBeGreaterThan(60)
})
