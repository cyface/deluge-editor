<script lang="ts">
  /**
   * Follow Mode's page: only the parameters MIDI Follow can actually reach.
   *
   * The subset is not a curation — it is the firmware's own default CC map for
   * the selected firmware (`src/core/midi/follow.ts`), laid out in the same
   * blocks and the same knobs as the full editor, so a knob that moved on the
   * instrument is found where it always is. A parameter the map does not
   * cover is absent rather than greyed out, for the reason every other
   * unsupported control is absent here (docs/decisions.md).
   *
   * The view also owns the outgoing half: it derives the CC value of every
   * mapped parameter and hands the lot to the store on each change, so Send
   * covers every way a value can move here rather than one hook per control.
   */
  import { hexToInt } from '../core/params/hex'
  import { paramValueToCc } from '../core/midi/follow'
  import { paramLabel, type KitElement, type SoundElement } from '../core/preset'
  import { KIT_FOLLOW_SLOTS, SOUND_FOLLOW_SLOTS, ensureSlotElement, slotElement, slotHex, slotOrder, slotScale } from '../core/preset/follow'
  import { envelope, hexToMenu, lfo as lfoElement, menuToHex, osc, oscHasFile } from '../core/preset/sound'
  import { pulseWidthOffered } from '../core/params/pulse'
  import { MOD_FX_ATTR_KNOB, modFxEnabled, modFxKnobLabel, modFxOffered } from '../core/params/modfx'
  import type { ModFxType } from '../core/preset/enums'
  import { KIT_ATTR_ORDER, SOUND_ATTR_ORDER } from '../core/preset/order'
  import { setAttr } from '../core/xml'
  import FollowHelp from './FollowHelp.svelte'
  import Select from './controls/Select.svelte'
  import { modFxOptions } from './options'
  import EnvGraph from './controls/EnvGraph.svelte'
  import FilterGraph, { type FilterBinding } from './controls/FilterGraph.svelte'
  import HexKnob from './controls/HexKnob.svelte'
  import LfoGraph from './controls/LfoGraph.svelte'
  import PulseGraph from './controls/PulseGraph.svelte'
  import Panel from './controls/Panel.svelte'
  import Seg from './controls/Seg.svelte'
  import { KIT_GROUP, groupOf, gridGroups, type Group } from './groups'
  import { HELP } from './help'
  import { GAP, MAX_COL, columnCount, splitStacks } from './masonry'
  import { editor } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'

  interface Props { sound: SoundElement | null; kit?: KitElement }
  let { sound, kit }: Props = $props()

  const onBus = $derived(follow.onBus)
  /** What the CCs land on: the kit's own element, or the sound being edited. */
  const root = $derived<SoundElement | KitElement | null>(onBus ? (kit ?? null) : sound)

  type Entry = { cc: number; name: string; slot: (typeof follow.slots)[number]['slot'] }

  /*
   * Mod FX is one slot with four knobs, and most of the eight things it can be
   * read only two of them. The knobs here follow the firmware's own menu
   * relevance, exactly as the full editor's panel does — a follow CC for a
   * knob this type ignores would move a number the instrument is not reading.
   * The type itself is not a follow parameter and cannot be: it is a member of
   * `ModControllableAudio`, not a modulation param, so no CC addresses it and
   * no feedback reports it. That is why the panel carries its select. It is
   * the one control here that follow cannot reach, and it is allowed in
   * because it is the gate on the other four rather than a fifth of them —
   * without it, turning Mod FX back on would mean leaving the mode.
   */
  const modFxType = $derived((root?.attrs.modFXType ?? 'none') as ModFxType)
  const modFxOn = $derived(modFxEnabled(modFxType))
  const showsEntry = (e: Entry): boolean => {
    const knob = MOD_FX_ATTR_KNOB[e.slot.attr]
    return knob === undefined || modFxOffered(modFxType, knob)
  }

  /** The follow parameters gathered into the flow blocks that show them. */
  const blocks = $derived.by<{ group: Group; entries: Entry[] }[]>(() => {
    const order = [...gridGroups(), KIT_GROUP]
    const byId = new Map<string, Entry[]>()
    for (const e of follow.slots) {
      // On the kit bus the two parameters no sound has — the kit's own pitch
      // and its ducking amount — have no owning block, so they land on the bus.
      const id = groupOf(e.name)?.id ?? KIT_GROUP.id
      const list = byId.get(id) ?? []
      if (!byId.has(id)) byId.set(id, list)
      // A knob this Mod FX type does not read leaves the block but not the
      // grid: the block keeps its place, because its select is the only way
      // to turn the slot back on without leaving the mode.
      if (showsEntry(e)) list.push(e)
    }
    return order
      .filter((g, i) => order.indexOf(g) === i && byId.has(g.id))
      .map((group) => ({ group, entries: byId.get(group.id)! }))
  })

  /*
   * The same measured masonry the Overview uses (`masonry.ts`): a knob row
   * wraps at whatever width the column ends up, so a panel's height is not
   * predictable from its knob count and has to be measured. The blocks here
   * are single panels — the Overview's unsplittable pairs and its forced kit
   * break are its own layout policy, not this one's.
   */
  let width = $state(typeof document === 'undefined' ? 1200 : document.documentElement.clientWidth - 64)
  let heights = $state<Record<string, number>>({})
  const FALLBACK_HEIGHT = 220

  const cols = $derived(columnCount(width, blocks.length))
  const stacks = $derived(
    splitStacks(blocks, blocks.map((b) => (heights[b.group.id] ?? FALLBACK_HEIGHT) + GAP), cols),
  )

  const observed = new Map<Element, string>()
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    for (const e of entries) {
      const id = observed.get(e.target)
      if (id === undefined) continue
      const h = e.contentRect.height
      if (Math.abs((heights[id] ?? -1) - h) > 0.5) heights[id] = h
    }
  })
  function measure(node: HTMLElement, id: string) {
    observed.set(node, id)
    ro?.observe(node)
    return {
      destroy() {
        observed.delete(node)
        ro?.unobserve(node)
      },
    }
  }

  /*
   * Every panel whose picture is the control keeps it: the filter response,
   * the ADSR overlay, the LFO shape and the oscillators' pulse width are the
   * same components the full editor uses, over the same values, so a cutoff
   * sweep on the instrument draws itself here. All four are draggable, like
   * every other control in this view.
   */
  const slots = $derived(onBus ? KIT_FOLLOW_SLOTS : SOUND_FOLLOW_SLOTS)
  const filters = $derived<FilterBinding>({
    attr: (name) => root?.attrs[name],
    read: (p) => {
      const slot = slots[p]
      const hex = root && slot ? slotHex(root, slot) : undefined
      return hex === undefined ? undefined : hexToMenu(hex, 'standard')
    },
    write: (p, menu) => {
      const slot = slots[p]
      if (!root || !slot) return
      setAttr(ensureSlotElement(root, slot, onBus), slot.attr, menuToHex(menu, 'standard'), slotOrder(slot, onBus))
    },
  })

  /*
   * Envelopes and LFOs are tabbed here as they are in the full editor: four of
   * each, one on screen at a time, rather than twenty knobs in a column. Which
   * one is on screen follows the instrument — a CC for envelope 3 selects
   * envelope 3 — since that is the whole idea of the mode, and a mirrored move
   * on a hidden tab would be a move you never saw.
   */
  const envs = $derived([1, 2, 3, 4].filter((n) => follow.slots.some((e) => e.name.startsWith(`env${n}`))))
  const lfos = $derived([1, 2, 3, 4].filter((n) => follow.slots.some((e) => e.name === `lfo${n}Rate`)))
  let envSel = $state(1)
  let lfoSel = $state(1)
  $effect(() => {
    if (envs.length && !envs.includes(envSel)) envSel = envs[0]
  })
  $effect(() => {
    if (lfos.length && !lfos.includes(lfoSel)) lfoSel = lfos[0]
  })
  $effect(() => {
    const name = follow.last?.param
    if (!name) return
    const env = /^env([1-4])/.exec(name)
    if (env) envSel = Number(env[1])
    const lfo = /^lfo([1-4])Rate$/.exec(name)
    if (lfo) lfoSel = Number(lfo[1])
  })

  /*
   * The oscillators' picture, on the same terms as the filter's and the
   * envelopes': both pulse widths are follow-mapped (CC 23 and 28), so a knob
   * moved on the instrument redraws the wave here. Only where the firmware
   * offers the control, which is the panel's own rule everywhere else — and
   * never on the kit bus, which has no oscillators to draw.
   */
  const fm = $derived(!onBus && (root as SoundElement | null)?.attrs.mode === 'fm')
  const oscType = (n: 1 | 2): string =>
    fm ? 'sine' : (osc(root as SoundElement, n)?.attrs.type ?? 'square')
  function drawsPulse(n: 1 | 2): boolean {
    if (onBus || root === null) return false
    if (!follow.slots.some((e) => e.name === `osc${n === 1 ? 'A' : 'B'}PhaseWidth`)) return false
    const type = oscType(n)
    return type !== 'dx7' && pulseWidthOffered(type, { fm, fileLoaded: oscHasFile(osc(root as SoundElement, n)) })
  }

  /*
   * The oscillator block is five sources' worth of knobs — two carriers, two
   * modulators and noise — and one seventeen-knob grid hides which is which.
   * They are sub-grouped as the full editor's panel is (`OscGroup.svelte`),
   * under the same headings, in the firmware's own parameter order within
   * each, with each label shortened to what its heading does not already say.
   * A sub-group the map has no CC for is absent, like everything else here.
   * A parameter is one knob however many CCs reach it: a map that sends two
   * CCs to one parameter (c1.3 betas before #4528 did, to osc A's wave index)
   * would otherwise draw two knobs on one value.
   */
  const OSC_SUBS: { id: string; title: string; osc?: 1 | 2; names: string[] }[] = [
    { id: 'a', title: 'Osc A', osc: 1, names: ['oscAPitch', 'oscAVolume', 'oscAPhaseWidth', 'oscAWavetablePosition', 'carrier1Feedback'] },
    { id: 'b', title: 'Osc B', osc: 2, names: ['oscBPitch', 'oscBVolume', 'oscBPhaseWidth', 'oscBWavetablePosition', 'carrier2Feedback'] },
    { id: 'mod1', title: 'Mod 1', names: ['modulator1Pitch', 'modulator1Volume', 'modulator1Feedback'] },
    { id: 'mod2', title: 'Mod 2', names: ['modulator2Pitch', 'modulator2Volume', 'modulator2Feedback'] },
    { id: 'noise', title: 'Noise', names: ['noiseVolume'] },
  ]
  function oscSubs(entries: Entry[]) {
    const placed = new Set<Entry>()
    const subs = OSC_SUBS.map((s) => {
      const list: Entry[] = []
      for (const n of s.names) {
        const same = entries.filter((e) => e.name === n)
        for (const e of same) placed.add(e)
        if (same.length) list.push(same[0])
      }
      return { ...s, entries: list }
    }).filter((s) => s.entries.length)
    // A follow parameter this table does not know lands after the sub-groups
    // rather than vanishing: the map is the firmware's, and it may grow.
    return { subs, rest: entries.filter((e) => !placed.has(e)) }
  }
  const shortLabel = (title: string, name: string): string => {
    const l = paramLabel(name)
    return l.startsWith(`${title} `) ? l.slice(title.length + 1) : l
  }

  /** The stages of the selected envelope, in the order the firmware writes them. */
  const STAGES = ['Attack', 'Decay', 'Sustain', 'Release']
  const envEntries = $derived(
    STAGES.map((st) => follow.slots.find((e) => e.name === `env${envSel}${st}`)).filter((e) => e !== undefined),
  )
  const lfoEntries = $derived(follow.slots.filter((e) => e.name === `lfo${lfoSel}Rate`))
  /*
   * A synced LFO's rate is a value the firmware never reads
   * (`Sound::getGlobalLFOPhaseIncrement`). The CC still exists and the
   * instrument will still send it, so the knob stays and keeps showing what is
   * stored — it just takes no input here, as in the full editor.
   */
  const lfoSynced = $derived(
    !onBus && root !== null && (lfoElement(root as SoundElement, lfoSel as 1 | 2 | 3 | 4)?.attrs.syncLevel ?? '0') !== '0',
  )
  const SYNCED_NOTE = 'Disabled by tempo sync — the Deluge takes this LFO’s speed from the song, not from this value.'

  /*
   * Sending: the current CC value of every mapped parameter, offered to the
   * store on every change. Derived rather than hooked into each control, so a
   * value moved by the filter curve or an ADSR handle travels like one moved
   * by its knob. The key tells the store when a snapshot belongs to something
   * else — another row, the bus, another file — so switching does not play the
   * new values at the instrument as if they were edits.
   */
  const outgoing = $derived.by(() => {
    const m = new Map<number, number>()
    if (!root) return m
    for (const e of follow.slots) {
      const hex = slotHex(root, e.slot)
      if (hex === undefined) continue
      m.set(e.cc, paramValueToCc(hexToInt(hex), slotScale(e.slot) === 'half'))
    }
    return m
  })
  const outgoingKey = $derived(`${editor.fileName}|${onBus ? 'bus' : `row${editor.row}`}|${follow.slots.length}`)
  $effect(() => {
    follow.push(outgoing, outgoingKey)
  })

  let helpOpen = $state(false)

  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  const sendChannels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  const lastLine = $derived.by(() => {
    const l = follow.last
    if (!l) return 'nothing heard yet'
    return `ch ${l.channel} · CC ${l.cc} = ${l.value} → ${l.param ? paramLabel(l.param) : 'unmapped'}`
  })
