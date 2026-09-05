/**
 * Live Edit's rules (`docs/live-edit.md`, "Editor work list"): entering opens
 * what the device holds with the card's copy as `source`; a knob move goes
 * out as a `param` and a structural edit as one debounced push; the device's
 * own moves land in the tree and are not sent back; our echoes are filtered;
 * `^dirty` pulls; `^inst` re-opens or selects the row; the lease is renewed
 * and released; Save is the device's own write, read back. All against the
 * fake Deluge, through a real client.
 */
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureText } from '../../../tests/helpers/fixtures'
import { rig, TEST_TIMEOUTS } from '../../../tests/helpers/rig'
import { LIVE_TEMP_PATH } from '../../core/live'
import { isKit } from '../../core/preset'
import { setParamHex } from '../../core/preset/sound'
import { FakeDeluge, type FakeOptions } from '../../core/sysex/fake-deluge'
import { SmsClient } from '../../core/sysex'
import { flattenXML, setAttr } from '../../core/xml'
import { card } from './card.svelte'
import { editor, FALLBACK_FIRMWARE } from './editor.svelte'
import { LEASE_SECS, live, NO_LIVE_EDIT, RENEW_MS } from './live.svelte'

const SYNTH = fixtureText('community-c1.3.0-beta-3f898e9/Default Synth.XML')
const KIT = fixtureText('community-c1.3.0-beta-3f898e9/Kit Sample Rows.XML')
/** The card's copy of the synth, differing from what the device holds by one attribute. */
const SYNTH_ON_CARD = SYNTH.replace('polyphonic="poly"', 'polyphonic="mono"')

const LPF = 'sound/defaultParams@lpfFrequency'

/** A client wired to a fake whose pushes reach the store, as the card store wires the real one. */
function liveRig(fakeOpts: FakeOptions = { liveEdit: 'on' }): { client: SmsClient; fake: FakeDeluge } {
  const { client, fake } = rig(fakeOpts, { onPush: (push) => live.receive(push) })
  live.attachTo(client)
  return { client, fake }
}

/** Enter the mode on a fake holding the synth, with the card copy in place. */
async function enterSynth(): Promise<{ client: SmsClient; fake: FakeDeluge }> {
  const r = liveRig()
  r.fake.putFile('/SYNTHS/Tim.XML', SYNTH_ON_CARD)
  r.fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
  await live.start()
  expect(live.status).toBe('live')
  return r
}

const requests = (fake: FakeDeluge, op: string) => fake.requests.filter((r) => op in r)
/** The paths every `save` so far was asked for: `/TEMP/LIVE.XML` for a pull, a preset path for a save. */
const savePaths = (fake: FakeDeluge) => requests(fake, 'save').map((r) => (r.save as { path?: string }).path)

/** Let the effect see the tree change and the store finish everything it queued. */
async function settle(): Promise<void> {
  flushSync()
  await live.idle()
}

beforeEach(() => {
  editor.preset = null
  editor.source = null
  editor.cardPath = null
  editor.firmware = FALLBACK_FIRMWARE
  editor.deviceFirmware = null
  editor.row = 0
})

afterEach(async () => {
  vi.useRealTimers()
  await live.stop()
  live.attachTo(null)
})

