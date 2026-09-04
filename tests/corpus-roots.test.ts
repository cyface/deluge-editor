/**
 * The root-note cascade, held against a real multi-sample library rather than
 * against bytes we wrote ourselves.
 *
 * Issue #33's design rests on a survey of the card backup at
 * `~/Documents/Music/Deluge/TimCardBU` — 36 presets, 832 ranges of Factory,
 * Community 1.2 and Tim's own instruments, every referenced WAV present. The
 * claims that survey makes are the ones this file checks, because they are
 * what the cascade is shaped around and none of them can be seen in a
 * synthetic fixture:
 *
 * - the embedded root note is by far the strongest signal;
 * - the device's all-identical discard rule fires on about a third of the
 *   library, so it is load-bearing;
 * - file names need calibrating, never taking at face value — and the offset
 *   that calibrates them can be fitted from the files themselves;
 * - one offset per folder is the control that fixes a whole import at once.
 *
 * The card is one person's backup and is not in the repository, so this
 * **skips** when it isn't there. It is a check on the design, not a gate on
 * the build: `src/core/samples/roots.test.ts` is what holds the behaviour.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bufferReader, readWavInfo } from '../src/core/samples/wav'
import { resolveRoots, type SampleFile } from '../src/core/samples/roots'
import { midpointTopNotes } from '../src/core/preset/multisample'
import { parseTree } from '../src/core/xml/parse'
import { sampleRanges } from '../src/core/preset/ranges'
import type { OscElement } from '../src/core/preset/types'
import type { XmlElement } from '../src/core/xml/element'

const CARD = join(process.env.HOME ?? '', 'Documents/Music/Deluge/TimCardBU')
const present = existsSync(join(CARD, 'SYNTHS'))
if (!present) console.log(`corpus-roots: skipped — no card backup at ${CARD} (a check on the design, not a gate on the build)`)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const oscillators = (el: XmlElement, out: OscElement[] = []): OscElement[] => {
  if (/^osc/.test(el.tag)) out.push(el as OscElement)
  for (const child of el.children) oscillators(child, out)
  return out
}

interface Folder {
  preset: string
  files: SampleFile[]
  /** The root the preset stores for each file, in cents. */
  stored: Map<string, number>
  /** The top note the preset stores per range, in the file's own order. */
  tops: (number | undefined)[]
}

