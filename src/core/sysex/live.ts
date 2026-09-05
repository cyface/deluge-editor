/**
 * The Live Edit ops' wire shapes (`docs/live-edit.md`; firmware
 * `src/deluge/storage/smsysex_live.cpp` on the fork's
 * `feature/live-edit-sysex`), spelled out for the rest of the editor. The
 * client (`client.ts`) sends and receives these; `src/core/live/` translates
 * between them and the preset tree.
 */

/** One `param` on the wire: the file name, a cable's source, and on a kit the row or the bus. */
export interface LiveAddress {
  /** `paramNameForFile`'s string — a cable destination's spelling, never a `<defaultParams>` attribute's. */
  name: string
  /** Present for a patch cable's amount: the cable's `source` string. */
  src?: string
  /** Kit only: a row by drum index (`Kit::getDrumIndex`, the `<soundSources>` order). */
  drum?: number
  /** Kit only: the kit's own parameters, what AFFECT ENTIRE reaches. */
  bus?: true
}

/** One parameter change: an address and the `AutoParam`'s value, an int32 (the file's hex as a number). */
export interface LiveChange extends LiveAddress {
  value: number
}

export type LiveOutputType = 'synth' | 'kit' | 'midi' | 'cv' | 'audio' | 'none'
export type LiveDrumKind = 'sound' | 'midi' | 'gate' | 'none'

/**
 * The instrument fields every `^inst`-shaped reply and push carries
 * (`writeInstrumentFields`). `name`, `dir` and `edited` are present only for
 * a synth or kit; `drum` and `drumKind` only for a kit; `entire` for any
 * instrument clip. `dir` has no leading slash, as `Instrument::dirPath`
 * holds it (`SYNTHS`, `KITS/Sub`).
 */
export interface LiveInstrument {
  type: LiveOutputType
  name?: string
  dir?: string
  edited?: boolean
  /** Index of the selected row in the drum list, -1 when none is selected. */
  drum?: number
  drumKind?: LiveDrumKind
  /** The clip's AFFECT ENTIRE. */
  entire?: boolean
  /** A counter the device bumps on every edit; pushes carry it too. */
  gen: number
}

export interface LiveSaved extends LiveInstrument {
  /** The path written, as the device resolved it. */
  path: string
}

export interface LiveSubscribed extends LiveInstrument {
  /** The lease granted, 0 when released. */
  secs: number
}

/** A device-initiated message to the subscriber, sent on sequence number 0. */
export type LivePush =
  /** Parameter values changed on the device: the latest value per parameter, batched. */
  | { kind: 'chg'; gen: number; changes: LiveChange[] }
  /** Something that is not a parameter value changed: the editor should pull the preset and diff. */
  | { kind: 'dirty'; gen: number }
  /** The output, selected row, AFFECT ENTIRE or edited flag changed. */
  | { kind: 'inst'; inst: LiveInstrument }

/**
 * A live op's failure. `why` is the firmware's one-word reason, the thing a
 * caller acts on (`off`, `noInst`, `busy`, `exists`, `sameName`, `path`,
 * `notFound`, `load`, `save`, `noKit`, `noDrum`, `noRow`, `noParam`, `name`,
 * `src`); `code` is its `Error` enum value, or 1 when the failure is the
 * protocol's own. Distinct from `SysexError`, whose codes are FatFS results.
 */
export class LiveError extends Error {
  constructor(
    public readonly op: string,
    public readonly why: string,
    public readonly code: number,
  ) {
    super(`${op}: ${LIVE_REASONS[why] ?? why}`)
    this.name = 'LiveError'
  }
}

/** Screen-ready clauses for the `why` words, lower case and without protocol vocabulary. */
export const LIVE_REASONS: Record<string, string> = {
  off: 'the Sysex Live Edit feature is switched off on the Deluge',
  noInst: 'the current clip is not a synth or kit',
  busy: 'the Deluge has a menu or browser open',
  exists: 'a preset with that name already exists',
  sameName: 'a different preset with that name is loaded elsewhere in the song',
  path: 'the path must be a folder and a name ending in .XML',
  notFound: 'the file is not on the card',
  load: 'the Deluge could not load the file',
  save: 'the Deluge could not write the file',
  noKit: 'the current instrument is not a kit',
  noDrum: 'the kit has no such row',
  noRow: 'the row has no parameters in this clip',
  noParam: 'the instrument has no such parameter',
  name: 'the Deluge does not know that parameter name',
  src: 'the Deluge does not know that modulation source',
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const flag = (v: unknown): boolean | undefined => (typeof v === 'number' ? v !== 0 : undefined)

const OUTPUT_TYPES: readonly LiveOutputType[] = ['synth', 'kit', 'midi', 'cv', 'audio', 'none']
const DRUM_KINDS: readonly LiveDrumKind[] = ['sound', 'midi', 'gate', 'none']

/** The instrument fields out of a reply or push body; anything unexpected reads as `none`. */
export function instrumentFromWire(body: Record<string, unknown>): LiveInstrument {
  const type = str(body.type)
  const inst: LiveInstrument = {
    type: OUTPUT_TYPES.includes(type as LiveOutputType) ? (type as LiveOutputType) : 'none',
    gen: num(body.gen) ?? 0,
  }
  const name = str(body.name)
  if (name !== undefined) inst.name = name
  const dir = str(body.dir)
  if (dir !== undefined) inst.dir = dir
  const edited = flag(body.edited)
  if (edited !== undefined) inst.edited = edited
  const drum = num(body.drum)
  if (drum !== undefined) inst.drum = drum
  const drumKind = str(body.drumKind)
  if (DRUM_KINDS.includes(drumKind as LiveDrumKind)) inst.drumKind = drumKind as LiveDrumKind
  const entire = flag(body.entire)
  if (entire !== undefined) inst.entire = entire
  return inst
}

/** A `^chg` entry `{n, s?, d? | b?, v}` spelled out; null when it lacks a name or value. */
function changeFromWire(e: unknown): LiveChange | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const name = str(o.n)
  const value = num(o.v)
  if (name === undefined || value === undefined) return null
  const change: LiveChange = { name, value }
  const src = str(o.s)
  if (src !== undefined) change.src = src
  if (o.b === 1) change.bus = true
  else {
    const drum = num(o.d)
    if (drum !== undefined) change.drum = drum
  }
  return change
}

/** A sequence-0 message's JSON as a push, or null when it is none of the three. */
export function pushFromWire(json: Record<string, unknown>): LivePush | null {
  const chg = json['^chg'] as Record<string, unknown> | undefined
  if (chg) {
    const entries = Array.isArray(chg.p) ? chg.p : []
    return { kind: 'chg', gen: num(chg.gen) ?? 0, changes: entries.map(changeFromWire).filter((c): c is LiveChange => c !== null) }
  }
  const dirty = json['^dirty'] as Record<string, unknown> | undefined
  if (dirty) return { kind: 'dirty', gen: num(dirty.gen) ?? 0 }
  const inst = json['^inst'] as Record<string, unknown> | undefined
  if (inst) return { kind: 'inst', inst: instrumentFromWire(inst) }
  return null
}
