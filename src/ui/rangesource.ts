/**
 * Where a range's root note came from, as the range editor and its import and
 * re-detect blocks word it: a short tag for a table cell and the reason in
 * full for its tooltip and the legend.
 */
import type { RangeRootFrom } from './state/multisample.svelte'

export const ROOT_SOURCE: Record<RangeRootFrom, { short: string; why: string }> = {
  user: { short: 'you', why: 'you set this root by hand' },
  file: { short: 'WAV tag', why: 'the note the file itself declares, in its smpl/inst chunk' },
  name: { short: 'file name', why: 'read from the name, through the folder offset' },
  between: { short: 'spaced', why: 'evenly between the neighbours that did resolve' },
  kept: { short: 'kept', why: 'nothing in the file or its name placed it, so its root is untouched' },
  unknown: { short: '—', why: 'nothing placed this one' },
}
