<script lang="ts">
  /**
   * The signal path as a table of contents. Clicking a block filters the
   * overview to it (shift-click pins several); clicking empty strip space
   * expands everything. Modulators sit below; clicking one draws its cables
   * to the blocks it reaches.
   */
  import { tick } from 'svelte'
  import type { PatchSource, SoundElement } from '../core/preset'
  import { cables } from '../core/preset/sound'
  import { groupOf, visibleGroups, type Group } from './groups'
  import { ALL_SOURCES, SOURCE_FEATURE } from '../core/firmware/gates'
  import { sourceColor, sourceHint, sourceName, sourceTip } from './sources'
  import { editor } from './state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()

  const groups = $derived(visibleGroups())
  const srcLane = $derived(groups.filter((g) => g.lane === 'src'))
  const chain = $derived(groups.filter((g) => g.lane === 'chain'))
  const modLane = $derived(groups.filter((g) => g.lane === 'mod'))
  const allCables = $derived(cables(sound))
  const sources = $derived(
    ALL_SOURCES.filter((s) => {
      const f = SOURCE_FEATURE[s]
      return (f === undefined || editor.supports(f)) || allCables.some((c) => c.attrs.source === s)
    }),
  )
  const pips = (g: Group) => allCables.filter((c) => groupOf(c.attrs.destination)?.id === g.id)
  const targets = $derived(
    new Set(allCables.filter((c) => c.attrs.source === editor.inspect).map((c) => groupOf(c.attrs.destination)?.id).filter(Boolean)),
  )

  function clickBlock(e: MouseEvent, g: Group) {
    e.stopPropagation()
    editor.toggleFocus(g.id, e.shiftKey || e.metaKey || e.ctrlKey)
  }
  async function clickSource(e: MouseEvent, s: PatchSource) {
    e.stopPropagation()
    editor.inspectSource(s)
    if (editor.inspect === null) return
    // The matrix highlights this source's cables; bring it on screen if it
    // is below the fold (or was a chip a moment ago), and leave the scroll
    // alone if it is already in view.
    await tick()
    document.getElementById('panel-cables')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  // Wires from the inspected modulator to its target blocks.
  let rig: HTMLDivElement | undefined = $state()
  let wires = $state<{ d: string; cx: number; cy: number }[]>([])
  let size = $state({ w: 0, h: 0 })
  function layout() {
    if (!rig) return
    const r = rig.getBoundingClientRect()
    size = { w: r.width, h: r.height }
    const from = rig.querySelector<HTMLElement>('.mblk.sel')
    if (!from || !editor.inspect) {
      wires = []
      return
    }
    const s = from.getBoundingClientRect()
    wires = [...targets].map((id) => {
      const b = rig!.querySelector<HTMLElement>(`[data-blk="${id}"] .box`)
      if (!b) return null
      const d = b.getBoundingClientRect()
      const sx = s.left + s.width / 2 - r.left, sy = s.top - r.top
      const dx = d.left + d.width / 2 - r.left, dy = d.bottom - r.top
      return { d: `M${sx} ${sy} C${sx} ${sy - 40} ${dx} ${dy + 46} ${dx} ${dy}`, cx: dx, cy: dy }
    }).filter((w): w is NonNullable<typeof w> => w !== null)
  }
  $effect(() => {
    void editor.inspect
    void targets
    void editor.focus
    requestAnimationFrame(layout)
  })
  $effect(() => {
    if (!rig) return
    const ro = new ResizeObserver(() => layout())
    ro.observe(rig)
    return () => ro.disconnect()
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="rig" bind:this={rig} onclick={() => editor.clearFocus()} onkeydown={(e) => { if (e.key === 'Escape') editor.clearFocus() }} data-testid="flow-strip" title="Click a block to focus it; shift- or ⌘-click to pin several">
  {#if editor.focus.length}
    <button type="button" class="btn small showall" data-testid="show-all" onclick={(e) => { e.stopPropagation(); editor.clearFocus() }}>Show all</button>
  {/if}
  <svg class="wires" viewBox="0 0 {size.w || 1} {size.h || 1}" width={size.w} height={size.h}>
    {#each wires as w, i (i)}
      <path d={w.d} fill="none" stroke={sourceColor(editor.inspect ?? undefined)} stroke-width="2" opacity=".8" stroke-linecap="round" />
      <circle cx={w.cx} cy={w.cy} r="3" fill={sourceColor(editor.inspect ?? undefined)} />
    {/each}
  </svg>
  <div class="rigrow">
    <div class="cap">In<br />Note</div>
    <span class="link"></span>
    {#each srcLane as g (g.id)}
      {@render block(g)}
      <span class="link"></span>
    {/each}
    {#each chain as g, i (g.id)}
      {#if i > 0}<span class="link"></span>{/if}
      {@render block(g)}
    {/each}
    <span class="link"></span>
    <div class="cap out">Out<br />L / R</div>
  </div>
  <div class="modlane">
    <!-- These panels are not in the audio path, so they don't get the rig-block
         look — they read as chips, like the modulators they sit beside. -->
    <div class="modgroups">
      {#each modLane as g (g.id)}
        <button
          type="button"
          class="gblk"
          class:sel={editor.focus.includes(g.id)}
          class:tgt={targets.has(g.id)}
          style="--bc:var({g.color});--hi:{sourceColor(editor.inspect ?? undefined)}"
          data-blk={g.id}
          aria-pressed={editor.focus.includes(g.id)}
          onclick={(e) => clickBlock(e, g)}
        >
          <span class="sw box"></span>
          <span class="t"><b>{g.name}</b><i>{g.value(sound)}</i></span>
        </button>
      {/each}
    </div>
    <div class="mods">
      {#each sources as s (s)}
        {@const n = allCables.filter((c) => c.attrs.source === s).length}
        <button type="button" class="mblk" class:idle={n === 0} class:sel={editor.inspect === s} style="--bc:{sourceColor(s)}" data-source={s} title={sourceTip(s)} onclick={(e) => clickSource(e, s)}>
          <span class="sw"></span>
          <span class="t"><b>{sourceName(s)}</b><i>{n ? `${n} cable${n > 1 ? 's' : ''}` : sourceHint(s)}</i></span>
        </button>
      {/each}
    </div>
  </div>
</div>

{#snippet block(g: Group)}
  <button
    type="button"
    class="blk"
    class:sel={editor.focus.includes(g.id)}
    class:tgt={targets.has(g.id)}
    style="--bc:var({g.color});--hi:{sourceColor(editor.inspect ?? undefined)}"
    data-blk={g.id}
    aria-pressed={editor.focus.includes(g.id)}
    onclick={(e) => clickBlock(e, g)}
  >
    <span class="box">
      <svg viewBox="0 0 22 24">{@html g.icon}</svg>
      {#if pips(g).length}
        <span class="modpip">{#each pips(g).slice(0, 4) as c, i (i)}<i style="background:{sourceColor(c.attrs.source)}"></i>{/each}</span>
      {/if}
    </span>
    <span class="nm">{g.name}</span>
    <span class="vv">{g.value(sound)}</span>
  </button>
{/snippet}

<style>
  .rig { position: relative; margin: 12px 0 0; padding: 14px 12px 12px; background: linear-gradient(180deg, #131110, #0e0d0c); border: 1px solid var(--edge); border-radius: 5px; overflow-x: auto; overflow-y: hidden; cursor: default; }
  .wires { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
  /* Top-aligned so the links and caps can centre on the 52px icon squares
     (centre y = 26) rather than on the block incl. its labels. */
  .rigrow { display: flex; align-items: flex-start; gap: 0; position: relative; z-index: 2; min-width: max-content; }
  .cap { flex: none; width: 52px; height: 56px; margin-top: -2px; border-radius: 6px; border: 1px solid var(--edge-hi); background: #141210; display: grid; place-items: center; font-family: var(--cond); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); line-height: 1.1; text-align: center; }
  .cap.out { border-color: var(--brass-dim); color: var(--brass); }
  .link { flex: none; width: 18px; height: 2px; margin-top: 25px; background: #2e2820; }
  .showall { position: absolute; top: 8px; right: 10px; z-index: 3; }
  .blk { flex: none; width: 74px; background: transparent; border: 0; padding: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .blk .box { width: 52px; height: 52px; border-radius: 11px; border: 2px solid var(--bc); background: #131110; display: grid; place-items: center; position: relative; transition: box-shadow .12s, transform .12s; }
  .blk .box svg { width: 24px; height: 24px; stroke: var(--bc); fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .blk .nm { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); text-align: center; line-height: 1.1; }
  .blk .vv { font-family: var(--mono); font-size: 8.5px; color: var(--faint); line-height: 1; }
  .blk:hover .box { transform: translateY(-1px); }
  .blk.sel .box { box-shadow: 0 0 0 2px #0e0d0c, 0 0 0 4px var(--bc), 0 0 16px -2px var(--bc); }
  .blk.sel .nm { color: #eee4d2; }
  .blk.tgt .box { border-color: var(--hi) !important; box-shadow: 0 0 0 2px #0e0d0c, 0 0 0 4px var(--hi); }
  .modpip { position: absolute; top: -4px; right: -4px; display: flex; gap: 2px; }
  .modpip i { width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid #0e0d0c; display: block; }
  .modlane { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #262119; position: relative; z-index: 2; display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
  /* Two columns: Envelopes & LFOs / Mod Matrix, Arpeggiator / Randomiser, Gold Knobs. */
  .modgroups { display: grid; grid-template-columns: repeat(2, max-content); gap: 6px; padding-top: 4px; align-content: flex-start; }
  .gblk { flex: none; padding: 4px 8px 4px 6px; border-radius: 6px; border: 1px solid #2a251f; background: #141210; cursor: pointer; display: flex; align-items: center; gap: 7px; }
  .gblk .sw { width: 4px; height: 20px; border-radius: 2px; background: var(--bc); }
  .gblk .t { text-align: left; }
  .gblk .t b { display: block; font-family: var(--cond); font-size: 11px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: #d5ccbc; line-height: 1.15; }
  .gblk .t i { font-style: normal; font-family: var(--mono); font-size: 8.5px; color: var(--faint); }
  .gblk:hover { border-color: #3c3529; }
  .gblk.sel { border-color: var(--bc); background: #1d1915; box-shadow: 0 0 12px -4px var(--bc); }
  .gblk.sel .t b { color: #eee4d2; }
  .gblk.tgt { border-color: var(--hi); box-shadow: 0 0 0 1px var(--hi); }
  /* The dashed rule separates the panel chips from the modulation sources;
     stretched so it runs the full height of the lane. */
  .mods { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; min-width: 240px; padding-top: 4px; border-left: 1px dashed #262119; padding-left: 18px; align-self: stretch; align-content: flex-start; }
  .mblk { flex: none; padding: 4px 8px 4px 6px; border-radius: 6px; border: 1px solid #2a251f; background: #141210; cursor: pointer; display: flex; align-items: center; gap: 7px; }
  .mblk .sw { width: 4px; height: 20px; border-radius: 2px; background: var(--bc); }
  .mblk .t { text-align: left; }
  .mblk .t b { display: block; font-family: var(--cond); font-size: 11px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: #d5ccbc; line-height: 1.15; }
  .mblk .t i { font-style: normal; font-family: var(--mono); font-size: 8.5px; color: var(--faint); }
  .mblk.idle { opacity: .42; }
  .mblk.sel { border-color: var(--bc); background: #1d1915; box-shadow: 0 0 12px -4px var(--bc); opacity: 1; }
  .mblk:hover { border-color: #3c3529; }
</style>
