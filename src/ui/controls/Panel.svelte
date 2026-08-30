<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Group } from '../groups'
  interface Props { group: Group; sub?: string; children: Snippet }
  let { group, sub, children }: Props = $props()
</script>

<section class="panel" class:wide={group.wide} id="panel-{group.id}" data-group={group.id} style="--c: var({group.color})">
  <div class="ph">
    <h2>{group.name}</h2>
    {#if sub}<span class="sub">{sub}</span>{/if}
  </div>
  {@render children()}
</section>

<style>
  .panel {
    break-inside: avoid-column; margin: 0 0 9px; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge);
    border-radius: 4px; padding: 9px 11px 12px; position: relative; overflow: hidden;
  }
  .panel::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--c, var(--edge-hi)); }
  .ph { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 4px 4px; min-height: 18px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
</style>