describe('entering', () => {
  it('opens the device’s instrument with the card copy as source, and subscribes', async () => {
    const { fake } = await enterSynth()
    expect(live.on).toBe(true)
    expect(fake.subscribed).toBe(true)
    expect(live.lease).toBe(LEASE_SECS)
    expect(live.inst).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS' })
    expect(editor.fileName).toBe('Tim.XML')
    expect(editor.cardPath).toBe('/SYNTHS/Tim.XML')
    expect(editor.output).toBe(SYNTH)
    expect(editor.source).toBe(SYNTH_ON_CARD)
    // the diff is what Save would change: the device holds poly, the card mono
    expect(editor.diff?.changed.map((c) => c.path)).toEqual(['sound@polyphonic'])
    expect(requests(fake, 'save')).toEqual([{ save: { path: LIVE_TEMP_PATH, overwrite: 1, keep: 1 } }])
  })

  it('has no source when the device’s preset was never saved to the card', async () => {
    const { fake } = liveRig()
    fake.loadInstrument(SYNTH, 'New', 'SYNTHS')
    await live.start()
    expect(live.status).toBe('live')
    expect(editor.output).toBe(SYNTH)
    expect(editor.source).toBe(null)
    expect(editor.cardPath).toBe('/SYNTHS/New.XML')
  })

  it('selects the kit’s selected row', async () => {
    const { fake, client } = liveRig()
    fake.loadInstrument(KIT, 'Drums', 'KITS')
    await client.select({ drum: 2 })
    await live.start()
    expect(editor.preset && isKit(editor.preset)).toBe(true)
    expect(editor.row).toBe(2)
  })

  it('refuses a firmware whose grant does not offer Live Edit, and leaves', async () => {
    liveRig({}) // no live ops at all
    await live.start()
    expect(live.on).toBe(false)
    expect(live.status).toBe('off')
    expect(live.error).toBe(NO_LIVE_EDIT)
    expect(editor.preset).toBe(null)
  })

  it('waits when the device’s clip is not a synth or kit', async () => {
    const { fake } = liveRig()
    editor.load(SYNTH_ON_CARD, 'Mine.XML')
    await live.start()
    expect(live.status).toBe('waiting')
    expect(fake.subscribed).toBe(true)
    expect(editor.fileName).toBe('Mine.XML') // the editor keeps what it had
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await live.idle()
    expect(live.status).toBe('live')
    expect(editor.fileName).toBe('Tim.XML')
  })
})

describe('editor → device', () => {
  it('sends a knob move as one param, and nothing else', async () => {
    const { fake, client } = await enterSynth()
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    await settle()
    expect(requests(fake, 'param')).toEqual([{ param: { name: 'lpfFrequency', value: 0x40000000 } }])
    expect(await client.param({ name: 'lpfFrequency' })).toBe(0x40000000)
    expect(requests(fake, 'load')).toEqual([])
    expect(live.sent).toBe(1)
  })

  it('coalesces a drag to the latest value per path', async () => {
    const { fake, client } = await enterSynth()
    for (const hex of ['0x20000000', '0x30000000', '0x38000000', '0x40000000'] as const) {
      setParamHex(editor.sound!, 'lpfFrequency', hex)
      flushSync()
    }
    await live.idle()
    const sent = requests(fake, 'param')
    expect(sent.length).toBeLessThan(4)
    expect(sent.at(-1)).toEqual({ param: { name: 'lpfFrequency', value: 0x40000000 } })
    expect(await client.param({ name: 'lpfFrequency' })).toBe(0x40000000)
  })

  it('addresses a kit row by drum index and the bus by name', async () => {
    const { fake } = liveRig()
    fake.loadInstrument(KIT, 'Drums', 'KITS')
    await live.start()
    editor.row = 1
    flushSync()
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    await settle()
    expect(requests(fake, 'param')).toEqual([{ param: { name: 'lpfFrequency', drum: 1, value: 0x40000000 } }])
    // <defaultParams volume> on the kit bus is `volume` on the wire, not `volumePostFX`
    setAttr(editor.preset!.children.find((c) => c.tag === 'defaultParams')!, 'volume', '0x3F000000')
    await settle()
    expect(requests(fake, 'param').at(-1)).toEqual({ param: { name: 'volume', bus: 1, value: 0x3f000000 } })
  })

  it('pushes the whole document for an edit no param carries, once for a burst', async () => {
    const { fake } = await enterSynth()
    setAttr(editor.preset!, 'polyphonic', 'mono')
    flushSync()
    setAttr(editor.preset!, 'voicePriority', '2')
    await settle()
    expect(requests(fake, 'load')).toEqual([{ load: { path: LIVE_TEMP_PATH, name: 'Tim', dir: 'SYNTHS' } }])
    expect(live.pushed).toBe(1)
    const device = flattenXML(fake.currentPreset())
    expect(device.get('sound@polyphonic')).toBe('mono')
    expect(device.get('sound@voicePriority')).toBe('2')
    expect(fake.live).toMatchObject({ name: 'Tim', dir: 'SYNTHS', edited: true })
    // the pushed document is the new baseline: nothing more goes out
    await settle()
    expect(requests(fake, 'load')).toHaveLength(1)
  })

  it('a knob turned while a push is pending rides along and is not lost', async () => {
    const { fake, client } = await enterSynth()
    setAttr(editor.preset!, 'polyphonic', 'mono')
    flushSync()
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    await settle()
    expect(requests(fake, 'load')).toHaveLength(1)
    expect(await client.param({ name: 'lpfFrequency' })).toBe(0x40000000)
    expect(flattenXML(fake.currentPreset()).get('sound@polyphonic')).toBe('mono')
  })

  it('retries a push the device refused, keeping the edit', async () => {
    vi.useFakeTimers()
    const { fake } = liveRig({ liveEdit: 'on', liveBusy: true })
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await live.start()
    setAttr(editor.preset!, 'polyphonic', 'mono')
    flushSync()
    await vi.advanceTimersByTimeAsync(200)
    expect(requests(fake, 'load')).toHaveLength(1)
    expect(live.error).toBe('Load: the Deluge has a menu or browser open')
    expect(editor.flatOutput!.get('sound@polyphonic')).toBe('mono')
    await vi.advanceTimersByTimeAsync(2100)
    expect(requests(fake, 'load')).toHaveLength(2)
  })
})

