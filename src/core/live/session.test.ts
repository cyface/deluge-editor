/**
 * Pull and push through `/TEMP/LIVE.XML`: a pull is the bytes the device
 * would save, a push replaces the device's instrument under its own name,
 * and the temp folder is created once and tolerated when already there.
 */
import { describe, expect, it } from 'vitest'
import { fixtureText, parseSound } from '../../../tests/helpers/fixtures'
import { rig } from '../../../tests/helpers/rig'
import { flattenXML, generateXML } from '../xml'
import { applyChange } from './apply'
import { LIVE_TEMP_PATH, LiveTransfer, presetIdentity } from './session'

const SYNTH = fixtureText('Sine AnalogSaw Patch Cables')

describe('LiveTransfer', () => {
  it('pulls the exact bytes the device would save, and creates /TEMP once', async () => {
    const { client, fake } = rig({ liveEdit: 'on' })
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    const live = new LiveTransfer(client)
    const first = await live.pull()
    expect(first.xml).toBe(SYNTH)
    expect(first.inst).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS', edited: false })
    await client.param({ name: 'lpfFrequency' }, 0x40000000)
    const second = await live.pull()
    expect(flattenXML(second.xml).get('sound/defaultParams@lpfFrequency')).toBe('0x40000000')
    expect(second.inst.edited).toBe(true)
    expect(fake.requests.filter((r) => 'mkdir' in r)).toEqual([{ mkdir: { path: '/TEMP' } }])
    expect(fake.requests.filter((r) => 'save' in r)).toEqual([
      { save: { path: LIVE_TEMP_PATH, overwrite: 1, keep: 1 } },
      { save: { path: LIVE_TEMP_PATH, overwrite: 1, keep: 1 } },
    ])
    // the instrument still saves over its own file, not TEMP
    expect(await client.inst()).toMatchObject({ name: 'Tim', dir: 'SYNTHS' })
  })
  it('tolerates a /TEMP that is already there', async () => {
    const { client, fake } = rig({ liveEdit: 'on' })
    fake.dirs.add('/TEMP')
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    expect((await new LiveTransfer(client).pull()).xml).toBe(SYNTH)
  })
  it('pushes an edited preset and the device reloads it under its own identity', async () => {
    const { client, fake } = rig({ liveEdit: 'on' })
    fake.loadInstrument(SYNTH, 'Tim', 'SYNTHS')
    const tree = parseSound(SYNTH)
    tree.attrs.polyphonic = 'mono' // a structural edit: no param op carries it
    applyChange(tree, { name: 'pan', value: 0x10000000 })
    const xml = generateXML(tree)
    const inst = await new LiveTransfer(client).push(xml, { name: 'Tim', dir: 'SYNTHS' })
    expect(inst).toMatchObject({ type: 'synth', name: 'Tim', dir: 'SYNTHS', edited: true })
    expect(fake.live.preset).toBe(xml)
    expect(await client.param({ name: 'pan' })).toBe(0x10000000)
    expect(fake.requests.at(-2)).toEqual({ load: { path: LIVE_TEMP_PATH, name: 'Tim', dir: 'SYNTHS' } })
  })
})

describe('presetIdentity', () => {
  it('is the name and folder the device gives an instrument saved to the path', () => {
    expect(presetIdentity('/SYNTHS/Foo.XML')).toEqual({ name: 'Foo', dir: 'SYNTHS' })
    expect(presetIdentity('/KITS/Sub/Drums.xml')).toEqual({ name: 'Drums', dir: 'KITS/Sub' })
  })

  it('is null for what the device refuses as a path: no folder, or no .XML', () => {
    expect(presetIdentity('/Foo.XML')).toBeNull()
    expect(presetIdentity('SYNTHS/Foo.XML')).toBeNull()
    expect(presetIdentity('/SYNTHS/Foo')).toBeNull()
  })
})
