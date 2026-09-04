/**
 * Follow Mode: mirror the Deluge's own knob moves into the editor.
 *
 * With Midi-Follow feedback enabled on the instrument
 * (Settings › MIDI › Midi-Follow › Channel › Channel A set to a channel, then
 * Feedback › Channel set to Channel A), the Deluge sends a
 * CC whenever a value in the active context changes — a gold encoder, the
 * select encoder in a menu, a context switch. This store listens for those,
 * resolves each through the firmware's default CC map
 * (`src/core/midi/follow.ts`) and writes the value where the firmware writes
 * it (`src/core/preset/follow.ts`).
 *
 * It listens by default. Sending — moving a control here and having the
 * instrument follow — writes into the live sound on the device, so it is
 * guarded rather than merely offered: it goes only to a port that names itself
 * a Deluge, and only on a channel that Deluge has actually been heard on
 * (see docs/decisions.md).
 *
 * The honesty problem this mode exists to solve: a follow CC says *a* value
 * changed on the instrument, never *which sound* it belongs to. If the loaded
 * preset is not what the Deluge has in its active clip, mirroring writes the
 * device's numbers into an unrelated file. So it is a mode you turn on, with
 * its own view of only the parameters follow can reach, and — like every other
 * edit here — nothing is committed until you save.
 */

import { controlChange, followMap, parseControlChange } from '../../core/midi/follow'
import {
  type Advice,
  chooseSendTarget,
  followAdvice,
  parseFollowSettings,
  parseMpeInputs,
  type FollowSettings,
  type MpeZones,
} from '../../core/midi/followsettings'
import { cardPath } from '../../core/library'
import { SysexError } from '../../core/sysex'
import { isKit } from '../../core/preset'
import { KIT_FOLLOW_SLOTS, SOUND_FOLLOW_SLOTS, applyFollowCC, type FollowSlot } from '../../core/preset/follow'
import { card } from './card.svelte'
import { editor } from './editor.svelte'
import { errorText } from '../errtext'

/** What the follow CCs are being applied to. Mirrors the instrument's AFFECT ENTIRE. */
export type FollowTarget = 'row' | 'bus'

/** The last CC seen, whether or not it was mapped — the panel's only diagnostic. */
export interface SeenCC {
  channel: number
  cc: number
  value: number
  /** The parameter it addressed, or null when this firmware maps that CC to nothing. */
  param: string | null
  at: number
}

/** How long a mirrored parameter stays highlighted, ms. */
const GLOW_FOR = 1200

/**
 * The cable number in a Deluge output's name. Web MIDI names them "Deluge Port
 * 1" and so on, one per USB cable, and which cable a CC goes out on decides
 * whether MIDI-Follow can match it at all.
 */
export function portNumber(name: string | null | undefined): number | null {
  const m = /(\d+)\s*$/.exec(name ?? '')
  return m ? Number(m[1]) : null
}

/** FatFS results that mean the file simply is not there (`src/core/sysex/fatfs.ts`). */
const FR_NO_FILE = 4
const FR_NO_PATH = 5

class Follow {
  /** Follow Mode is on: the page shows the follow view and CCs are applied. */
  on = $state(false)
  status = $state<'off' | 'listening' | 'error'>('off')
  error = $state<string | null>(null)
  /** Input ports being listened to, by name. */
  ports = $state.raw<string[]>([])
  /** 0 = any channel; otherwise 1–16, matching the instrument's numbering. */
  channel = $state(0)
  /** Kit only: the kit bus (AFFECT ENTIRE on) or the selected row (off). */
  target = $state<FollowTarget>('row')
  last = $state.raw<SeenCC | null>(null)
  /** CCs applied since the mode was last switched on. */
  applied = $state(0)
  /** Parameter names touched in the last moment, for the view's glow. Always replaced whole. */
  glow = $state.raw<Record<string, number>>({})

