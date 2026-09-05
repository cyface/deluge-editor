/**
 * The Live Edit ops over the client, against the fake Deluge's transcription
 * of `smsysex_live.cpp`: the grant gates the mode, every op answers with the
 * firmware's `why` when it fails, and a subscriber hears the device's own
 * changes as pushes on msgId 0.
 */
import { describe, expect, it } from 'vitest'
import { fixtureText } from '../../../tests/helpers/fixtures'
import { rig } from '../../../tests/helpers/rig'
import { hexToInt } from '../params/hex'
import { flattenXML } from '../xml'
import { NO_REPLY, SysexError } from './client'
import { LiveError, type LivePush } from './live'

const SYNTH = fixtureText('Sine AnalogSaw Patch Cables')
const KIT = fixtureText('Kit Sample Rows')

const liveRig = (opts: Parameters<typeof rig>[0] = {}, clientOpts: Parameters<typeof rig>[1] = {}) => rig({ liveEdit: 'on', ...opts }, clientOpts)

describe('the grant', () => {
  it('advertises the protocol version once a session is negotiated', async () => {
    const { client } = liveRig()
    expect(client.live).toBeNull()
    await client.ping()
    expect(client.live).toBe(1)
  })
  it('carries nothing when the feature is off or absent', async () => {
    for (const liveEdit of ['off', undefined] as const) {
      const { client } = rig({ liveEdit })
      await client.ping()
      expect(client.live, String(liveEdit)).toBeNull()
    }
  })
})

describe('errors', () => {
  it('a firmware without the ops never answers: the plain no-reply error, not a hang', async () => {
    const { client } = rig()
    const err = await client.inst().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SysexError)
    expect((err as SysexError).code).toBe(NO_REPLY)
  })
  it('the toggle off answers every op with why "off"', async () => {
    const { client } = rig({ liveEdit: 'off' })
    const err = await client.inst().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LiveError)
    expect((err as LiveError).why).toBe('off')
    expect((err as LiveError).message).toContain('switched off')
  })
  it('no instrument in the current clip is noInst', async () => {
    const { client } = liveRig()
    expect((await client.inst()).type).toBe('none')
    await expect(client.param({ name: 'lpfFrequency' })).rejects.toMatchObject({ why: 'noInst' })
  })
})

describe('inst and param on a synth', () => {
  it('reports the instrument and reads the file\'s values', async () => {
    const { client, fake } = liveRig()
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    expect(await client.inst()).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS', edited: false, entire: false })
    const flat = flattenXML(SYNTH)
    expect(await client.param({ name: 'lpfFrequency' })).toBe(hexToInt(flat.get('sound/defaultParams@lpfFrequency')!))
    expect(await client.param({ name: 'lpfFrequency', src: 'y' })).toBe(hexToInt('0x19999990'))
  })
  it('writes a value, reads it back, and the instrument is now edited', async () => {
    const { client, fake } = liveRig()
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    expect(await client.param({ name: 'lpfFrequency' }, 0x40000000)).toBe(0x40000000)
    expect(await client.param({ name: 'lpfFrequency' })).toBe(0x40000000)
    expect(await client.param({ name: 'pan' }, -0x20000000)).toBe(-0x20000000)
    expect((await client.inst()).edited).toBe(true)
    expect(fake.requests.at(-2)).toEqual({ param: { name: 'pan', value: -0x20000000 } })
  })
  it('names the firmware does not know, and sources, are refused by word', async () => {
    const { client, fake } = liveRig()
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await expect(client.param({ name: 'noSuchParam' }, 1)).rejects.toMatchObject({ why: 'name' })
    // `volume` is LOCAL_VOLUME, a cable-only destination no attribute holds: refused as a plain param,
    // still a cable destination; the attribute of that name is `volumePostFX`.
    await expect(client.param({ name: 'volume' }, 1)).rejects.toMatchObject({ why: 'name' })
    await expect(client.param({ name: 'volumePostReverbSend' }, 1)).rejects.toMatchObject({ why: 'name' })
    expect(await client.param({ name: 'volumePostFX' }, 0x33333333)).toBe(0x33333333)
    expect(await client.param({ name: 'volume', src: 'velocity' })).toEqual(expect.any(Number))
    await expect(client.param({ name: 'lpfFrequency', src: 'bogus' }, 1)).rejects.toMatchObject({ why: 'src' })
    await expect(client.param({ name: 'lpfFrequency', src: 'lfo2' })).rejects.toMatchObject({ why: 'noParam' })
    await expect(client.select({ drum: 0 })).rejects.toMatchObject({ why: 'noKit' })
  })
})

