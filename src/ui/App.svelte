<script lang="ts">
  import CablePicker from './CablePicker.svelte'
  import CardPanel from './CardPanel.svelte'
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
  <footer class="foot">
    A free, community-made editor · not produced by, associated with, or endorsed by Synthstrom Audible
    · MIT · <a href="https://github.com/cyface/deluge-editor">github.com/cyface/deluge-editor</a>
  </footer>
  <ChangesDock />
  <CablePicker />
  <CardPanel />
</div>

<style>
  .page { padding: 0 calc(var(--cheek) + var(--gut)); min-height: 100vh; display: flex; flex-direction: column; }
  .page.dragging { outline: 2px dashed var(--brass); outline-offset: -6px; }
  .foot { margin-top: auto; padding: 26px 0 12px; font-family: var(--cond); font-size: 10.5px; letter-spacing: .06em; color: var(--faint); text-align: center; }
  .foot a { color: var(--muted); }
  .error { margin: 10px 0 0; padding: 8px 10px; border: 1px solid #5a2a22; background: #1d1210; color: #e8a08f; font-family: var(--mono); font-size: 11px; border-radius: 3px; }
</style>
