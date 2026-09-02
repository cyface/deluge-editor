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
  import { setAttr } from '../core/xml'
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

  /** The follow parameters gathered into the flow blocks that show them. */
  const blocks = $derived.by<{ group: Group; entries: Entry[] }[]>(() => {
    const order = [...gridGroups(), KIT_GROUP]
    const byId = new Map<string, Entry[]>()
    for (const e of follow.slots) {
      // On the kit bus the two parameters no sound has — the kit's own pitch
      // and its ducking amount — have no owning block, so they land on the bus.
      const id = groupOf(e.name)?.id ?? KIT_GROUP.id
      const list = byId.get(id)
      if (list) list.push(e)
      else byId.set(id, [e])
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
    {#if kit}
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
    <span class="count" data-testid="follow-applied">{follow.applied} applied</span>
    <span class="rule" aria-hidden="true"></span>
    <!-- The other direction, off until asked for: this one writes into the
         sound the instrument has live (docs/decisions.md). -->
    <button
      type="button"
      class="sendbtn"
      class:on={follow.sending}
      data-testid="follow-send"
      aria-pressed={follow.sending}
      disabled={follow.sendPort === null}
      title={HELP['follow.send']}
      onclick={() => (follow.sending = !follow.sending)}
    >Send</button>
    <label class="pick" title={HELP['follow.sendChannel']}>
      on ch
      <select data-testid="follow-send-channel" disabled={!follow.sending} bind:value={follow.sendChannel}>
        {#each sendChannels as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
    {#if follow.sending}<span class="count" data-testid="follow-sent">{follow.sent} sent</span>{/if}
  </div>
  {#if follow.error}
    <p class="err" role="alert" data-testid="follow-error">{follow.error}</p>
  {:else}
    <p class="note">
      Turn a gold encoder on the Deluge and the matching control moves here.
      The instrument needs a feedback channel set under
      <code>SETTINGS &gt; MIDI &gt; MIDI-Follow &gt; Feedback</code>{#if follow.ports.length}, and this is
      listening on {follow.ports.join(', ')}{/if}. A follow CC says a value changed on the
      instrument, never which sound it belongs to — these edits land on
      {onBus ? 'the kit bus' : editor.fileName || 'the loaded preset'} whether or not that is what the
      Deluge has open, and like every edit here nothing is written until you save.
      {#if follow.sending}
        <strong>Sending on {follow.sendPort} channel {follow.sendChannel}</strong> — moving a control here
        changes the instrument’s active sound, and lands exactly only with MIDI-Follow’s takeover mode on
        JUMP (its default). On PICKUP or SCALE the instrument waits until the values meet; on RELATIVE it
        reads every value as an increment and will run away.
      {/if}
    </p>
  {/if}
</section>

{#snippet slotKnob(e: Entry, disabled = false, disabledNote: string | undefined = undefined)}
  <span class="slot" class:lit={follow.glow[e.name] !== undefined} data-follow-cc={e.cc}>
    <HexKnob
      el={slotElement(root!, e.slot)}
      ensure={() => ensureSlotElement(root!, e.slot, onBus)}
      attr={e.slot.attr}
      label={paramLabel(e.name)}
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
              {#if b.group.id === 'filters'}
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
              {:else if b.group.id === 'osc' && (drawsPulse(1) || drawsPulse(2))}
                {#each [1, 2] as const as on (on)}
                  {#if drawsPulse(on)}
                    <PulseGraph sound={root as SoundElement} n={on} type={oscType(on)} />
                  {/if}
                {/each}
                <div class="knobrow">
                  {#each b.entries as e (e.cc)}{@render slotKnob(e)}{/each}
                </div>
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
  .note strong { color: #e8b06a; font-weight: 600; }
  .count { font-family: var(--mono); font-size: 10.5px; color: var(--faint); }
  .note { margin: 8px 0 0; font-size: 11px; color: var(--faint); line-height: 1.55; }
  .note code { font-family: var(--mono); font-size: 10px; color: var(--muted); }
  .err { margin: 8px 0 0; font-family: var(--mono); font-size: 11px; color: #e8a08f; }
  .grid { padding: 10px 0 0; display: grid; align-items: start; }
  .stack { min-width: 0; }
  /* A parameter the instrument just moved: a brief ring, so a knob sweep is
     visible even when the number lands on the step it was already showing. */
  .slot { display: inline-flex; border-radius: 6px; box-shadow: 0 0 0 0 rgba(103, 196, 92, 0); transition: box-shadow .35s ease-out; }
  .slot.lit { box-shadow: 0 0 0 2px rgba(103, 196, 92, .55); }
</style>
