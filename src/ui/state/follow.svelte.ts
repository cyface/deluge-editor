/**
 * Follow Mode: mirror the Deluge's own knob moves into the editor.
 *
 * With MIDI Follow feedback enabled on the instrument
 * (`SETTINGS > MIDI > MIDI-Follow > Feedback > Channel`), the Deluge sends a
 * CC whenever a value in the active context changes — a gold encoder, the
 * select encoder in a menu, a context switch. This store listens for those,
 * resolves each through the firmware's default CC map
 * (`src/core/midi/follow.ts`) and writes the value where the firmware writes
 * it (`src/core/preset/follow.ts`).
 *
 * It listens by default. Sending — moving a control here and having the
 * instrument follow — is a second switch, off until asked for, because that
 * direction writes into the live sound on the device (see docs/decisions.md).
 *
 * The honesty problem this mode exists to solve: a follow CC says *a* value
 * changed on the instrument, never *which sound* it belongs to. If the loaded
 * preset is not what the Deluge has in its active clip, mirroring writes the
 * device's numbers into an unrelated file. So it is a mode you turn on, with
 * its own view of only the parameters follow can reach, and — like every other
 * edit here — nothing is committed until you save.
 */

import { controlChange, followMap, parseControlChange } from '../../core/midi/follow'
import { isKit } from '../../core/preset'
import { KIT_FOLLOW_SLOTS, SOUND_FOLLOW_SLOTS, applyFollowCC, type FollowSlot } from '../../core/preset/follow'
import { editor } from './editor.svelte'

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

class Follow {
  /** Follow Mode is on: the page shows the follow view and CCs are applied. */
  on = $state(false)
  status = $state<'off' | 'listening' | 'error'>('off')
  error = $state<string | null>(null)
  /** Input ports being listened to, by name. */
  ports = $state<string[]>([])
  /** 0 = any channel; otherwise 1–16, matching the instrument's numbering. */
  channel = $state(0)
  /** Kit only: the kit bus (AFFECT ENTIRE on) or the selected row (off). */
  target = $state<FollowTarget>('row')
  last = $state<SeenCC | null>(null)
  /** CCs applied since the mode was last switched on. */
  applied = $state(0)
  /** Parameter names touched in the last moment, for the view's glow. */
  glow = $state<Record<string, number>>({})

  /** Send editor moves back to the instrument. Off until asked for. */
  sending = $state(false)
  /**
   * The channel sends go out on. Unlike listening there is no "any": a CC only
   * reaches the instrument's follow handler when its channel matches one of
   * MIDI-Follow's A/B/C (`MidiFollow::checkMidiFollowMatch`).
   */
  sendChannel = $state(1)
  /** The output port sends go out on, by name. */
  sendPort = $state<string | null>(null)
  /** CCs sent since the mode was last switched on. */
  sent = $state(0)

  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator

  /** The default CC map of the selected firmware, or null where follow does not exist. */
  readonly map = $derived(followMap(editor.version))
  /** Whether the top bar offers the mode at all. */
  readonly available = $derived(this.map !== null)
  /** True while the CCs land on the kit bus rather than a row's sound. */
  readonly onBus = $derived(editor.preset !== null && isKit(editor.preset) && this.target === 'bus')

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
    // The readouts describe a session of listening; leaving the mode ends it,
    // and a stale "42 applied" over a fresh session would be a lie.
    this.glow = {}
    this.last = null
    this.applied = 0
    this.sent = 0
    this.echo.clear()
    this.baseline = null
    this.baselineKey = ''
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
      void port.open()
    }
    this.listening = chosen
    this.ports = chosen.map((p) => p.name ?? 'MIDI in')
    // Exactly one output, never all of them: with the instrument's takeover
    // mode set to RELATIVE a CC is an increment, so the same message on three
    // cables would move the parameter three times.
    const outs = [...(this.access?.outputs.values() ?? [])]
    this.out = outs.find((o) => /deluge/i.test(o.name ?? '')) ?? outs[0] ?? null
    this.sendPort = this.out?.name ?? null
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
    if (name === null) return
    // Our own value coming back is not news, and applying it would count as a
    // move the instrument made.
    const mine = this.echo.get(cc.cc)
    if (mine && mine.value === cc.value && Date.now() - mine.at < Follow.ECHO_FOR) return
    const applied = this.apply(name, cc.value)
    if (applied) {
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
    if (!this.sending || !this.out) return
    try {
      this.out.send(controlChange(this.sendChannel, cc, value))
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      return
    }
    this.echo.set(cc, { value, at: Date.now() })
    this.sent += 1
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
