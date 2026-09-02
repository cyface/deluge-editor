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

  // The header is controls only now. What the mode is doing, and which port it
  // found, is behind the help button at a size worth reading.
  await page.getByTestId('follow-help-button').click()
  await expect(page.getByTestId('follow-help')).toContainText('Deluge Port 3')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('follow-help')).toHaveCount(0)

  // The subset: the full editor's twelve blocks give way to the follow view,
  // whose knobs are exactly the parameters the c1.3.0 CC map covers — 80 of
  // them, less the envelope and LFO ones the tabs show four and one at a time,
  // and less the four Mod FX knobs this preset's `modFXType="none"` hides.
  await expect(page.getByTestId('overview')).toHaveCount(0)
  await expect(page.locator('[data-follow-cc]')).toHaveCount(80 - 20 + 5 - 4)
  await expect(page.locator('[data-follow-cc="74"] [data-param="lpfFrequency"]')).toBeVisible()
  await expect(page.locator('[data-follow-cc="30"] [data-param="oscBWavetablePosition"]')).toBeVisible()
  /*
   * Mod FX: the knobs follow the firmware's own menu relevance, and the type
   * that gates them is not a follow parameter at all — no CC addresses it — so
   * the panel carries its select. Off, it has no knobs and says why; a flanger
   * reads only rate and feedback; grain reads all four and renames three.
   */
  const modfx = page.getByTestId('follow-modfx-note').locator('xpath=ancestor::*[contains(@class,"panel")][1]')
  await expect(page.getByTestId('follow-modfx-note')).toContainText('Mod FX is off')
  await expect(modfx.locator('[data-follow-cc]')).toHaveCount(0)
  await modfx.locator('select').selectOption('flanger')
  await expect(modfx.locator('[data-follow-cc]')).toHaveCount(2)
  await expect(modfx.locator('[data-param="modFXFeedback"]')).toBeVisible()
  await expect(modfx.locator('[data-param="modFXDepth"]')).toHaveCount(0)
  await modfx.locator('select').selectOption('grainFX')
  await expect(modfx.locator('[data-follow-cc]')).toHaveCount(4)
  await expect(modfx).toContainText('Density')
  await modfx.locator('select').selectOption('none')
  await expect(modfx.locator('[data-follow-cc]')).toHaveCount(0)

  // Every panel whose picture is the control keeps it (issues #35, #36).
  await expect(page.getByTestId('filter-graph')).toBeVisible()
  await expect(page.getByTestId('env-graph')).toBeVisible()
  await expect(page.getByTestId('lfo-graph')).toBeVisible()
  // Default Synth is saw + square, so both oscillators are offered pulse width.
  await expect(page.getByTestId('pulse-graph-1')).toBeVisible()
  await expect(page.getByTestId('pulse-graph-2')).toBeVisible()
  // The oscillator block is sub-grouped by source, each knob labelled by what
  // its heading does not already say: five knobs per oscillator, three per
  // modulator, one for noise.
  await expect(page.getByTestId('follow-osc-a')).toHaveText('Osc A')
  await expect(page.getByTestId('follow-osc-a-knobs').locator('[data-follow-cc]')).toHaveCount(5)
  await expect(page.getByTestId('follow-osc-a-knobs')).toContainText('Pulse Width')
  await expect(page.getByTestId('follow-osc-a-knobs')).not.toContainText('Osc A')
  await expect(page.getByTestId('follow-osc-b-knobs').locator('[data-follow-cc]')).toHaveCount(5)
  await expect(page.getByTestId('follow-osc-mod1-knobs').locator('[data-follow-cc]')).toHaveCount(3)
  await expect(page.getByTestId('follow-osc-mod2-knobs').locator('[data-follow-cc]')).toHaveCount(3)
  await expect(page.getByTestId('follow-osc-noise-knobs').locator('[data-follow-cc]')).toHaveCount(1)

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

  /*
   * Sending is on, but aimed at the channel the instrument was heard on rather
   * than at a guess. The CCs above arrived on channel 1, so that is where a
   * move here goes back out — which is the setting that stays right when the
   * instrument's follow channel is an MPE zone, whose feedback comes from the
   * zone's master channel rather than from a number anyone can read off a menu.
   */
  const sent = () => page.evaluate(() => (globalThis as unknown as { __sent: number[][] }).__sent)
  await expect(page.getByTestId('follow-send-warning')).toContainText('channel 1')
  await lpf.focus()
  await page.keyboard.press('ArrowDown')
  await expect(lpf).toHaveAttribute('aria-valuenow', '49')
  await expect.poll(sent).toEqual([[0xb0, 74, 125]])

  // A number set by hand overrides it.
  await page.getByTestId('follow-send-channel').selectOption('3')
  await lpf.focus()
  await page.keyboard.press('ArrowDown')
  await expect(lpf).toHaveAttribute('aria-valuenow', '48')
  await expect.poll(sent).toEqual([[0xb0, 74, 125], [0xb2, 74, 123]])
  await expect(page.getByTestId('follow-send-warning')).toContainText('channel 3')

  // Switched off, the wire goes quiet again.
  await page.getByTestId('follow-send').click()
  await lpf.focus()
  await page.keyboard.press('ArrowDown')
  await expect(lpf).toHaveAttribute('aria-valuenow', '47')
  await expect.poll(sent).toHaveLength(2)

  // Leaving the mode gives the whole editor back, with the mirrored edit intact.
  await page.getByTestId('follow-button').click()
  await expect(page.getByTestId('overview')).toBeVisible()
  await expect(page.locator('[data-param="lpfFrequency"]').first()).toHaveAttribute('aria-valuenow', '47')
})