  /**
   * Send editor moves back to the instrument.
   *
   * On, but it cannot fire until the instrument has been heard: the channel
   * defaults to `'auto'`, which is the channel MIDI-Follow's own feedback
   * arrives on, and until something arrives there is nowhere to aim. Together
   * with sending only to a Deluge-named port, that is what makes this safe to
   * leave on — a CC can only go to a Deluge, on a channel that Deluge just
   * used for MIDI-Follow.
   */
  sending = $state(true)
  /**
   * The channel sends go out on. Unlike listening there is no "any": a CC only
   * reaches the instrument's follow handler when its channel matches one of
   * MIDI-Follow's A/B/C (`MidiFollow::checkMidiFollowMatch`).
   *
   * And that match is not always a number. A follow channel can be set to an
   * MPE zone instead — `LearnedMIDI::isForMPEZone`, `channelOrZone >= 16` —
   * in which case `checkMatch` accepts any channel the input port maps into
   * that zone, and the instrument's own feedback goes out on the zone's master
   * channel (`sendCCForMidiFollowFeedback`: `channel = getMasterChannel()`,
   * which is 0 for the lower zone and 15 for the upper, so MIDI channel 1 or
   * 16). None of that is a number the user can read off the menu, which shows
   * "MPE Lower Zone". So the default is not a number either: it is whatever
   * channel the feedback came in on, which is right for a plain channel and
   * for either zone without anyone having to work it out.
   */
  sendChannel = $state<number | 'auto'>('auto')
  /** The channel the last mapped follow CC arrived on. What `'auto'` resolves to. */
  heardChannel = $state<number | null>(null)

  /**
   * The instrument's own MIDI-Follow settings, read from `SETTINGS/MIDIFollow.XML`
   * on the card. Which channel MIDI-Follow is on is the one thing this mode
   * cannot learn over MIDI, and the menu answers it as "A" or "MPE Lower
   * Zone", neither of which is a number to send on. The file says outright.
   */
  settings = $state<FollowSettings | null>(null)
  settingsAdvice = $state<Advice[]>([])
  settingsError = $state<string | null>(null)
  checking = $state(false)
  /**
   * Where the instrument's own settings say a send will be accepted: which of
   * its three USB cables, and on which channel. Null once checked means
   * nothing will accept on any of them, and that is an answer rather than a
   * gap, so the editor stops guessing.
   *
   * The port half is not a detail. Only USB cable 2 has MPE zones by default
   * (`MIDICableUSBUpstream`, `midi_device_manager.cpp`), so a follow channel
   * set to a zone can only ever match there, and a plain follow channel can
   * only ever match on cables 1 or 3. Picking the first Deluge output in the
   * browser's list is picking one of those at random.
   */
  deviceSendPort = $state<number | null>(null)
  deviceSendChannel = $state<number | null>(null)
  deviceChecked = $state(false)
  /** The output port sends go out on, by name. */
  sendPort = $state<string | null>(null)
  /** CCs sent since the mode was last switched on. */
  sent = $state(0)

  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator

  /** The default CC map of the selected firmware, or null where follow does not exist. */
  readonly map = $derived(followMap(editor.version))
  /**
   * Whether the top bar offers the mode at all.
   *
   * With a file loaded this is a firmware question: MIDI Follow does not exist
   * on any official build or below community 1.1.0, so the button is absent
   * there rather than disabled. With nothing loaded there is no firmware to
   * ask about yet, and the mode is a way to *start* a preset rather than
   * something done to one — entering it opens the init synth, which is a
   * c1.3.0 file — so it is offered.
   */
  readonly available = $derived(this.map !== null || editor.preset === null)
  /** True while the CCs land on the kit bus rather than a row's sound. */
  readonly onBus = $derived(editor.preset !== null && isKit(editor.preset) && this.target === 'bus')

  /**
   * The channel a send would actually go out on, or null while `'auto'` has
   * not heard the instrument yet. Nothing is sent while this is null: aiming
   * at a guess is how a follow CC ends up somewhere it was not meant to go.
   */
  readonly outChannel = $derived<number | null>(
    this.sendChannel !== 'auto'
      ? this.sendChannel
      : // Once the instrument's own settings have been read they are the
        // authority: the channel feedback arrives on is not always a channel
        // a send is accepted on, which is exactly the MPE-zone case.
        this.deviceChecked
        ? this.deviceSendChannel
        : this.heardChannel,
  )

  /**
   * CC → parameter name for what the CCs currently land on. A kit row takes
   * the sound map minus portamento, which
   * `MidiFollow::getModelStackWithParamForKitClip` refuses for kits.
   */
  readonly table = $derived.by<Readonly<Record<number, string>>>(() => {
    const m = this.map
    if (!m) return {}
    if (this.onBus) return m.global
    if (editor.preset !== null && isKit(editor.preset)) {
      return Object.fromEntries(Object.entries(m.sound).filter(([, name]) => name !== 'portamento'))
    }
    return m.sound
  })