describe('device → editor', () => {
  it('applies a device move to the tree and does not send it back', async () => {
    const { fake } = await enterSynth()
    fake.deviceChange({ name: 'lpfFrequency', value: 0x12345678 })
    expect(editor.flatOutput!.get(LPF)).toBe('0x12345678')
    expect(live.received).toBe(1)
    await settle()
    expect(requests(fake, 'param')).toEqual([])
  })

  it('places a kit row’s move on that row', async () => {
    const { fake } = liveRig()
    fake.loadInstrument(KIT, 'Drums', 'KITS')
    await live.start()
    fake.deviceChange({ name: 'lpfFrequency', drum: 1, value: 0x12345678 })
    expect(editor.flatOutput!.get('kit/soundSources/sound[1]/defaultParams@lpfFrequency')).toBe('0x12345678')
    await settle()
    expect(requests(fake, 'param')).toEqual([])
  })

  it('drops the echo of its own write, even a late one behind a newer move', async () => {
    const { fake } = await enterSynth()
    setParamHex(editor.sound!, 'lpfFrequency', '0x30000000')
    await settle()
    setParamHex(editor.sound!, 'lpfFrequency', '0x20000000')
    await settle()
    expect(live.sent).toBe(2)
    // the device reporting our first value back is not the device moving back to it
    fake.deviceChange({ name: 'lpfFrequency', value: 0x30000000 })
    expect(editor.flatOutput!.get(LPF)).toBe('0x20000000')
    expect(live.received).toBe(0)
  })

  it('takes a device move over a pending move of its own', async () => {
    const { fake } = await enterSynth()
    // a structural edit holds the fast sends; the device moves the same knob meanwhile
    setAttr(editor.preset!, 'polyphonic', 'mono')
    setParamHex(editor.sound!, 'lpfFrequency', '0x30000000')
    flushSync()
    fake.deviceChange({ name: 'lpfFrequency', value: 0x0abcdef0 })
    expect(editor.flatOutput!.get(LPF)).toBe('0x0ABCDEF0')
    await live.idle()
    expect(requests(fake, 'param')).toEqual([])
    expect(flattenXML(fake.currentPreset()).get(LPF)).toBe('0x0ABCDEF0')
  })

  it('pulls on ^dirty and adopts what the device holds', async () => {
    const { fake } = await enterSynth()
    fake.live.preset = SYNTH.replace('polyphonic="poly"', 'polyphonic="legato"')
    fake.deviceEdit()
    await live.idle()
    expect(editor.flatOutput!.get('sound@polyphonic')).toBe('legato')
    expect(live.resynced).toBe(1)
    // adopted, not edited: nothing is pushed back
    await settle()
    expect(requests(fake, 'load')).toEqual([])
    expect(requests(fake, 'save')).toHaveLength(2)
  })

  it('ignores a ^dirty at or below the generation it last exchanged', async () => {
    const { fake } = await enterSynth()
    live.receive({ kind: 'dirty', gen: 0 })
    await live.idle()
    expect(requests(fake, 'save')).toHaveLength(1)
  })

  it('re-opens when the device switches preset, and follows its row pick', async () => {
    const { fake, client } = await enterSynth()
    fake.loadInstrument(KIT, 'Drums', 'KITS')
    await live.idle()
    expect(editor.fileName).toBe('Drums.XML')
    expect(editor.cardPath).toBe('/KITS/Drums.XML')
    expect(editor.preset && isKit(editor.preset)).toBe(true)
    await client.select({ drum: 3 })
    expect(editor.row).toBe(3)
  })

  it('reads the file back as source when the device saves itself, and not for its own save', async () => {
    const { fake } = await enterSynth()
    expect(editor.changeCount).toBe(1) // the card copy differs from what the device holds
    fake.deviceChange({ name: 'lpfFrequency', value: 0x40000000 })
    await live.idle()
    expect(live.inst?.edited).toBe(true)
    fake.deviceSave()
    await live.idle()
    expect(live.inst?.edited).toBe(false)
    expect(editor.source).toBe(new TextDecoder().decode(fake.files.get('/SYNTHS/Tim.XML')))
    expect(flattenXML(editor.source!).get(LPF)).toBe('0x40000000')
    expect(editor.identical).toBe(true)
    // The store's own save reads the file back itself; the transition is not read twice.
    setParamHex(editor.sound!, 'lpfFrequency', '0x30000000')
    await settle()
    const reads = fake.requests.filter((r) => 'open' in r).length
    await live.save({ overwrite: true })
    await live.idle()
    expect(fake.requests.filter((r) => 'open' in r).length).toBe(reads + 1)
    expect(editor.identical).toBe(true)
  })

  it('parks when the clip stops being a synth or kit, and keeps the editor’s document', async () => {
    const { fake } = await enterSynth()
    live.receive({ kind: 'inst', inst: { type: 'midi', gen: 9 } })
    expect(live.status).toBe('waiting')
    expect(editor.fileName).toBe('Tim.XML')
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    await settle()
    expect(requests(fake, 'param')).toEqual([])
  })
})

