/**
 * The tooltip copy is data, so the invariants it has to hold are testable:
 * every parameter the UI can show has a description, every panel has its line,
 * and none of it grows into a manual page (issue #20).
 */
import { describe, expect, it } from 'vitest'
import { PARAM_NAMES } from '../core/preset'
import { GROUPS, KIT_GROUP } from './groups'
import { HELP, PARAM_HELP, paramHelp, panelHelp } from './help'

const entries = [...Object.entries(PARAM_HELP), ...Object.entries(HELP)]

describe('tooltip copy', () => {
  it('describes every parameter a cable or a gold knob can name', () => {
    const missing = PARAM_NAMES.filter((p) => paramHelp(p) === undefined)
    expect(missing).toEqual([])
  })

  it('describes the numbered envelopes and LFOs without listing them', () => {
    // The four copies read alike, so `paramHelp` matches rather than repeats;
    // envelope 1 is the exception, because the firmware wires it to volume.
    expect(paramHelp('env3Decay')).toBe(paramHelp('env2Decay'))
    expect(paramHelp('env1Release')).toContain('volume')
    expect(paramHelp('env2Release')).not.toContain('volume')
    // LFO 1 and 3 are the global pair, 2 and 4 run per voice.
    expect(paramHelp('lfo3Rate')).toBe(paramHelp('lfo1Rate'))
    expect(paramHelp('lfo4Rate')).toBe(paramHelp('lfo2Rate'))
    expect(paramHelp('lfo1Rate')).not.toBe(paramHelp('lfo2Rate'))
  })

  it('gives every panel a line for the block as a whole', () => {
    const missing = [...GROUPS, KIT_GROUP].filter((g) => panelHelp(g.id) === undefined)
    expect(missing.map((g) => g.id)).toEqual([])
  })

  it('has nothing to say about a control that does not exist', () => {
    expect(paramHelp('notAParam')).toBeUndefined()
    expect(paramHelp(undefined)).toBeUndefined()
    expect(paramHelp('env5Attack')).toBeUndefined()
  })

  it('stays a hint rather than a manual page', () => {
    const long = entries.filter(([, text]) => text.length > 230).map(([k]) => k)
    expect(long).toEqual([])
  })

  it('is written as sentences, with the typographic apostrophe the UI uses', () => {
    const bad = entries.filter(([, t]) => !/^[A-Z“]/.test(t) || !t.endsWith('.') || t.includes("'") || t.includes('  '))
    expect(bad.map(([k]) => k)).toEqual([])
  })
})
