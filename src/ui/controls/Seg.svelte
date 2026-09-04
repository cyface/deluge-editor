<script lang="ts">
  interface Item { id: number; label: string; dot?: string; idle?: boolean; title?: string }
  interface Props { items: Item[]; selected: number; onselect: (id: number) => void }
  let { items, selected, onselect }: Props = $props()
</script>

<div class="seg">
  {#each items as it (it.id)}
    <button type="button" class:on={it.id === selected} class:idle={it.idle} title={it.title} onclick={() => onselect(it.id)}>
      {it.label}{#if it.dot}<i style="--d:{it.dot}"></i>{/if}
    </button>
  {/each}
</div>