describe('the row', () => {
  /** Enter on a kit whose device-side row is 1. */
  async function enterKit(): Promise<{ client: SmsClient; fake: FakeDeluge }> {
    const r = liveRig()
    r.fake.putFile('/KITS/Drums.XML', KIT)
    r.fake.loadInstrument(KIT, 'Drums', 'KITS')
    await r.client.select({ drum: 1 })
    await live.start()
    expect(editor.row).toBe(1)
    return r
  }

  it('selects the row on the device when the editor picks one, latest pick only', async () => {
    const { fake, client } = await enterKit()
    expect(requests(fake, 'select').filter((r) => (r.select as { drum?: number }).drum !== 1)).toEqual([])
    editor.row = 2
    flushSync()
    editor.row = 3
    await settle()
    const sent = requests(fake, 'select').map((r) => (r.select as { drum: number }).drum)
    expect(sent.at(-1)).toBe(3) // 2 may have gone first, but 3 supersedes it and nothing follows
    expect(sent.length).toBeLessThanOrEqual(3) // the test's own select of 1, then at most 2 and 3
    expect((await client.inst()).drum).toBe(3)
    expect(editor.row).toBe(3) // the device's report of the pick is not a pick back
  })

  it('does not take the device’s row report while its own pick is on its way', async () => {
    const { fake } = await enterKit()
    editor.row = 2
    live.selectRow(2) // what the effect does, a microtask later
    live.receive({ kind: 'inst', inst: { type: 'kit', name: 'Drums', dir: 'KITS', drum: 1, gen: 1 } })
    expect(editor.row).toBe(2)
    await settle()
    expect((requests(fake, 'select').at(-1)!.select as { drum: number }).drum).toBe(2)
  })

  it('re-asserts the editor’s row after a push, which lands the device on its first row', async () => {
    const { fake, client } = await enterKit()
    editor.row = 2
    await settle()
    setAttr(editor.preset!, 'lpfMode', 'SVF_Band') // a structural edit: the whole kit goes
    await settle()
    expect(requests(fake, 'load')).toHaveLength(1)
    expect(editor.row).toBe(2)
    expect((await client.inst()).drum).toBe(2)
  })

  it('does not select on a synth, nor a row the kit does not have', async () => {
    const { fake } = await enterSynth()
    editor.row = 3
    await settle()
    expect(requests(fake, 'select')).toEqual([])
  })
})