/** Every multi-sample oscillator on the card, with each range's WAV read for its own root. */
async function survey(): Promise<Folder[]> {
  const out: Folder[] = []
  for (const path of walk(join(CARD, 'SYNTHS'))) {
    if (!/\.xml$/i.test(path) || /\/\._/.test(path)) continue
    let roots: XmlElement[]
    try {
      roots = parseTree(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    for (const osc of roots.flatMap((r) => oscillators(r))) {
      const ranges = sampleRanges(osc).filter((r) => r.fileName)
      if (ranges.length < 2) continue
      const files: SampleFile[] = []
      const stored = new Map<string, number>()
      const tops = ranges.map((r) => r.topNote)
      let complete = true
      for (const range of ranges) {
        const wav = join(CARD, (range.fileName as string).replace(/^\//, ''))
        if (!existsSync(wav)) {
          complete = false
          break
        }
        const info = await readWavInfo(bufferReader(new Uint8Array(readFileSync(wav))), { tags: true })
        files.push({
          name: range.fileName as string,
          fileRoot: info.rootNote === undefined ? undefined : Math.round(info.rootNote * 100),
        })
        stored.set(range.fileName as string, 6000 - (range.transpose ?? 0) * 100 - (range.cents ?? 0))
      }
      if (complete) out.push({ preset: path.split('/').pop() as string, files, stored, tops })
    }
  }
  return out
}

/** The single offset that places the most rows, which is what the import's one control does. */
const bestNudge = (rows: { name: string; root?: number }[], stored: Map<string, number>): number => {
  const votes = new Map<number, number>()
  for (const row of rows) {
    if (row.root === undefined) continue
    const d = Math.round(((stored.get(row.name) as number) - row.root) / 100)
    votes.set(d, (votes.get(d) ?? 0) + 1)
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0]?.[0] ?? 0
}

describe.skipIf(!present)('the root cascade over the card backup', () => {
  it('places 85% of a real library once the folder offset is set', async () => {
    const folders = await survey()
    expect(folders.length).toBeGreaterThan(30)

    let ranges = 0
    let placed = 0
    const unplaceable: string[] = []
    for (const folder of folders) {
      const plan = resolveRoots(folder.files)
      const nudge = bestNudge(plan.rows, folder.stored)
      let hits = 0
      for (const row of plan.rows) {
        ranges++
        const want = folder.stored.get(row.name) as number
        if (row.root !== undefined && Math.abs(row.root + nudge * 100 - want) <= 50) {
          placed++
          hits++
        }
      }
      if (hits < plan.rows.length) unplaceable.push(`${folder.preset} ${hits}/${plan.rows.length}`)
    }

    expect(ranges).toBeGreaterThan(800)
    expect(placed / ranges).toBeGreaterThan(0.85)
    // The shortfall is the folders with neither an embedded root nor a note
    // name — field recordings and slice markers, where the device reached for
    // its FFT and we flag the row instead — plus one preset the user detuned
    // by hand. If a folder that used to resolve stops, it will show up here.
    expect(unplaceable.sort()).toEqual([
      '168 Hang Drum.XML 0/2',
      '170 Sitar.XML 0/21',
      'Boombass 2 MS.XML 19/69',
      'Rusty Blade.XML 8/17',
      'Saumur Piano Tuned.XML 6/12',
      'Worn Baby Grand.XML 1/16',
    ])
  }, 120_000)

  it('fits Salamander’s octave for itself, and distrusts a folder tagged all one note', async () => {
    const folders = await survey()

    // Named A0…C7 for a library where middle C is C4; the files know better.
    const salamander = folders.find((f) => f.preset.startsWith('Salamander Piano.')) as Folder
    expect(resolveRoots(salamander.files)).toMatchObject({ offset: -12, offsetFrom: 'anchors' })

    // Every WAV in these folders declares the same note. The device throws the
    // set away; so do we, and the names carry the import instead.
    const suspicious = folders.filter((f) => resolveRoots(f.files).discardedFileRoots)
    expect(suspicious.map((f) => f.preset).sort()).toEqual([
      '168 Hang Drum.XML',
      'Dark.XML',
      'Dystopia Keys.XML',
      'Dystopia Keys.XML',
      'Hail Hydra.XML',
      'Hey Tom O.XML',
      'Immortal Planet.XML',
      'The Dark Tower.XML',
    ])
  }, 120_000)

  it('puts boundaries where the device put them, bar the ones a person moved', async () => {
    const folders = await survey()

    let pairs = 0
    let exact = 0
    let within = 0
    const moved = new Set<string>()
    for (const folder of folders) {
      // The device's own boundaries, recomputed from the roots it stored.
      const roots = folder.files.map((f) => folder.stored.get(f.name) as number)
      midpointTopNotes(roots).forEach((ours, i) => {
        const theirs = folder.tops[i]
        if (ours === undefined || theirs === undefined) return
        pairs++
        if (ours === theirs) exact++
        // A stored root is transpose plus whole cents, so recomputing a
        // midpoint from it can land a semitone off one the device took from
        // the sample's unrounded pitch. A boundary further out than that was
        // put there by hand.
        if (Math.abs(ours - theirs) <= 1) within++
        else moved.add(folder.preset)
      })
    }

    expect(pairs).toBeGreaterThan(750)
    expect(exact / pairs).toBeGreaterThan(0.9)
    expect(within / pairs).toBeGreaterThan(0.95)
    // Which is exactly why boundaries are computed at import and never
    // recomputed on load: these are decisions, not defects.
    expect([...moved].sort()).toEqual([
      '168 Hang Drum.XML',
      '170 Sitar.XML',
      'Erebus Final Boss High.XML',
      'Erebus Final Boss.XML',
      "Joey's Kalimba.XML",
      'Pad 20k Pad.xml',
      'Pad Darker Pad.xml',
      'Pluck Sup Pluck.xml',
      'Worn Baby Grand.XML',
    ])
  }, 120_000)
})
