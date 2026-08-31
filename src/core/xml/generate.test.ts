import { describe, expect, it } from 'vitest'
import { element } from './element'
import { serialize } from './generate'

describe('serialize', () => {
  it('writes the declaration, tab indents, one attribute per line, and " />" for childless elements', () => {
    const sound = element('sound', { firmwareVersion: 'c1.3.0', polyphonic: 'poly' }, [
      element('osc1', { type: 'saw', transpose: '0' }),
    ])
    expect(serialize([sound])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<sound\n\tfirmwareVersion="c1.3.0"\n\tpolyphonic="poly">\n' +
        '\t<osc1\n\t\ttype="saw"\n\t\ttranspose="0" />\n' +
        '</sound>\n',
    )
  })
  it('puts LFO, unison and mod-knob attributes on the tag line, as Sound::writeToFile does', () => {
    const sound = element('sound', {}, [
      element('lfo1', { type: 'triangle', syncLevel: '0', syncType: '0' }),
      element('unison', { num: '1', detune: '8', spread: '0' }),
      element('modKnobs', {}, [
        element('modKnob', { controlsParam: 'pan' }),
        element('modKnob', {
          controlsParam: 'pitch',
          patchAmountFromSource: 'lfo1',
          patchAmountFromSecondSource: 'envelope1',
        }),
      ]),
    ])
    expect(serialize([sound])).toContain('\t<lfo1 type="triangle" syncLevel="0" syncType="0" />\n')
    expect(serialize([sound])).toContain('\t<unison num="1" detune="8" spread="0" />\n')
    expect(serialize([sound])).toContain('\t\t<modKnob controlsParam="pan" />\n')
    expect(serialize([sound])).toContain(
      '\t\t<modKnob controlsParam="pitch" patchAmountFromSource="lfo1"\n\t\t\tpatchAmountFromSecondSource="envelope1" />\n',
    )
  })
  it('lays out a kit MIDI row with the name on its own line and channel/note inline', () => {
    const kit = element('kit', {}, [
      element('soundSources', {}, [element('midiOutput', { name: 'CLAP', channel: '9', note: '39' })]),
    ])
    expect(serialize([kit])).toContain('\t\t<midiOutput\n\t\t\tname="CLAP" channel="9" note="39" />\n')
  })
  it('writes an element with no attributes and no children open/close on two lines, like an empty list', () => {
    expect(serialize([element('sound', {}, [element('midiKnobs')])])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<sound>\n\t<midiKnobs>\n\t</midiKnobs>\n</sound>\n',
    )
  })
  it('writes a childless sample-type oscillator open/close, as writeSourceToFile does', () => {
    const sound = element('sound', {}, [element('osc2', { type: 'sample', loopMode: '0' })])
    expect(serialize([sound])).toContain('\t<osc2\n\t\ttype="sample"\n\t\tloopMode="0">\n\t</osc2>\n')
  })
  it('writes a kit’s selectedDrumIndex as a text element after the last child, as Kit::writeToFile does', () => {
    const kit = element('kit', { lpfMode: '24dB', selectedDrumIndex: '3' }, [element('soundSources')])
    expect(serialize([kit])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<kit\n\tlpfMode="24dB">\n' +
        '\t<soundSources>\n\t</soundSources>\n' +
        '\t<selectedDrumIndex>3</selectedDrumIndex>\n' +
        '</kit>\n',
    )
  })
  it('writes values raw, with no XML escaping, as the firmware does', () => {
    expect(serialize([element('sound', { name: 'A & B' })])).toContain('name="A & B"')
  })
  it('skips attributes set to undefined', () => {
    expect(serialize([element('sound', { a: undefined, b: '1' })])).toContain('<sound\n\tb="1" />')
  })
})
