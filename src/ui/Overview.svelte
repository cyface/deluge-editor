<script lang="ts">
  /**
   * Every section at once, in measured masonry columns; pinned blocks expand,
   * the rest become one-line chips. The panels are measured as rendered and
   * dealt into contiguous balanced stacks (`masonry.ts`) — columns track the
   * window continuously instead of snapping to CSS multicolumn's 262px floor,
   * and there are never more columns than panels, so none sit empty.
   */
  import type { KitElement, SoundElement } from '../core/preset'
  import Panel from './controls/Panel.svelte'
  import ArpGroup from './groups/ArpGroup.svelte'
  import CablesGroup from './groups/CablesGroup.svelte'
  import DelayGroup from './groups/DelayGroup.svelte'
  import DistGroup from './groups/DistGroup.svelte'
  import FilterGroup from './groups/FilterGroup.svelte'
  import GoldGroup from './groups/GoldGroup.svelte'
  import KitGroup from './groups/KitGroup.svelte'
  import ModFxGroup from './groups/ModFxGroup.svelte'
  import ModsGroup from './groups/ModsGroup.svelte'
  import OscGroup from './groups/OscGroup.svelte'
  import OutGroup from './groups/OutGroup.svelte'
  import RandomiserGroup from './groups/RandomiserGroup.svelte'
  import VoiceGroup from './groups/VoiceGroup.svelte'
  import { gridBlocks, gridGroups, type Group } from './groups'
  import { columnCount, splitStacks, GAP, MAX_COL } from './masonry'
  import { editor } from './state/editor.svelte'

  interface Props { sound: SoundElement; kit?: KitElement }
  let { sound, kit }: Props = $props()
  const groups = $derived(gridGroups())
  const expanded = $derived(groups.filter((g) => editor.isExpanded(g.id)))
  const collapsed = $derived(groups.filter((g) => !editor.isExpanded(g.id)))
  /** Unsplittable runs — Randomiser under Arpeggiator — balanced as one item each. */
  const blocks = $derived(gridBlocks(expanded))

  /** First-paint guess for the grid's width; the binding corrects it on mount. */
  let width = $state(typeof document === 'undefined' ? 1200 : document.documentElement.clientWidth - 64)
  /** Rendered panel heights by group id, kept fresh by the `measure` action. */
  let heights = $state<Record<string, number>>({})
  const FALLBACK_HEIGHT = 260 // an unmeasured panel's stand-in for one frame

  const cols = $derived(columnCount(width, blocks.length))
  const stacks = $derived.by(() => {
    const kitAt = blocks.findIndex((b) => b[0].id === 'kit')
    // A block's cost is its panels plus the gaps between them; splitStacks
    // adds the one trailing gap itself.
    const costs = blocks.map((b) => b.reduce((sum, g) => sum + (heights[g.id] ?? FALLBACK_HEIGHT) + GAP, -GAP))
    return splitStacks(blocks, costs, cols, kitAt).map((stack) => stack.flat())
  })

  const observed = new Map<Element, string>()
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    for (const e of entries) {
      const id = observed.get(e.target)
      if (id === undefined) continue
      const h = e.contentRect.height
      // Heights only move when the width or the panel's content does, so the
      // remeasure after a redistribution reports the same numbers and settles.
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
</script>

{#if collapsed.length}
  <div class="chips" data-testid="collapsed">
    {#each collapsed as g (g.id)}
      <button type="button" class="chipline" style="--c:var({g.color})" data-chip={g.id} title="Click to expand {g.name} as well" onclick={() => editor.toggleFocus(g.id, true)}>
        <i></i><b>{g.name}</b><span>{g.summary(sound)}</span>
      </button>
    {/each}
  </div>
{/if}

{#snippet body(g: Group)}
  {#if g.id === 'osc'}<OscGroup {sound} />
  {:else if g.id === 'voice'}<VoiceGroup {sound} />
  {:else if g.id === 'filters'}<FilterGroup {sound} />
  {:else if g.id === 'modfx'}<ModFxGroup {sound} />
  {:else if g.id === 'dist'}<DistGroup {sound} />
  {:else if g.id === 'delay'}<DelayGroup {sound} />
  {:else if g.id === 'out'}<OutGroup {sound} />
  {:else if g.id === 'mods'}<ModsGroup {sound} />
  {:else if g.id === 'cables'}<CablesGroup {sound} />
  {:else if g.id === 'arp'}<ArpGroup {sound} />
  {:else if g.id === 'random'}<RandomiserGroup {sound} />
  {:else if g.id === 'gold'}<GoldGroup {sound} />
  {:else if g.id === 'kit' && kit}<KitGroup {kit} />
  {/if}
{/snippet}

<!-- Track caps at MAX_COL so a couple of lone panels on a cinema display stay
     panel-shaped; the container itself stays full width so the measured width
     is the space available, not the space currently used. -->
<main
  class="grid"
  data-testid="overview"
  bind:clientWidth={width}
  style="grid-template-columns: repeat({cols}, minmax(0, {MAX_COL}px)); column-gap: {GAP}px"
>
  {#each stacks as stack, i (i)}
    <div class="stack">
      {#each stack as g (g.id)}
        <div use:measure={g.id}>
          <Panel group={g} sub={g.summary(sound)}>{@render body(g)}</Panel>
        </div>
      {/each}
    </div>
  {/each}
</main>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 0; }
  .chipline { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; border: 1px solid var(--edge); background: #141210; border-radius: 3px; padding: 3px 9px 3px 7px; cursor: pointer; color: var(--muted); }
  .chipline:hover { border-color: var(--edge-hi); color: var(--text); }
  .chipline i { width: 8px; height: 8px; border-radius: 2px; background: var(--c); flex: none; }
  .chipline b { font-family: var(--cond); font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #d5ccbc; white-space: nowrap; }
  .chipline span { font-family: var(--mono); font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grid { padding: 10px 0 0; display: grid; align-items: start; }
  .stack { min-width: 0; }
</style>
