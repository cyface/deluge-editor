import { describe, expect, it } from 'vitest'
import { CardError } from './fs'
import { locateSamples, type ListDir } from './locate'

/** A card as a list of file paths; folders are implied by them. */
function card(files: string[]): { list: ListDir; listed: string[] } {
  const listed: string[] = []
  const list: ListDir = async (dir) => {
    listed.push(dir)
    const lower = `${dir.toLowerCase()}/`
    const under = files.filter((f) => f.toLowerCase().startsWith(lower))
    if (under.length === 0) throw new CardError('notFound', `${dir} not found`)
    const out = new Map<string, boolean>()
    for (const f of under) {
      const rest = f.slice(lower.length).split('/')
      out.set(rest[0], rest.length > 1)
    }
    return [...out].map(([name, isDir]) => ({ name, dir: isDir }))
  }
  return { list, listed }
}

describe('locateSamples', () => {
  it('finds a file one folder deeper than the preset says, case-insensitively', async () => {
    const { list } = card(['/SAMPLES/CP/DM/DM/Kick.wav', '/SAMPLES/CP/DM/DM/Open hihat.wav', '/SAMPLES/Other/open hihat.wav'])
    const { found, truncated } = await locateSamples(list, ['/SAMPLES/CP/DM/Open Hihat.wav'])
    expect(truncated).toBe(false)
    expect(found.get('/SAMPLES/CP/DM/Open Hihat.wav')).toEqual(['/SAMPLES/CP/DM/DM/Open hihat.wav'])
  })

  it('widens to the parent folders, nearest first, up to SAMPLES/', async () => {
    const { list } = card(['/SAMPLES/Elsewhere/snare.wav', '/SAMPLES/Kit/A/kick.wav'])
    const { found } = await locateSamples(list, ['/SAMPLES/Kit/B/snare.wav'])
    expect(found.get('/SAMPLES/Kit/B/snare.wav')).toEqual(['/SAMPLES/Elsewhere/snare.wav'])
  })

  it('leaves out what is nowhere, and lists each folder at most once', async () => {
    const { list, listed } = card(['/SAMPLES/Kit/kick.wav', '/SAMPLES/Kit/Sub/hat.wav'])
    const { found } = await locateSamples(list, ['/SAMPLES/Kit/clap.wav', '/SAMPLES/Kit/rim.wav'])
    expect(found.size).toBe(0)
    expect(listed.length).toBe(new Set(listed.map((d) => d.toLowerCase())).size)
  })

  it('stops at the folder budget and says so', async () => {
    const files = Array.from({ length: 20 }, (_, i) => `/SAMPLES/F${i}/x.wav`)
    const { list, listed } = card(files)
    const { found, truncated } = await locateSamples(list, ['/SAMPLES/Kit/kick.wav'], { maxFolders: 5 })
    expect(found.size).toBe(0)
    expect(truncated).toBe(true)
    expect(listed.length).toBe(5)
  })

  it('rethrows a listing failure that is not "no such folder"', async () => {
    const list: ListDir = async () => {
      throw new Error('timed out')
    }
    await expect(locateSamples(list, ['/SAMPLES/Kit/kick.wav'])).rejects.toThrow('timed out')
  })
})