describe('saving', () => {
  it('saves over its own file through the device, reads it back, and the editor is clean', async () => {
    const { fake, client } = await enterSynth()
    expect(editor.changeCount).toBe(1) // the card copy differs from what the device holds
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    await settle()
    const r = await live.save({ overwrite: true })
    expect(r).toEqual({ path: '/SYNTHS/Tim.XML', differences: 0 })
    expect(requests(fake, 'save').at(-1)).toEqual({ save: { path: '/SYNTHS/Tim.XML', overwrite: 1, keep: 0 } })
    const onCard = new TextDecoder().decode(fake.files.get('/SYNTHS/Tim.XML'))
    expect(flattenXML(onCard).get(LPF)).toBe('0x40000000')
    expect(editor.source).toBe(onCard)
    expect(editor.identical).toBe(true)
    expect(editor.cardPath).toBe('/SYNTHS/Tim.XML')
    expect(live.inst).toMatchObject({ name: 'Tim', dir: 'SYNTHS', edited: false })
    expect((await client.inst()).edited).toBe(false)
  })

  it('sends what is still on its way before the device writes', async () => {
    const { fake } = await enterSynth()
    setAttr(editor.preset!, 'polyphonic', 'mono') // a push, debounced and not yet gone
    flushSync()
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000') // held behind it
    flushSync()
    expect(requests(fake, 'load')).toEqual([])
    await live.save({ overwrite: true })
    const ops = fake.requests.map((r) => Object.keys(r)[0])
    expect(ops.indexOf('load')).toBeGreaterThan(-1)
    expect(ops.lastIndexOf('save')).toBeGreaterThan(ops.indexOf('load'))
    const onCard = flattenXML(new TextDecoder().decode(fake.files.get('/SYNTHS/Tim.XML')))
    expect(onCard.get('sound@polyphonic')).toBe('mono')
    expect(onCard.get(LPF)).toBe('0x40000000')
    expect(editor.changeCount).toBe(0)
  })

  it('leaves a file the device already has alone unless told to overwrite', async () => {
    const { fake } = await enterSynth()
    expect(await live.save()).toBe('exists')
    expect(new TextDecoder().decode(fake.files.get('/SYNTHS/Tim.XML'))).toBe(SYNTH_ON_CARD)
    expect(editor.source).toBe(SYNTH_ON_CARD)
    expect(live.inst).toMatchObject({ edited: false }) // the fake's fresh load; the exists answer changed nothing
    const r = await live.save({ overwrite: true })
    expect(r).toEqual({ path: '/SYNTHS/Tim.XML', differences: 0 })
    expect(new TextDecoder().decode(fake.files.get('/SYNTHS/Tim.XML'))).toBe(SYNTH)
  })

  it('a save to another path renames the device’s instrument, and the store follows without re-opening', async () => {
    const { fake, client } = await enterSynth()
    const pulls = savePaths(fake).length
    const r = await live.save({ path: '/SYNTHS/Copy.XML' })
    expect(r).toEqual({ path: '/SYNTHS/Copy.XML', differences: 0 })
    expect(await client.inst()).toMatchObject({ name: 'Copy', dir: 'SYNTHS', edited: false })
    expect(live.inst).toMatchObject({ name: 'Copy', dir: 'SYNTHS' })
    expect(editor.fileName).toBe('Copy.XML')
    expect(editor.cardPath).toBe('/SYNTHS/Copy.XML')
    expect(new TextDecoder().decode(fake.files.get('/SYNTHS/Tim.XML'))).toBe(SYNTH_ON_CARD) // untouched
    // the device's ^inst with the new name is our own save, not a switch: no pull
    await settle()
    expect(savePaths(fake).filter((p) => p === LIVE_TEMP_PATH)).toHaveLength(pulls)
    expect(live.status).toBe('live')
    // and edits keep flowing to the renamed instrument
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    await settle()
    expect(await client.param({ name: 'lpfFrequency' })).toBe(0x40000000)
  })

  it('counts where the file the device wrote disagrees with the document, and shows it', async () => {
    const { fake } = liveRig({ liveEdit: 'on', saveWrites: (xml) => xml.replace('polyphonic="poly"', 'polyphonic="mono"') })
    fake.putFile('/SYNTHS/Tim.XML', SYNTH)
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await live.start()
    expect(editor.changeCount).toBe(0)
    const r = await live.save({ overwrite: true })
    expect(r).toEqual({ path: '/SYNTHS/Tim.XML', differences: 1 })
    // the source is the file as written, so the Changes dock shows the disagreement
    expect(editor.diff?.changed.map((c) => c.path)).toEqual(['sound@polyphonic'])
    expect(editor.cardPath).toBe('/SYNTHS/Tim.XML')
  })

  it('refuses when the device will not take the latest edit, and keeps it', async () => {
    const { fake } = liveRig({ liveEdit: 'on', liveBusy: true })
    fake.putFile('/SYNTHS/Tim.XML', SYNTH)
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await live.start()
    setAttr(editor.preset!, 'polyphonic', 'mono')
    flushSync()
    await expect(live.save({ overwrite: true })).rejects.toThrow('The Deluge has not taken the latest edit: Load: the Deluge has a menu or browser open')
    expect(fake.files.get('/SYNTHS/Tim.XML')).toEqual(new TextEncoder().encode(SYNTH)) // no save went out
    expect(savePaths(fake).filter((p) => p !== LIVE_TEMP_PATH)).toEqual([])
    expect(editor.flatOutput!.get('sound@polyphonic')).toBe('mono')
    await live.stop() // before the retry timer fires into a stopped store
  })

  it('hands the card store its saves while on, and takes them back on leaving', async () => {
    await enterSynth()
    expect(card.liveSave).not.toBeNull()
    expect(await card.liveSave!('/SYNTHS/Tim.XML', true)).toEqual({ path: '/SYNTHS/Tim.XML', differences: 0 })
    await live.stop()
    expect(card.liveSave).toBeNull()
  })

  it('is refused while nothing is held', async () => {
    liveRig()
    editor.load(SYNTH, 'Mine.XML')
    await live.start()
    expect(live.status).toBe('waiting')
    await expect(live.save()).rejects.toThrow('not holding a preset')
  })
})

