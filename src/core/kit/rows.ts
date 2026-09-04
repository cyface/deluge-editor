/**
 * What the kit table says about a row: its one-line description, the sample
 * it plays, and what its Source button should offer. Read straight off the
 * row's element through `core/preset`; nothing here writes.
 */

import { isVelocityKeyed, sampleRanges, soundingOrder } from '../preset/ranges'
import { isSoundRow } from '../preset/rows'
import { osc } from '../preset/sound'
import type { DrumRow, OscElement } from '../preset/types'

/**
 * One line naming what the row is: the MIDI or gate output, the sample file
 * (or how many), or the synth mode and oscillator type.
 */
export function rowDescription(r: DrumRow): string {
  if (r.tag === 'midiOutput') return `MIDI ch ${Number(r.attrs.channel ?? 0) + 1} · note ${r.attrs.note ?? '?'}`
  if (r.tag === 'gateOutput') return `Gate ${Number(r.attrs.channel ?? 0) + 1}`
  const o = osc(r, 1)
  // The Source constructor's default survives a load with no `type`
  // (`oscType = OscType::SQUARE`, `src/deluge/processing/source.cpp:41`, `beta` e7bae539).
  const t = o?.attrs.type ?? 'square'
  if (t === 'sample') {
    // A multi-sample row says so: the first file alone reads as if the row
    // held one sample (issue #29). The key map is in the oscillator panel.
    // An empty `fileName=""` is how a blank row leaves the device (the
    // template kit's U1), so it reads as no file rather than as nothing.
    const files = o ? sampleRanges(o).map((s) => s.fileName || '(no file)') : []
    if (files.length === 0) return '(no file)'
    return files.length === 1 ? files[0] : `${files.length} samples · ${files[0]}`
  }
  return `${r.attrs.mode ?? 'subtractive'} · ${t}`
}

/** The oscillator whose play mode the Mode column edits: osc1 when it plays a sample. */
export function rowSampleOsc(r: DrumRow): OscElement | undefined {
  if (!isSoundRow(r)) return undefined
  const o = osc(r, 1)
  return o?.attrs.type === 'sample' ? o : undefined
}

/** The sample file a row plays, for the audio preview; undefined for non-sample rows. */
export function rowSampleFile(r: DrumRow): string | undefined {
  const o = rowSampleOsc(r)
  if (!o) return undefined
  // The lowest range's sample stands for the row: the pad plays it first.
  return soundingOrder(sampleRanges(o))[0]?.fileName || undefined
}

/**
 * What the row's Source button offers. A drum with one sample — nearly every
 * drum — offers to change it. More than one is the odd case, and what those
 * ranges mean depends on the file: a kit row always sounds `kNoteForDrum`
 * (`SoundDrum::noteOn`, `src/deluge/processing/sound/sound_drum.cpp:64`,
 * `beta` e7bae539), so a note key does nothing inside a kit, and the only
 * firmware that reads more than one range per drum reads the key as a
 * velocity instead. So say "layers" when the file is keyed that way.
 */
export function rowSourceAction(r: DrumRow): 'sample' | 'layers' | 'ranges' {
  const o = rowSampleOsc(r)
  if (!o || sampleRanges(o).length < 2) return 'sample'
  return isVelocityKeyed(o) ? 'layers' : 'ranges'
}
