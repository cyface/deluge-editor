<script lang="ts">
  import ChangesDock from './ChangesDock.svelte'
  import EmptyState from './EmptyState.svelte'
  import FlowStrip from './FlowStrip.svelte'
  import KitRows from './KitRows.svelte'
  import Oled from './Oled.svelte'
  import Overview from './Overview.svelte'
  import TopBar from './TopBar.svelte'
  import { editor } from './state/editor.svelte'

  let dragging = $state(false)
  async function drop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    const f = e.dataTransfer?.files?.[0]
    if (f) editor.load(await f.text(), f.name)
  }
  const kit = $derived(editor.preset?.tag === 'kit' ? editor.preset : undefined)
</script>

<svelte:window
  ondragover={(e) => { e.preventDefault(); dragging = true }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
/>

<div class="cheek l"></div>
<div class="cheek r"></div>
<div class="page" class:dragging>
  <TopBar />
  {#if editor.error}
    <p class="error" role="alert">{editor.error}</p>
  {/if}
  {#if editor.preset}
    <Oled />
    {#if kit}<KitRows />{/if}
    {#if editor.sound}
      <FlowStrip sound={editor.sound} />
      <Overview sound={editor.sound} {kit} />
    {/if}
  {:else}
    <EmptyState />
  {/if}
  <ChangesDock />
</div>

<style>
  .page { padding: 0 calc(var(--cheek) + var(--gut)); min-height: 100vh; }
  .page.dragging { outline: 2px dashed var(--brass); outline-offset: -6px; }
  .error { margin: 10px 0 0; padding: 8px 10px; border: 1px solid #5a2a22; background: #1d1210; color: #e8a08f; font-family: var(--mono); font-size: 11px; border-radius: 3px; }
</style>
