/**
 * Guessing a drum type from a sample's file name, and ordering a folder of
 * samples into kit rows. Names only — no audio analysis. The order puts the
 * bass drum on the bottom pad (first row in the file, like the factory
 * kits), then snare, closed hat, open hat, and on down the list; unmatched
 * names land after everything recognised, alphabetically.
 */

export type DrumClass =
  | 'kick'
  | 'snare'
  | 'closed-hat'
  | 'open-hat'
  | 'clap'
  | 'rim'
  | 'tom'
  | 'crash'
  | 'ride'
  | 'perc'
  | 'other'

/** Row order, bottom pad first. Tim's spec: kick, snare, closed hat, open hat, then the rest. */
export const DRUM_ORDER: readonly DrumClass[] = [
  'kick', 'snare', 'closed-hat', 'open-hat', 'clap', 'rim', 'tom', 'crash', 'ride', 'perc', 'other',
]

/** Word-boundary-ish match for drum-machine abbreviations: `BD`, `OH`, `CH`… */
const abbr = (letters: string) => new RegExp(`(^|[^a-z])(?:${letters})([^a-z]|$)`, 'i')

const OPEN = /open|(^|[^a-z])op(en)?[^a-z]*h/i
const HATTY = /h[\s._-]*[ai][\s._-]*t|hat|(^|[^a-z])hh([^a-z]|$)|hi[\s._-]*hat/i

/** First match wins; open-vs-closed hats are decided before the generic hat rules. */
const RULES: readonly [DrumClass, RegExp][] = [
  ['kick', /kick|bass[\s._-]*drum/i],
  ['kick', abbr('bd')],
  ['snare', /snare/i],
  ['snare', abbr('sd|sn|snr')],
  ['open-hat', /open[\s._-]*(hi)?[\s._-]*hat|open[\s._-]*hh/i],
  ['open-hat', abbr('oh|ohh')],
  ['closed-hat', /(closed|cls|cl)[\s._-]*(hi)?[\s._-]*hat|(closed|cls)[\s._-]*hh|hi[\s._-]*hat|hihat|\bhat/i],
  ['closed-hat', abbr('ch|chh|hh|hat|hats')],
  ['clap', /clap/i],
  ['clap', abbr('cp|hc')],
  ['rim', /rim[\s._-]*shot|rim/i],
  ['rim', abbr('rs')],
  ['tom', /tom|floor[\s._-]*tom/i],
  ['tom', abbr('lt|mt|ht|ft')],
  ['crash', /crash|cymbal|cym/i],
  ['crash', abbr('cr|cy')],
  ['ride', /ride/i],
  ['ride', abbr('rd')],
  ['perc', /perc|shak|tamb|conga|bongo|cow[\s._-]*bell|cowbell|bell|clave|marac|guiro|agogo|timbale|cabasa|block|triangle|whistle|snap|cuica|stick/i],
  ['perc', abbr('cb|cl|ma|ag|ws')],
]

/** Strip directories and the extension; classification looks at the base name only. */
const baseName = (path: string): string => {
  const file = path.slice(path.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

export function classifyDrum(fileName: string): DrumClass {
  const name = baseName(fileName)
  // "OpenHat"/"ClosedHat" style names with no separators still need the
  // open/closed decision to run before the generic hat rules do.
  if (HATTY.test(name) && OPEN.test(name)) return 'open-hat'
  for (const [cls, re] of RULES) if (re.test(name)) return cls
  return 'other'
}

const rank = new Map(DRUM_ORDER.map((c, i) => [c, i]))

/** Numeric-aware name compare, so `Kick 2` sorts before `Kick 10`. */
const byName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Stable kit order for a set of samples: by drum class (kick first), then by
 * name within a class.
 */
export function orderSamples<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, name: nameOf(item), cls: rank.get(classifyDrum(nameOf(item)))! }))
    .sort((a, b) => a.cls - b.cls || byName(a.name, b.name))
    .map((x) => x.item)
}
