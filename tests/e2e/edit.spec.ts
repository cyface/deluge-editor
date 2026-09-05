import { expect, test } from '@playwright/test'
import { choose } from './bar.js'
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

  // Clicking a modulator while a focus hides the Mod Matrix pins the matrix
  // too: its cables are what the click shows, and they are drawn there.
  await expect(page.locator('[data-group="cables"]')).toHaveCount(0)
  // Each modulator says what feeds it; Y is the mod wheel on an ordinary channel.
  await expect(page.locator('[data-source="y"]')).toHaveAttribute('title', /mod wheel \(CC 1\)/)
  await expect(page.getByTestId('flow-strip')).not.toHaveAttribute('title', /background/)
  await page.locator('[data-source="velocity"]').click()
  await expect(page.locator('[data-group="cables"]')).toBeVisible()
  await expect(panels).toHaveCount(3)
  await expect(page.locator('[data-group="cables"] .cable.hl')).toHaveCount(2)
  // Clicking it again stops inspecting; the pins stay as they are.
  await page.locator('[data-source="velocity"]').click()
  await expect(page.locator('[data-group="cables"] .cable.hl')).toHaveCount(0)
  await expect(panels).toHaveCount(3)

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

test('New asks before discarding unsaved changes, in the same dialog a dropped preset uses', async ({ page }) => {
  await page.goto('/')
  await choose(page, 'new-synth')
  await expect(page.getByTestId('change-count')).toHaveText('0')

  // Clean: New › Kit just goes, no question.
  await choose(page, 'new-kit')
  await expect(page.locator('[data-group="kit"]')).toBeVisible()
  await expect(page.getByTestId('confirm')).toHaveCount(0)
  await choose(page, 'new-synth')
  await expect(page.locator('[data-group="kit"]')).toHaveCount(0)

  // Dirty: the item closes the menu and asks in a modal; Cancel and Escape
  // both keep the work.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await expect(knob).toHaveAttribute('aria-valuenow', '50') // the init synth's cutoff is wide open
  await knob.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await choose(page, 'new-kit')
  await expect(page.getByTestId('menu-new-list')).toHaveCount(0)
  await expect(page.getByTestId('confirm')).toBeVisible()
  await expect(page.getByTestId('confirm')).toContainText('Discard changes to your unsaved preset? A new kit replaces it — 1 unsaved change.')
  await expect(page.getByTestId('confirm-go')).toHaveText('Discard')
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('confirm')).toHaveCount(0)
  await expect(page.getByTestId('change-count')).toHaveText('1')
  await expect(page.locator('[data-group="kit"]')).toHaveCount(0)
  await choose(page, 'new-synth')
  await expect(page.getByTestId('confirm')).toContainText('A new synth replaces it')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('confirm')).toHaveCount(0)
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // Discard goes through: the edit is gone, the new preset is here.
  await choose(page, 'new-kit')
  await page.getByTestId('confirm-go').click()
  await expect(page.getByTestId('confirm')).toHaveCount(0)
  await expect(page.locator('[data-group="kit"]')).toBeVisible()
  await expect(page.getByTestId('change-count')).toHaveText('0')
})

test('New Synth starts from the Deluge-authored init template (issue #25)', async ({ page }) => {
  await page.goto('/')
  await choose(page, 'new-synth')

  // The template loads like an opened file: unnamed, c1.3.0-authored, clean.
  await expect(page.getByTestId('file-name')).toHaveText('(unnamed)')
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
  await expect(page.getByTestId('confirm')).toHaveCount(0)

  // A preset is loaded: the next drop must ask. Cancel keeps everything.
  await dropXml('Other.XML', xml)
  await expect(page.getByTestId('confirm')).toBeVisible()
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('confirm')).toHaveCount(0)
  await expect(page.getByTestId('file-name')).toHaveText('Default Synth.XML')

  // Replace goes through, and the dialog names unsaved changes when there are any.
  const knob = page.locator('[data-param="lpfFrequency"]')
  await knob.focus()
  await page.keyboard.press('ArrowUp')
  await dropXml('Other.XML', xml)
  await expect(page.getByTestId('confirm')).toContainText('1 unsaved change')
  await page.getByTestId('confirm-go').click()
  await expect(page.getByTestId('file-name')).toHaveText('Other.XML')
  await expect(page.getByTestId('change-count')).toHaveText('0')
})

