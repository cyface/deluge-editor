/**
 * The one-line description on the OLED and the chips under it: a mechanical
 * reading of the model, no adjectives the numbers don't justify. Pure; the UI
 * only renders what comes back.
 */

import { hexToInt } from '../params/hex'
import { standardToMenu } from '../params/scale'
import { child } from '../xml/element'
import { isKit, isSound, drumRows } from './index'
import {
  FILTER_MODE_SHORT,
  FILTER_MODE_WORDS,
  MOD_FX_WORDS,
  OSC_TYPE_SHORT,
  OSC_TYPE_WORDS,
  PATCH_SOURCE_NAMES,
  paramLabel,
} from './names'
import { cableMenu, cables, envelopeMenu, osc, paramMenu } from './sound'
import type { KitElement, PatchCableElement, Preset, SoundElement } from './types'

export interface Summary {
  sentence: string
  chips: string[]
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const list = (a: string[]): string => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

/** Env 1 in a word, from the 0..50 menu values (undefined stages take the firmware's default). */
export function envelopeWord(a = 0, d = 20, s = 25, r = 20): string {
  if (a >= 24) return 'slowly swelling'
  if (a >= 12) return 'soft-attacked'
  if (s <= 6 && d <= 16) return 'plucked'
  if (s <= 6) return 'percussive'
  if (r >= 32) return 'long-tailed'
  return 'sustained'
}

const oscWord = (sound: SoundElement, n: 1 | 2): string => {
  const o = osc(sound, n)
  const t = o?.attrs.type
  if (sound.attrs.mode === 'fm') return 'sine'
  if (t === undefined) return 'saw'
  if (t === 'sample') {
    const file = o?.attrs.fileName ?? child(o!, 'sampleRanges')?.children[0]?.attrs.fileName
    return file ? `sample ${file.split('/').pop()}` : 'sample'
  }
  return OSC_TYPE_WORDS[t] ?? t
}
const oscShort = (sound: SoundElement, n: 1 | 2): string => {
  const t = osc(sound, n)?.attrs.type
  return sound.attrs.mode === 'fm' ? 'SIN' : t === undefined ? 'SAW' : (OSC_TYPE_SHORT[t] ?? t.toUpperCase())
}

/** How a cable reads in prose. */
export function cablePhrase(c: PatchCableElement): string {
  const src = c.attrs.source ?? '?'
  const dst = c.attrs.destination ?? '?'
  const name = PATCH_SOURCE_NAMES[src as keyof typeof PATCH_SOURCE_NAMES] ?? src
  if (dst === 'pitch' && src.startsWith('lfo')) return `vibrato from ${name}`
  if (dst === 'lpfFrequency' && src.startsWith('lfo')) return `${name} sweeping the cutoff`
  if (dst === 'lpfFrequency' && src.startsWith('envelope')) return `${name} opening the filter`
  if (dst === 'volume' && src === 'velocity') return 'velocity on the level'
  if (dst === 'volume' && src.startsWith('lfo')) return `tremolo from ${name}`
  return `${name} on ${paramLabel(dst).toLowerCase()}`
}

export function summariseSound(sound: SoundElement): Summary {
  const parts: string[] = []
  const chips: string[] = []
  const m = (attr: Parameters<typeof paramMenu>[1]) => paramMenu(sound, attr)

  // Sources
  const oscB = m('oscBVolume') ?? 50
  const a = oscWord(sound, 1)
  const b = oscWord(sound, 2)
  let t: string
  if (sound.attrs.mode === 'fm') t = 'Two-carrier, two-modulator FM'
  else if (sound.attrs.mode === 'ringmod') t = `${cap(a)} ring-modulated by ${b}`
  else if (oscB > 0) t = a === b ? `Two ${a} waves` : `${cap(a)} and ${b}`
  else t = a.startsWith('sample') ? cap(a) : `One ${a} wave`
  const noise = m('noiseVolume') ?? 0
  if (noise > 6) t += ' over noise'
  const uni = child(sound, 'unison')
  const uniNum = Number(uni?.attrs.num ?? 1)
  const uniDetune = Number(uni?.attrs.detune ?? 0)
  const uniSpread = Number(uni?.attrs.spread ?? 0)
  if (uniNum > 1) {
    t += `, ${uniNum} voices thick`
    if (uniDetune > 22) t += ' and heavily detuned'
    else if (uniDetune > 4) t += ' and detuned'
    if (uniSpread > 25) t += ', spread wide'
  }
  parts.push(t)
  chips.push(
    sound.attrs.mode === 'fm'
      ? 'FM'
      : oscB > 0 && oscShort(sound, 1) === oscShort(sound, 2)
        ? `${oscShort(sound, 1)}×2`
        : oscB > 0
          ? `${oscShort(sound, 1)}+${oscShort(sound, 2)}`
          : oscShort(sound, 1),
  )
  if (uniNum > 1) chips.push(`UNI${uniNum}`)

  // Envelope 1
  const env = envelopeWord(
    envelopeMenu(sound, 1, 'attack'),
    envelopeMenu(sound, 1, 'decay'),
    envelopeMenu(sound, 1, 'sustain'),
    envelopeMenu(sound, 1, 'release'),
  )
  parts.push(env)
  chips.push(env.toUpperCase().replace(/[ -]/g, ''))

  // Filters. An absent lpfMode/hpfMode is the firmware default (on).
  const lpfMode = sound.attrs.lpfMode ?? '24dB'
  const lpf = m('lpfFrequency') ?? 50
  const res = m('lpfResonance') ?? 0
  if (lpfMode !== 'Off') {
    const open = lpf < 13 ? 'a nearly closed' : lpf < 32 ? 'a half-open' : 'a wide-open'
    const q = res > 32 ? 'screaming ' : res > 14 ? 'resonant ' : ''
    parts.push(`through ${open} ${q}${FILTER_MODE_WORDS[lpfMode] ?? lpfMode}`)
    chips.push(`${FILTER_MODE_SHORT[lpfMode] ?? lpfMode}${res > 14 ? ' RES' : ''}`)
  }
  const hpf = m('hpfFrequency') ?? 0
  if ((sound.attrs.hpfMode ?? 'HPLadder') !== 'Off' && hpf > 2) {
    parts.push('high-passed')
    chips.push('HPF')
  }

  // Modulation: cables of at least 3.00 either way.
  const live = cables(sound).filter((c) => Math.abs(cableMenu(c)) >= 300)
  if (live.length) parts.push(`with ${list(live.map(cablePhrase))}`)
  for (const c of live) {
    const src = c.attrs.source ?? '?'
    const name = PATCH_SOURCE_NAMES[src as keyof typeof PATCH_SOURCE_NAMES] ?? src
    chips.push(`${name.replace(/ /g, '').toUpperCase()}→${paramLabel(c.attrs.destination ?? '?').replace(/ /g, '').toUpperCase()}`)
  }

  // Effects
  const fx: string[] = []
  const modFx = sound.attrs.modFXType ?? 'none'
  const depth = m('modFXDepth') ?? 0
  if (modFx !== 'none' && depth > 4) fx.push(MOD_FX_WORDS[modFx] || 'modulated')
  const fb = m('delayFeedback') ?? 0
  if (fb > 4) fx.push(fb > 28 ? 'trailing a long delay' : 'with delay')
  const reverb = m('reverbAmount') ?? 0
  if (reverb > 26) fx.push('in a large hall')
  else if (reverb > 8) fx.push('in a small room')
  const crush = m('bitCrush') ?? 0
  const decim = m('sampleRateReduction') ?? 0
  if (crush > 6 || decim > 6) fx.push('crushed')
  if (fx.length) parts.push(list(fx))
  if (reverb > 8) chips.push('VERB')
  if (fb > 4) chips.push('DLY')
  if (modFx !== 'none' && depth > 4) chips.push(modFx.toUpperCase())
  if (crush > 6 || decim > 6) chips.push('CRUSH')

  // Arpeggiator: community writes arpMode, older files only mode.
  const arp = child(sound, 'arpeggiator')
  const arpOn = arp ? (arp.attrs.arpMode ?? arp.attrs.mode ?? 'off') !== 'off' : false
  if (arpOn) {
    parts.push('arpeggiated')
    chips.push('ARP')
  }

  return { sentence: `${parts.join(', ')}.`, chips }
}

export function summariseKit(kit: KitElement): Summary {
  const rows = drumRows(kit)
  const names = rows.map((r) => r.attrs.name).filter((n): n is string => !!n)
  const kinds = { sound: 0, midi: 0, gate: 0 }
  for (const r of rows) {
    if (r.tag === 'midiOutput') kinds.midi++
    else if (r.tag === 'gateOutput') kinds.gate++
    else kinds.sound++
  }
  const bits = [`${rows.length} row${rows.length === 1 ? '' : 's'}`]
  if (kinds.midi) bits.push(`${kinds.midi} MIDI`)
  if (kinds.gate) bits.push(`${kinds.gate} gate`)
  const sentence = names.length
    ? `${cap(bits.join(', '))}: ${list(names.slice(0, 6))}${names.length > 6 ? ' and more' : ''}.`
    : `${cap(bits.join(', '))}.`
  const chips = [`${rows.length} ROWS`]
  const reverb = kit.attrs && child(kit, 'defaultParams')?.attrs.reverbAmount
  if (reverb && standardToMenu(hexToInt(reverb)) > 8) chips.push('VERB')
  return { sentence, chips }
}

export function summarise(preset: Preset): Summary {
  if (isSound(preset)) return summariseSound(preset)
  if (isKit(preset)) return summariseKit(preset)
  return { sentence: '', chips: [] }
}