describe('the lease', () => {
  it('renews on its interval', async () => {
    vi.useFakeTimers()
    const { fake } = liveRig()
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await live.start()
    expect(requests(fake, 'sub')).toEqual([{ sub: { secs: LEASE_SECS } }])
    fake.expireLease()
    await vi.advanceTimersByTimeAsync(RENEW_MS)
    expect(requests(fake, 'sub')).toHaveLength(2)
    expect(fake.subscribed).toBe(true)
    await vi.advanceTimersByTimeAsync(RENEW_MS * 2)
    expect(requests(fake, 'sub')).toHaveLength(4)
  })

  it('reports a renewal that failed and recovers on the next', async () => {
    const { client } = await enterSynth()
    const spy = vi.spyOn(client, 'subscribe').mockRejectedValueOnce(new Error('no answer'))
    await live.renew()
    expect(live.status).toBe('error')
    expect(live.linkError).toBe('Could not renew the Deluge’s lease: No answer')
    expect(live.lease).toBe(0)
    spy.mockRestore()
    await live.renew()
    expect(live.status).toBe('live')
    expect(live.linkError).toBe(null)
    expect(live.lease).toBe(LEASE_SECS)
  })

  it('releases the lease on leaving, and the editor keeps the preset', async () => {
    const { fake } = await enterSynth()
    await live.stop()
    expect(live.on).toBe(false)
    expect(fake.subscribed).toBe(false)
    expect(requests(fake, 'sub').at(-1)).toEqual({ sub: { secs: 0 } })
    expect(editor.fileName).toBe('Tim.XML')
    expect(editor.cardPath).toBe('/SYNTHS/Tim.XML')
    // and nothing goes out any more
    setParamHex(editor.sound!, 'lpfFrequency', '0x40000000')
    flushSync()
    await new Promise((r) => setTimeout(r, TEST_TIMEOUTS[0]))
    expect(requests(fake, 'param')).toEqual([])
  })
})

describe('the top bar', () => {
  afterEach(() => {
    card.status = 'idle'
    card.liveVersion = null
  })

  it('offers the button for a firmware with the ops, and with nothing loaded', () => {
    expect(live.offered).toBe(true) // nothing loaded: the mode brings the device's preset
    editor.load(SYNTH, 'Tim.XML')
    expect(editor.firmware).toBe('c1.3.0')
    expect(live.offered).toBe(true)
    editor.firmware = FALLBACK_FIRMWARE // an official build: no smSysex at all, let alone the ops
    expect(live.offered).toBe(false)
    editor.preset = null
    expect(live.offered).toBe(true)
  })

  it('refuses only once a connected Deluge has answered without live in its grant', () => {
    expect(live.refused).toBe(false) // not connected: nothing is known yet, the button connects
    card.status = 'connected'
    expect(live.refused).toBe(true)
    card.liveVersion = 1
    expect(live.refused).toBe(false)
    expect(live.available).toBe(true)
  })
})