  /** The parameters shown in the follow view, in CC order, with where each lives. */
  readonly slots = $derived.by<{ cc: number; name: string; slot: FollowSlot }[]>(() => {
    const slots = this.onBus ? KIT_FOLLOW_SLOTS : SOUND_FOLLOW_SLOTS
    return Object.entries(this.table)
      .map(([cc, name]) => ({ cc: Number(cc), name, slot: slots[name] }))
      .filter((e): e is { cc: number; name: string; slot: FollowSlot } => e.slot !== undefined)
      .sort((a, b) => a.cc - b.cc)
  })

  private access: MIDIAccess | null = null
  private listening: MIDIInput[] = []
  private out: MIDIOutput | null = null
  private readonly onMessage = (e: Event) => this.receive(e as MIDIMessageEvent)
  private glowTimer: ReturnType<typeof setInterval> | null = null
  /**
   * The last CC value sent per CC number, and when. The instrument echoes a
   * value it accepts straight back as feedback, and applying our own echo
   * would inflate the counters and flash the glow for a move nobody made. The
   * firmware filters the same way and with the same window
   * (`midiFollowFeedbackFilter`, one second — `MidiFollow::midiCCReceived`).
   */
  private readonly echo = new Map<number, { value: number; at: number }>()
  private static readonly ECHO_FOR = 1000
  /** The last outgoing snapshot, and the target it was taken from. */
  private baseline: Map<number, number> | null = null
  private baselineKey = ''
  /** `error` is a failed send's, so the next send or receive that works clears it. */
  private sendFailed = false

  async toggle(): Promise<void> {
    if (this.on) {
      this.stop()
      return
    }
    await this.start()
  }

