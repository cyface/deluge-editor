import { expect, test } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/community-c1.3.0-beta-3f898e9/Default Synth.XML')

/**
 * A MIDI input the page can be given without a Deluge attached: enough of
 * `MIDIAccess` for Follow Mode to attach to, plus a hook the test sends CCs
 * through. `midimessage` events arrive on the port exactly as the browser
 * would deliver them.
 */
function fakeMidi() {
  class FakeInput extends EventTarget {
    name = 'Deluge Port 3'
    id = 'in-3'
    open() {
      return Promise.resolve(this)
    }
  }
  class FakeOutput {
    name = 'Deluge Port 3'
    id = 'out-3'
    send(bytes: Uint8Array) {
      ;(globalThis as unknown as { __sent: number[][] }).__sent.push([...bytes])
    }
  }
  class FakeAccess extends EventTarget {
    inputs = new Map<string, FakeInput>()
    outputs = new Map<string, FakeOutput>()
  }
  const input = new FakeInput()
  const access = new FakeAccess()
  access.inputs.set('in-3', input)
  access.outputs.set('out-3', new FakeOutput())
  ;(globalThis as unknown as { __sent: number[][] }).__sent = []
  ;(globalThis as unknown as { __midi: FakeInput }).__midi = input
  ;(navigator as unknown as { requestMIDIAccess: () => Promise<unknown> }).requestMIDIAccess = () =>
    Promise.resolve(access)
}

test('Follow Mode shows only what MIDI Follow reaches, and mirrors the instrument (issue #9)', async ({ page }) => {
  await page.addInitScript(fakeMidi)
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(FIXTURE)

  await page.getByTestId('follow-button').click()
  await expect(page.getByTestId('follow-header')).toContainText('Following')
  await expect(page.getByTestId('follow-header')).toContainText('Deluge Port 3')

  // The subset: the full editor's twelve blocks give way to the follow view,
  // whose knobs are exactly the parameters the c1.3.0 CC map covers — 80 of
  // them, less the envelope and LFO ones the tabs show four and one at a time.
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.locator('[data-follow-cc]')).toHaveCount(80 - 20 + 5)
  await expect(page.locator('[data-follow-cc="74"] [data-param="lpfFrequency"]')).toBeVisible()
  // Osc B's wave index lost its CC in the c1.3 map, so it is not here.
  await expect(page.locator('[data-param="oscBWavetablePosition"]')).toHaveCount(0)
  // Every panel whose picture is the control keeps it (issues #35, #36).
  await expect(page.getByTestId('filter-graph')).toBeVisible()
  await expect(page.getByTestId('env-graph')).toBeVisible()
  await expect(page.getByTestId('lfo-graph')).toBeVisible()
  // Default Synth is saw + square, so both oscillators are offered pulse width.
  await expect(page.getByTestId('pulse-graph-1')).toBeVisible()
  await expect(page.getByTestId('pulse-graph-2')).toBeVisible()

  // A CC on the follow channel moves the matching control. 0x80 = ch 1,
  // CC 74 (LPF frequency), value 127 — the top of the knob's travel.
  const lpf = page.locator('[data-param="lpfFrequency"]')
  await expect(lpf).toHaveAttribute('aria-valuenow', '28')
  await page.evaluate(() =>
    (globalThis as unknown as { __midi: EventTarget }).__midi.dispatchEvent(
      Object.assign(new Event('midimessage'), { data: new Uint8Array([0xb0, 74, 127]) }),
    ),
  )
  await expect(lpf).toHaveAttribute('aria-valuenow', '50')
  await expect(page.getByTestId('follow-last')).toContainText('CC 74 = 127')
  await expect(page.getByTestId('follow-applied')).toHaveText('1 applied')

  // It is an edit like any other: one change against the loaded file, and
  // nothing has been written anywhere.
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // A CC the map does not cover is reported and changes nothing.
  await page.evaluate(() =>
    (globalThis as unknown as { __midi: EventTarget }).__midi.dispatchEvent(
      Object.assign(new Event('midimessage'), { data: new Uint8Array([0xb0, 1, 64]) }),
    ),
  )
  await expect(page.getByTestId('follow-last')).toContainText('unmapped')
  await expect(page.getByTestId('change-count')).toHaveText('1')

  // The envelope tabs follow the instrument: a CC for envelope 3 selects it,
  // so a mirrored move is never made on a tab you cannot see.
  await expect(page.locator('[data-param="attack"]').first()).toHaveAttribute('aria-valuenow', '0')
  await page.evaluate(() =>
    (globalThis as unknown as { __midi: EventTarget }).__midi.dispatchEvent(
      Object.assign(new Event('midimessage'), { data: new Uint8Array([0xb0, 106, 127]) }), // env 3 attack
    ),
  )
  await expect(page.locator('[data-follow-cc="106"] [data-param="attack"]')).toHaveAttribute('aria-valuenow', '50')

  // Sending is off until asked for: moving a control here changes nothing on
  // the wire until Send is on.
  const sent = () => page.evaluate(() => (globalThis as unknown as { __sent: number[][] }).__sent)
  await lpf.focus()
  await page.keyboard.press('ArrowDown')
  await expect(lpf).toHaveAttribute('aria-valuenow', '49')
  expect(await sent()).toEqual([])

  await page.getByTestId('follow-send').click()
  await page.getByTestId('follow-send-channel').selectOption('3')
  await lpf.focus()
  await page.keyboard.press('ArrowDown')
  await expect(lpf).toHaveAttribute('aria-valuenow', '48')
  // CC 74 on channel 3, at the knob position the instrument would report.
  await expect.poll(sent).toEqual([[0xb2, 74, 123]])
  await expect(page.getByTestId('follow-sent')).toHaveText('1 sent')

  // Leaving the mode gives the whole editor back, with the mirrored edit intact.
  await page.getByTestId('follow-button').click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await expect(page.locator('[data-param="lpfFrequency"]').first()).toHaveAttribute('aria-valuenow', '48')
})