describe('a kit', () => {
  it('addresses the bus and rows, and the selected row when neither is given', async () => {
    const { client, fake } = liveRig()
    fake.loadInstrument(KIT, 'VelKit', 'KITS')
    expect(await client.inst()).toMatchObject({ type: 'kit', drum: 0, drumKind: 'sound' })
    expect(await client.param({ name: 'volume', bus: true }, 0x22222222)).toBe(0x22222222)
    // a row is a sound: its <defaultParams volume> is volumePostFX, as on a synth
    expect(await client.param({ name: 'volumePostFX', drum: 1 }, 0x11111111)).toBe(0x11111111)
    expect(await client.param({ name: 'volumePostFX', drum: 0 })).not.toBe(0x11111111)
    expect(fake.requests.at(-1)).toEqual({ param: { name: 'volumePostFX', drum: 0 } })
    await client.select({ drum: 1 })
    expect(await client.param({ name: 'volumePostFX' })).toBe(0x11111111)
    await expect(client.param({ name: 'oscAVolume', bus: true }, 0)).rejects.toMatchObject({ why: 'name' })
    await expect(client.param({ name: 'volumePostFX', drum: 50 })).rejects.toMatchObject({ why: 'noDrum' })
    await expect(client.select({ drum: 99 })).rejects.toMatchObject({ why: 'noDrum' })
    expect(await client.select({ entire: true })).toMatchObject({ entire: true, drum: 1 })
  })
})

describe('save and load', () => {
  it('refuses to overwrite unless told, then writes what the device holds and the instrument is clean', async () => {
    const { client, fake } = liveRig()
    fake.putFile('/SYNTHS/Tim.XML', SYNTH)
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await client.param({ name: 'lpfFrequency' }, 0x40000000)
    const err = await client.save().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LiveError)
    expect(err).toMatchObject({ why: 'exists', code: 17 })
    const saved = await client.save({ overwrite: true })
    expect(saved).toMatchObject({ path: '/SYNTHS/Tim.XML', name: 'Tim', edited: false })
    const onCard = String.fromCharCode(...fake.files.get('/SYNTHS/Tim.XML')!)
    expect(flattenXML(onCard).get('sound/defaultParams@lpfFrequency')).toBe('0x40000000')
  })
  it('keep:true writes the file without renaming or cleaning the instrument', async () => {
    const { client, fake } = liveRig()
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await client.param({ name: 'pan' }, 1)
    fake.dirs.add('/TEMP')
    expect(await client.save({ path: '/TEMP/LIVE.XML', overwrite: true, keep: true })).toMatchObject({ name: 'Tim', dir: 'SYNTHS', edited: true })
    expect(fake.files.has('/TEMP/LIVE.XML')).toBe(true)
    expect(await client.save({ path: '/SYNTHS/Tim2.XML' })).toMatchObject({ name: 'Tim2', edited: false })
    await expect(client.save({ path: '/SYNTHS/Tim' })).rejects.toMatchObject({ why: 'path' })
  })
  it('load replaces the instrument, keeping the identity it is given', async () => {
    const { client, fake } = liveRig()
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    fake.putFile('/TEMP/LIVE.XML', KIT)
    await expect(client.load('/TEMP/NOPE.XML', { name: 'Tim', dir: 'SYNTHS' })).rejects.toMatchObject({ why: 'notFound', code: 18 })
    await expect(client.load('TEMPLIVE')).rejects.toMatchObject({ why: 'path' })
    expect(await client.load('/TEMP/LIVE.XML', { name: 'Tim', dir: 'SYNTHS' })).toMatchObject({ type: 'kit', name: 'Tim', dir: 'SYNTHS', edited: true })
    expect(fake.requests.at(-1)).toEqual({ load: { path: '/TEMP/LIVE.XML', name: 'Tim', dir: 'SYNTHS' } })
    expect(await client.load('/TEMP/LIVE.XML')).toMatchObject({ name: 'LIVE', dir: 'TEMP', edited: false })
  })
  it('load is refused while a menu is open on the device', async () => {
    const { client, fake } = liveRig({ liveBusy: true })
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    fake.putFile('/TEMP/LIVE.XML', SYNTH)
    await expect(client.load('/TEMP/LIVE.XML')).rejects.toMatchObject({ why: 'busy' })
  })
})

