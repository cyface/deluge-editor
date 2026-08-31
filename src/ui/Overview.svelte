<script lang="ts">
  /** Every section at once, masonry columns; pinned blocks expand, the rest become one-line chips. */
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
  import { gridGroups, type Group } from './groups'
  import { editor } from './state/editor.svelte'

  interface Props { sound: SoundElement; kit?: KitElement }
  let { sound, kit }: Props = $props()
  const groups = $derived(gridGroups())
  const expanded = $derived(groups.filter((g) => editor.isExpanded(g.id)))
  const collapsed = $derived(groups.filter((g) => !editor.isExpanded(g.id)))
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

<main class="grid" data-testid="overview">
  {#each expanded as g (g.id)}
    <Panel group={g} sub={g.summary(sound)}>{@render body(g)}</Panel>
  {/each}
</main>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 0; }
  .chipline { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; border: 1px solid var(--edge); background: #141210; border-radius: 3px; padding: 3px 9px 3px 7px; cursor: pointer; color: var(--muted); }
  .chipline:hover { border-color: var(--edge-hi); color: var(--text); }
  .chipline i { width: 8px; height: 8px; border-radius: 2px; background: var(--c); flex: none; }
  .chipline b { font-family: var(--cond); font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #d5ccbc; white-space: nowrap; }
  .chipline span { font-family: var(--mono); font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grid { padding: 10px 0 0; column-width: 262px; column-gap: 9px; }
</style>