</script>

<section class="hdr" data-testid="follow-header">
  <div class="row">
    <span class="tag" class:live={follow.status === 'listening'}>{follow.status === 'listening' ? 'Following' : follow.status === 'error' ? 'Not listening' : 'Off'}</span>
    <label class="pick" title={HELP['follow.channel']}>
      Channel
      <select data-testid="follow-channel" bind:value={follow.channel}>
        {#each channels as c (c)}<option value={c}>{c === 0 ? 'Any' : c}</option>{/each}
      </select>
    </label>
    <span class="rule" aria-hidden="true"></span>
    <!-- The other direction, and the one that can do harm: this writes into
         the sound the instrument has live (docs/decisions.md). It sits beside
         the listening channel because the two channels are the thing to get
         right, and a CC that misses MIDI-Follow is still a CC the instrument
         acts on. -->
    <button
      type="button"
      class="sendbtn"
      class:on={follow.sending}
      data-testid="follow-send"
      aria-pressed={follow.sending}
      disabled={follow.sendPort === null}
      title={follow.sendPort === null ? 'No Deluge MIDI output found. Sending goes only to a port that names itself a Deluge, so a CC cannot land on some other instrument.' : HELP['follow.send']}
      onclick={() => (follow.sending = !follow.sending)}
    >Send</button>
    <label class="pick" title={HELP['follow.sendChannel']}>
      on ch
      <!-- Heard is the default and the only setting that is right whatever the
           instrument's follow channel is set to, an MPE zone included. -->
      <select data-testid="follow-send-channel" disabled={!follow.sending} bind:value={follow.sendChannel}>
        <option value="auto">Heard{follow.heardChannel === null ? '' : ` · ${follow.heardChannel}`}</option>
        {#each sendChannels as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
    {#if kit}
      <span class="rule" aria-hidden="true"></span>
      <!-- The instrument routes a kit clip's follow CCs by AFFECT ENTIRE: on,
           they reach the kit bus; off, the selected row's sound
           (`MidiFollow::getModelStackWithParamForKitClip`). Nothing on the wire
           says which, so it is set here to match the instrument. -->
      <div class="target" role="group" aria-label="Follow target" title={HELP['follow.target']}>
        <button type="button" class:on={!onBus} data-testid="follow-target-row" onclick={() => (follow.target = 'row')}>Selected row</button>
        <button type="button" class:on={onBus} data-testid="follow-target-bus" onclick={() => (follow.target = 'bus')}>Kit bus</button>
      </div>
    {/if}
    <span class="last" data-testid="follow-last">{lastLine}</span>
    <button type="button" class="helpbtn" data-testid="follow-help-button" onclick={() => (helpOpen = true)}>MIDI Follow Help</button>
  </div>
  {#if follow.error}
    <p class="err" role="alert" data-testid="follow-error">{follow.error}</p>
  {:else if follow.sending}
    <!-- One line, only while the hazard is live. The rest of the explanation
         is behind the help button, where it is not in the way. -->
    <p class="sendwarn" data-testid="follow-send-warning">
      {#if follow.outChannel === null}
        Waiting to hear the Deluge before sending. Turn a gold encoder on the instrument, and the channel
        its feedback arrives on becomes the channel sends go out on.
      {:else}
        Sending on {follow.sendPort} channel {follow.outChannel} — this changes the sound the Deluge has
        live.{#if !follow.deviceChecked} Read the Deluge’s settings from the help sheet if it does not
        respond: which of its USB ports a CC goes out on decides whether MIDI-Follow accepts it.{/if}
      {/if}
    </p>
  {/if}
</section>

{#if helpOpen}<FollowHelp onclose={() => (helpOpen = false)} />{/if}

{#snippet slotKnob(e: Entry, disabled = false, disabledNote: string | undefined = undefined, label: string | undefined = undefined)}
  <span class="slot" class:lit={follow.glow[e.name] !== undefined} data-follow-cc={e.cc}>
    <HexKnob
      el={slotElement(root!, e.slot)}
      ensure={() => ensureSlotElement(root!, e.slot, onBus)}
      attr={e.slot.attr}
      label={label ?? paramLabel(e.name)}
      scale={slotScale(e.slot)}
      order={slotOrder(e.slot, onBus)}
      sound={onBus ? undefined : (root as SoundElement)}
      dest={e.name}
      {disabled}
      {disabledNote}
    />
  </span>
{/snippet}

{#if root === null}
  <p class="empty">Select a kit row to follow it.</p>
{:else}
  <main
    class="grid"
    data-testid="follow-grid"
    bind:clientWidth={width}
    style="grid-template-columns: repeat({cols}, minmax(0, {MAX_COL}px)); column-gap: {GAP}px"
  >
    {#each stacks as stack, i (i)}
      <div class="stack">
        {#each stack as b (b.group.id)}
          <div use:measure={b.group.id}>
            <Panel group={b.group} sub={`${b.entries.length} CC${b.entries.length === 1 ? '' : 's'}`}>
              {#if b.group.id === 'modfx'}
                <!-- The type is not a follow parameter and never can be, so it
                     is set here rather than mirrored. Its knobs come and go by
                     the firmware's own menu relevance. -->
                <div class="fields">
                  <Select
                    label="Type"
                    name="modFXType"
                    value={root!.attrs.modFXType}
                    options={modFxOptions(editor.supports)}
                    title={HELP['sound.modFXType']}
                    onchange={(v) => setAttr(root!, 'modFXType', v, onBus ? KIT_ATTR_ORDER : SOUND_ATTR_ORDER)}
                  />
                </div>
                <p class="gate" data-testid="follow-modfx-note">
                  {#if modFxOn}
                    These land only while Mod FX is set to something. The Deluge ignores the knobs this
                    type does not read, so they are not shown.
                  {:else}
                    Mod FX is off in this preset, so these CCs change nothing you can hear. Pick a type to
                    get its controls.
                  {/if}
                </p>
                {#if b.entries.length}
                  <div class="knobrow">
                    {#each b.entries as e (e.cc)}{@render slotKnob(e, false, undefined, modFxKnobLabel(modFxType, MOD_FX_ATTR_KNOB[e.slot.attr]))}{/each}
                  </div>
                {/if}
              {:else if b.group.id === 'filters'}
                <FilterGraph {filters} />
                <div class="knobrow">
                  {#each b.entries as e (e.cc)}{@render slotKnob(e)}{/each}
                </div>
              {:else if b.group.id === 'mods' && envs.length}
                <div class="h3">Envelopes</div>
                <Seg
                  items={envs.map((n) => ({
                    id: n,
                    label: String(n),
                    idle: !envelope(root as SoundElement, n as 1 | 2 | 3 | 4),
                    title: n === 1 ? 'Envelope 1 is hardwired to volume' : `Envelope ${n}`,
                  }))}
                  selected={envSel}
                  onselect={(n) => (envSel = n)}
                />
                <EnvGraph sound={root as SoundElement} selected={envSel} available={envs} />
                <div class="knobrow">
                  {#each envEntries as e (e.cc)}{@render slotKnob(e)}{/each}
                </div>
                {#if lfos.length}
                  <div class="h3">LFOs</div>
                  <Seg
                    items={lfos.map((n) => ({ id: n, label: String(n), title: `LFO ${n}` }))}
                    selected={lfoSel}
                    onselect={(n) => (lfoSel = n)}
                  />
                  <LfoGraph sound={root as SoundElement} selected={lfoSel as 1 | 2 | 3 | 4} available={lfos} />
                  <div class="knobrow">
                    {#each lfoEntries as e (e.cc)}{@render slotKnob(e, lfoSynced, SYNCED_NOTE)}{/each}
                  </div>
                {/if}
              {:else if b.group.id === 'osc'}
                {@const { subs, rest } = oscSubs(b.entries)}
                {#each subs as s (s.id)}
                  <div class="h3" data-testid="follow-osc-{s.id}">{s.title}</div>
                  {#if s.osc !== undefined && drawsPulse(s.osc)}
                    <PulseGraph sound={root as SoundElement} n={s.osc} type={oscType(s.osc)} />
                  {/if}
                  <div class="knobrow" data-testid="follow-osc-{s.id}-knobs">
                    {#each s.entries as e (e.cc)}{@render slotKnob(e, false, undefined, shortLabel(s.title, e.name))}{/each}
                  </div>
                {/each}
                {#if rest.length}
                  <div class="knobrow">
                    {#each rest as e (e.cc)}{@render slotKnob(e)}{/each}
                  </div>
                {/if}
              {:else}
                <div class="knobrow">
                  {#each b.entries as e (e.cc)}{@render slotKnob(e)}{/each}
                </div>
              {/if}
            </Panel>
          </div>
        {/each}
      </div>
    {/each}
  </main>
{/if}

<style>
  .hdr { margin: 12px 0 0; border: 1px solid var(--edge); border-radius: 4px; background: linear-gradient(180deg, var(--panel2), var(--panel)); padding: 9px 12px 10px; }
  .row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .tag { font-family: var(--cond); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
  .tag.live { color: #9ed492; }
  .tag.live::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #67c45c; box-shadow: 0 0 6px #67c45c; margin-right: 7px; vertical-align: 1px; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
  .pick { font-family: var(--cond); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
  .pick select { background: #141210; border: 1px solid var(--edge-hi); border-radius: 3px; color: var(--text); font-family: var(--mono); font-size: 10.5px; padding: 2px 4px; }
  .target { display: inline-flex; border: 1px solid var(--edge-hi); border-radius: 3px; overflow: hidden; }
  .target button { background: #141210; border: 0; color: var(--muted); font-family: var(--cond); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; padding: 3px 9px; cursor: pointer; }
  .target button + button { border-left: 1px solid var(--edge-hi); }
  .target button.on { background: #2b2317; color: #f2c67b; }
  .last { font-family: var(--mono); font-size: 10.5px; color: var(--muted); margin-left: auto; }
  .rule { width: 1px; height: 17px; background: var(--edge-hi); }
  .sendbtn { height: 22px; padding: 0 10px; border-radius: 3px; border: 1px solid var(--edge-hi); background: #141210; color: var(--muted); font-family: var(--cond); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .sendbtn:hover:not(:disabled) { color: var(--text); border-color: var(--brass); }
  .sendbtn:disabled { opacity: .45; cursor: default; }
  /* Sending writes to the instrument, so it wears the warning colour the card
     panel uses for "this may not stay as you left it", not the calm green. */
  .sendbtn.on { background: #1d1710; border-color: #6b4a1c; color: #e8b06a; }
  .err { margin: 8px 0 0; font-family: var(--mono); font-size: 11px; color: #e8a08f; }
  /* The one line of prose the header keeps, and only while sending is on. */
  .sendwarn { margin: 8px 0 0; font-size: 11.5px; line-height: 1.5; color: #e8b06a; }
  .helpbtn { height: 22px; padding: 0 10px; border-radius: 3px; border: 1px solid var(--edge-hi); background: #141210; color: var(--muted); font-family: var(--cond); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .helpbtn:hover { color: var(--text); border-color: var(--brass); }
  /* Mod FX's one-line reason, inside the panel rather than the header. */
  .gate { margin: 8px 0 0; font-size: 11px; color: var(--faint); line-height: 1.5; }
  .grid { padding: 10px 0 0; display: grid; align-items: start; }
  .stack { min-width: 0; }
  /* A parameter the instrument just moved: a brief ring, so a knob sweep is
     visible even when the number lands on the step it was already showing. */
  .slot { display: inline-flex; border-radius: 6px; box-shadow: 0 0 0 0 rgba(103, 196, 92, 0); transition: box-shadow .35s ease-out; }
  .slot.lit { box-shadow: 0 0 0 2px rgba(103, 196, 92, .55); }
</style>