test('the top bar’s commands live under New, Open and Save; the modes stay out (issue #37)', async ({ page }) => {
  await page.goto('/')

  // Three verbs and the three modes: that is the whole row of buttons. (Follow
  // Mode and Live Edit are there because, with nothing loaded, both are ways
  // to start a preset rather than things done to one.)
  const buttons = () =>
    page.locator('.bar').evaluate((bar) =>
      [...bar.querySelectorAll(':scope > button, :scope > .wrap > button')].map((el) => (el.textContent ?? '').trim()).join(' | '),
    )
  expect(await buttons()).toBe('New▾ | Open▾ | Save▾ | Follow Mode | Live Edit | Changes')

  // A menu is a menu: the button says it has one and whether it is open, the
  // items are menuitems, and opening puts focus on the first of them.
  const menu = page.getByTestId('menu-save')
  await expect(menu).toHaveAttribute('aria-haspopup', 'menu')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  const list = page.getByTestId('menu-save-list')
  await expect(list).toHaveRole('menu')
  await expect(list.getByRole('menuitem')).toHaveText(['Download XML', 'To Deluge…', 'To Deluge — Overwrite'])
  // Nothing loaded: the items say what they would do, but cannot do it yet.
  await expect(page.getByTestId('download-xml')).toBeDisabled()
  await expect(page.getByTestId('card-save-button')).toBeDisabled()
  await expect(page.getByTestId('card-overwrite')).toBeDisabled()
  // Overwrite acts on the card at a click, so a rule keeps it off To Deluge's doorstep.
  await expect(list.getByRole('separator')).toHaveCount(1)

  // Escape closes it and puts focus back on the button; a click elsewhere closes it too.
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(menu).toBeFocused()
  await menu.click()
  await expect(list).toBeVisible()
  await page.locator('.bar .logo').click()
  await expect(list).toHaveCount(0)

  // Arrow keys walk the items and wrap; Home and End jump.
  await page.getByTestId('menu-new').click()
  await expect(page.getByTestId('new-synth')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('new-kit')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('randomize-button')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByTestId('new-synth')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('menu-new-list')).toHaveCount(0)
  await expect(page.getByTestId('file-name')).toHaveText('(unnamed)')

  // Download zip is conditional: a kit grows it, between XML and the Deluge.
  await choose(page, 'new-kit')
  await page.getByTestId('menu-save').click()
  await expect(list.getByRole('menuitem')).toHaveText(['Download XML', 'Download zip', 'To Deluge…', 'To Deluge — Overwrite'])
  await expect(page.getByTestId('download-xml')).toBeEnabled()
  await page.keyboard.press('Escape')

  // The file name is the flex child that pays for the row: with the commands
  // folded away a long name is not cut short even on a laptop.
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.getByTestId('file-input').setInputFiles(FIXTURE)
  const name = page.getByTestId('file-name')
  await expect(name).toHaveText('Default Synth.XML')
  // Poll the fit check rather than measuring once: Barlow Condensed is
  // self-hosted (@fontsource) and loads async, so a cold CI runner can still
  // be showing the wider fallback face when the text arrives, overflowing the
  // name box until the real font (which fits) loads and reflows. Polling
  // settles with that reflow instead of racing it.
  await expect
    .poll(() => name.evaluate((el) => el.scrollWidth <= el.clientWidth), { timeout: 10000 })
    .toBe(true)
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
  await choose(page, 'new-kit')
  await expect(page.locator('[data-group="kit"]')).toBeVisible()
  const kit = await sweep()
  expect(kit.untitled).toEqual([])
  expect(kit.total).toBeGreaterThan(60)
})

test('the LFO and pulse-width graphs draw, and stand down where the firmware takes the control away (issues #35, #36)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)

  const lfo = page.getByTestId('lfo-graph')
  // The caption and legend sit beside the svg, not inside it.
  const lfoWrap = lfo.locator('../..')
  const pwA = page.getByTestId('pulse-graph-1')
  const pwB = page.getByTestId('pulse-graph-2')

  // Default Synth is saw + square: both oscillators get a pulse width, and the
  // rate axis is the firmware's own arithmetic, not the menu number.
  await expect(pwA).toBeVisible()
  await expect(pwB).toBeVisible()
  await expect(lfo).toBeVisible()
  await expect(lfoWrap).toContainText('Hz')

  // The handle is grabbed and dragged, as the filter curve's dots are.
  const handle = pwA.locator('[role="slider"]')
  await expect(handle).toHaveAttribute('aria-valuenow', '0')
  await pwA.scrollIntoViewIfNeeded()
  const grip = (await handle.boundingBox())!
  const box = (await pwA.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, grip.y + grip.height / 2)
  await page.mouse.up()
  await expect(handle).toHaveAttribute('aria-valuenow', '25')
  await expect(page.locator('[data-param="oscAPulseWidth"]')).toHaveAttribute('aria-valuenow', '25')

  // Pressing the graph itself is not a value change: only the handle moves it.
  await page.mouse.click(box.x + box.width * 0.8, box.y + 12)
  await expect(handle).toHaveAttribute('aria-valuenow', '25')

  // A sample oscillator has no pulse width to draw — `PulseWidth::isRelevant`
  // — so neither the knob nor the graph is offered for it.
  await page.locator('select[data-attr="osc1.type"]').selectOption('sample')
  await expect(pwA).toHaveCount(0)
  await expect(page.locator('[data-param="oscAPulseWidth"]')).toHaveCount(0)
  await expect(pwB).toBeVisible()

  // Nor does anything in FM mode, where the firmware hides it for both.
  await page.locator('select[data-attr="mode"]').selectOption('fm')
  await expect(pwB).toHaveCount(0)

  // A synced LFO has no frequency a preset file can know: the axis becomes
  // cycles and the graph says the Rate knob is doing nothing.
  await page.locator('select[data-attr="lfo1.syncLevel"]').selectOption('3')
  await expect(lfoWrap).toContainText('1 cycle = 1-bar')
  await expect(lfoWrap).not.toContainText('Hz')
  await expect(lfo.locator('[role="slider"]')).toHaveCount(0)
  // And the Rate knob stops taking input, rather than turning to no effect.
  const rate = page.locator('[data-param="lfo1Rate"]')
  await expect(rate).toHaveAttribute('aria-disabled', 'true')
  const was = await rate.getAttribute('aria-valuenow')
  await rate.focus()
  await page.keyboard.press('ArrowUp')
  await expect(rate).toHaveAttribute('aria-valuenow', was!)
})