  async start(): Promise<void> {
    this.error = null
    if (!this.supported) {
      this.on = true
      this.status = 'error'
      this.error = 'Web MIDI is not available here — use Chrome or Edge.'
      return
    }
    this.on = true
    this.applied = 0
    this.sent = 0
    try {
      if (this.access === null) {
        this.access = await requestAccess()
        // A Deluge plugged in after the mode was switched on has to be picked
        // up, and one unplugged has to stop being listed. `addEventListener`
        // rather than `onstatechange`, which the card store may own if the
        // browser hands both stores the same MIDIAccess — and optional,
        // because losing hot-plug refresh is no reason to lose the mode.
        this.access.addEventListener?.('statechange', () => {
          if (this.on) this.attach()
        })
      }
      this.attach()
      this.status = 'listening'
      // The glow is time-based, so something has to retire it; one interval
      // for the mode beats a timer per parameter on a busy knob sweep.
      this.glowTimer ??= setInterval(() => this.expireGlow(), 300)
    } catch (e) {
      this.status = 'error'
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  stop(): void {
    this.on = false
    this.status = 'off'
    this.detach()
    if (this.glowTimer !== null) clearInterval(this.glowTimer)
    this.glowTimer = null
    // The counters describe a session of listening; leaving the mode ends it.
    // Nothing shows them now, but they are what the tests read to say whether
    // a CC was taken, so they are reset with everything else.
    this.glow = {}
    this.last = null
    this.applied = 0
    this.sent = 0
    this.heardChannel = null
    this.deviceSendPort = null
    this.deviceSendChannel = null
    this.deviceChecked = false
    this.settings = null
    this.settingsAdvice = []
    this.settingsError = null
    this.echo.clear()
    this.baseline = null
    this.baselineKey = ''
    this.sendFailed = false
  }

  /** Listen and send through this `MIDIAccess` — the browser's, or a test's stand-in — picking the ports now. */
  attachTo(access: MIDIAccess): void {
    this.access = access
    this.attach()
  }

  /**
   * Listen on every Deluge input port. The firmware sends feedback to *all*
   * USB cables (`MidiEngine::sendUsbMidi`: "we send to all cables"), so the
   * same CC arrives two or three times; applying an absolute value twice is
   * the same as applying it once, which is cheaper than guessing which port
   * the user has left enabled for output.
   */
  private attach(): void {
    this.detach()
    const all = [...(this.access?.inputs.values() ?? [])]
    const deluge = all.filter((p) => /deluge/i.test(p.name ?? ''))
    // A Deluge reached over DIN through some other interface has none of its
    // name on the port, so fall back to everything rather than to nothing.
    const chosen = deluge.length ? deluge : all
    for (const port of chosen) {
      port.addEventListener('midimessage', this.onMessage)
      // A port that will not open is still listed — the listener is on it —
      // but the refusal is said, not dropped on the floor as an unhandled rejection.
      void port.open().catch((e: unknown) => {
        this.error = `${port.name ?? 'MIDI in'}: ${errorText(e)}`
      })
    }
    this.listening = chosen
    this.ports = chosen.map((p) => p.name ?? 'MIDI in')
    // Exactly one output, never all of them: with the instrument's takeover
    // mode set to RELATIVE a CC is an increment, so the same message on three
    // cables would move the parameter three times.
    //
    // And only a port that names itself a Deluge. Sending is the direction
    // that changes something outside this page, and a CC that lands on the
    // wrong device is not a no-op there either — it can trip a learned
    // command or be recorded into whatever is armed. Listening falls back to
    // every port because hearing the wrong port costs nothing; this cannot,
    // so with no Deluge output the Send button stays disabled and says why.
    const outs = [...(this.access?.outputs.values() ?? [])].filter((o) => /deluge/i.test(o.name ?? ''))
    // Which Deluge cable, not just which device. Only cable 2 has MPE zones by
    // default, so a follow channel set to a zone matches there and nowhere
    // else, and a plain one matches anywhere else and not there. Until the
    // instrument's settings have been read there is nothing to go on, so the
    // first is used and the readout is what corrects it.
    const wanted = this.deviceSendPort
    this.out =
      (wanted === null ? undefined : outs.find((o) => portNumber(o.name) === wanted)) ?? outs[0] ?? null
    this.sendPort = this.out?.name ?? null
    if (this.out === null) this.sending = false
    if (chosen.length === 0) {
      this.status = 'error'
      this.error = 'No MIDI input found — connect the Deluge over USB.'
    }
  }

  private detach(): void {
    for (const port of this.listening) port.removeEventListener('midimessage', this.onMessage)
    this.listening = []
    this.ports = []
  }

  /** Exposed for tests: apply one raw MIDI message as if it had arrived on a port. */
  receive(e: MIDIMessageEvent): void {
    if (!this.on || !e.data) return
    const cc = parseControlChange(e.data)
    if (!cc) return
    if (this.channel !== 0 && cc.channel !== this.channel) return
    const name = this.table[cc.cc] ?? null
    this.last = { ...cc, param: name, at: Date.now() }
    this.clearSendError()
    if (name === null) return
    // Our own value coming back is not news, and applying it would count as a
    // move the instrument made.
    const mine = this.echo.get(cc.cc)
    if (mine && mine.value === cc.value && Date.now() - mine.at < Follow.ECHO_FOR) return
    const applied = this.apply(name, cc.value)
    if (applied) {
      // A mapped CC on this channel is proof MIDI-Follow is talking here, and
      // for an MPE zone it is the master channel a send has to go back on.
      this.heardChannel = cc.channel
      this.applied += 1
      this.glow = { ...this.glow, [name]: Date.now() }
      // An applied CC is the new baseline, or the send watcher would read it
      // as an editor move and bounce it straight back.
      this.baseline?.set(cc.cc, cc.value)
    }
  }

  /** Write one mapped CC into the preset. Returns whether there was anywhere to put it. */
  private apply(name: string, value: number): boolean {
    const preset = editor.preset
    if (!preset) return false
    if (this.onBus) {
      const slot = KIT_FOLLOW_SLOTS[name]
      if (!slot || !isKit(preset)) return false
      applyFollowCC(preset, slot, value, true)
      return true
    }
    const sound = editor.sound
    const slot = SOUND_FOLLOW_SLOTS[name]
    if (!sound || !slot) return false
    applyFollowCC(sound, slot, value, false)
    return true
  }

  /**
   * Offer the current values of every mapped parameter; anything that changed
   * since the last offer is an editor move and goes out as a CC.
   *
   * The caller (`FollowView`) computes the snapshot reactively, so this covers
   * every way a value can change here — a knob drag, the filter curve, the
   * ADSR handles, the keyboard — rather than one hook per control. `key`
   * identifies what the snapshot was taken from; when it changes (another kit
   * row, the bus switch, a different file) the new values are adopted silently
   * instead of being played at the instrument as if they were edits.
   */
  push(snapshot: Map<number, number>, key: string): void {
    if (!this.on) return
    if (this.baseline === null || this.baselineKey !== key) {
      this.baseline = new Map(snapshot)
      this.baselineKey = key
      return
    }
    for (const [cc, value] of snapshot) {
      if (this.baseline.get(cc) === value) continue
      this.baseline.set(cc, value)
      this.emit(cc, value)
    }
    // A value the file no longer has (an attribute reverted away) stops being
    // tracked; there is no CC for "unset", so nothing is sent.
    for (const cc of [...this.baseline.keys()]) if (!snapshot.has(cc)) this.baseline.delete(cc)
  }

  private emit(cc: number, value: number): void {
    const channel = this.outChannel
    if (!this.sending || !this.out || channel === null) return
    try {
      this.out.send(controlChange(channel, cc, value))
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.sendFailed = true
      return
    }
    this.clearSendError()
    this.echo.set(cc, { value, at: Date.now() })
    this.sent += 1
  }

  /** The wire works again: a failed send's message has had its say. */
  private clearSendError(): void {
    if (!this.sendFailed) return
    this.sendFailed = false
    this.error = null
  }

  /**
   * Ask the Deluge what its MIDI-Follow settings actually are.
   *
   * Over the card protocol, not over MIDI, because the settings are not on the
   * wire at all. Connecting is the card store's job and it prompts for the
   * same Web MIDI permission this mode already holds, so it is one button.
   */
  async checkDevice(): Promise<void> {
    this.checking = true
    this.settingsError = null
    try {
      if (!(await card.ensureConnected())) {
        this.settingsError = card.error ?? 'Could not reach the Deluge over USB.'
        return
      }
      const bytes = await this.readSetting('MIDIFollow.XML')
      const parsed = parseFollowSettings(new TextDecoder().decode(bytes))
      /*
       * And the MPE zones, which decide whether a follow channel set to a zone
       * can match anything at all. The firmware writes this file only when
       * something is worth writing and deletes it otherwise
       * (`MIDIDeviceManager::writeDevicesToFile`), so "no such file" is an
       * answer — there are no zones — while a transfer that fails for any
       * other reason is not, and leaves the advice hedged rather than
       * asserting something the card never confirmed.
       */
      let zones: Record<string, MpeZones> | undefined
      try {
        const dev = await this.readSetting('MIDIDevices.XML')
        zones = parseMpeInputs(new TextDecoder().decode(dev))
      } catch {
        // Absent is an answer: the firmware writes the file only when there is
        // something worth writing, so its absence means every cable is on its
        // built-in defaults, which `cableZones` supplies. Any other failure is
        // not an answer, but leaves the defaults in play too — they are the
        // best available guess either way, and the advice says which port it
        // is relying on. So both outcomes end the same way.
        zones = undefined
      }
      this.settings = parsed
      this.settingsAdvice = followAdvice(parsed, zones)
      const target = chooseSendTarget(parsed, zones)
      this.deviceSendPort = target?.port ?? null
      this.deviceSendChannel = target?.channel ?? null
      this.deviceChecked = true
      // The port is half the answer, so re-pick the output now that it is known.
      this.attach()
    } catch (e) {
      this.settingsError = `Could not read the Deluge’s settings: ${errorText(e)}`
    } finally {
      this.checking = false
    }
  }

  /**
   * One of the settings files, wherever this firmware keeps it. Community
   * 1.3 moved them into `SETTINGS/`
   * (`MIDIDeviceManager::readDevicesFromFile` still renames the old path), so
   * a card written by earlier firmware has them at the root. Paths in the
   * protocol's leading-slash form, as every card read is (`cardPath`).
   */
  private async readSetting(name: string): Promise<Uint8Array> {
    try {
      return await card.readFile(cardPath(`SETTINGS/${name}`))
    } catch (e) {
      if (e instanceof SysexError && (e.code === FR_NO_FILE || e.code === FR_NO_PATH)) {
        return await card.readFile(cardPath(name))
      }
      throw e
    }
  }

  private expireGlow(): void {
    const cutoff = Date.now() - GLOW_FOR
    const kept = Object.entries(this.glow).filter(([, at]) => at > cutoff)
    if (kept.length !== Object.keys(this.glow).length) this.glow = Object.fromEntries(kept)
  }
}

/**
 * SysEx first, so a page that already holds the card panel's permission does
 * not prompt again; plain MIDI is enough for control change, so a refusal of
 * the SysEx grant alone must not take Follow Mode down with it.
 */
async function requestAccess(): Promise<MIDIAccess> {
  try {
    return await navigator.requestMIDIAccess({ sysex: true })
  } catch {
    return await navigator.requestMIDIAccess()
  }
}

export const follow = new Follow()