describe('subscribe', () => {
  it('holds a lease and hears the device\'s changes, edits and switches; release stops them', async () => {
    const pushes: LivePush[] = []
    const { client, fake } = liveRig({}, { onPush: (p) => pushes.push(p) })
    fake.loadInstrument(KIT, 'VelKit', 'KITS')
    expect(await client.subscribe(200)).toMatchObject({ secs: 120, type: 'kit', name: 'VelKit' })
    expect(pushes).toEqual([])

    // our own write is not echoed as a change, but it flips edited, which is an instrument push
    await client.param({ name: 'volume', bus: true }, 5)
    expect(pushes.map((p) => p.kind)).toEqual(['inst'])
    expect(pushes[0]).toMatchObject({ kind: 'inst', inst: { edited: true } })

    fake.deviceChange({ name: 'lpfFrequency', drum: 2, value: -0x40000000 })
    fake.deviceChange({ name: 'volume', bus: true, value: 7 })
    fake.deviceChange({ name: 'lpfFrequency', src: 'lfo1', drum: 0, value: 9 })
    expect(pushes.slice(1)).toEqual([
      { kind: 'chg', gen: expect.any(Number), changes: [{ name: 'lpfFrequency', drum: 2, value: -0x40000000 }] },
      { kind: 'chg', gen: expect.any(Number), changes: [{ name: 'volume', bus: true, value: 7 }] },
      { kind: 'chg', gen: expect.any(Number), changes: [{ name: 'lpfFrequency', src: 'lfo1', drum: 0, value: 9 }] },
    ])
    expect(await client.param({ name: 'lpfFrequency', drum: 2 })).toBe(-0x40000000)

    fake.deviceEdit()
    expect(pushes.at(-1)).toMatchObject({ kind: 'dirty' })
    await client.select({ drum: 1 })
    expect(pushes.at(-1)).toMatchObject({ kind: 'inst', inst: { drum: 1 } })
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    expect(pushes.at(-1)).toMatchObject({ kind: 'inst', inst: { type: 'synth', name: 'Tim' } })

    const n = pushes.length
    expect(await client.subscribe(0)).toMatchObject({ secs: 0 })
    fake.deviceChange({ name: 'pan', value: 1 })
    fake.deviceEdit()
    expect(pushes.length).toBe(n)
  })
  it('a lapsed lease is silent until renewed', async () => {
    const pushes: LivePush[] = []
    const { client, fake } = liveRig({}, { onPush: (p) => pushes.push(p) })
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    await client.subscribe(10)
    fake.expireLease()
    fake.deviceChange({ name: 'pan', value: 1 })
    expect(pushes).toEqual([])
    await client.subscribe(10)
    fake.deviceChange({ name: 'pan', value: 2 })
    expect(pushes).toEqual([{ kind: 'chg', gen: expect.any(Number), changes: [{ name: 'pan', value: 2 }] }])
  })
})
