<script lang="ts">
  import CablePicker from './CablePicker.svelte'
  import CardPanel from './CardPanel.svelte'
  import ChangesDock from './ChangesDock.svelte'
  import EmptyState from './EmptyState.svelte'
  import FlowStrip from './FlowStrip.svelte'
  import KitBuilder from './KitBuilder.svelte'
  import KitRows from './KitRows.svelte'
  import Oled from './Oled.svelte'
  import Overview from './Overview.svelte'
  import TopBar from './TopBar.svelte'
  import { collectDroppedSamples } from './dropdir'
  import { editor } from './state/editor.svelte'
  import { kit as kitBuilder } from './state/kit.svelte'

  let dragging = $state(false)
  /** A drop over a loaded preset, held for the user's yes. */
  let confirmDrop = $state<{ question: string; verb: string; run: () => Promise<void> | void } | null>(null)

  const loadedName = () => editor.fileName || 'your unsaved preset'
  const changesNote = () =>
    editor.changeCount > 0 ? ` — ${editor.changeCount} unsaved change${editor.changeCount === 1 ? '' : 's'}` : ''

  async function drop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    confirmDrop = null
    if (!e.dataTransfer) return
    // A folder (or loose WAVs) is a kit-building drop; a file is a preset.
    // Any drop over a loaded preset asks first: samples ADD rows to a kit
    // but replace anything else with a new kit, and a preset file replaces
    // whatever is loaded — the dialog says which is about to happen.
    const samples = await collectDroppedSamples(e.dataTransfer)
    if (samples) {
      const folder = samples.folder ?? kitBuilder.folder ?? (editor.fileName.replace(/\.xml$/i, '') || 'Kit')
      const run = () => kitBuilder.addLocalSamples(folder, samples.files)
      const n = samples.files.length
      if (editor.preset?.tag === 'kit') {
        confirmDrop = { question: `Add ${n} WAV${n === 1 ? '' : 's'} from “${folder}” to ${editor.fileName || 'the current kit'}?`, verb: 'Add', run }
        return
      }
      if (editor.preset) {
        confirmDrop = { question: `Build a new kit from “${folder}”? It replaces ${loadedName()}${changesNote()}.`, verb: 'Replace', run }
        return
      }
      await run()
      return
    }
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    const text = await f.text() // read now: the DataTransfer dies with the event
    const run = () => editor.load(text, f.name)
    if (editor.preset) {
      confirmDrop = { question: `Open ${f.name}? It replaces ${loadedName()}${changesNote()}.`, verb: 'Replace', run }
      return
    }
    run()
  }
  const kit = $derived(editor.preset?.tag === 'kit' ? editor.preset : undefined)
</script>

<svelte:window
  ondragover={(e) => { e.preventDefault(); dragging = true }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
  onkeydown={(e) => { if (e.key === 'Escape') confirmDrop = null }}
/>

{#if confirmDrop}
  <div class="veil" role="alertdialog" aria-label="Replace the loaded preset?" data-testid="drop-confirm">
    <div class="ask">
      <p>{confirmDrop.question}</p>
      <div class="row">
        <button type="button" class="btn go" data-testid="drop-confirm-replace" onclick={() => { const d = confirmDrop!; confirmDrop = null; void d.run() }}>{confirmDrop.verb}</button>
        <button type="button" class="btn" data-testid="drop-confirm-cancel" onclick={() => (confirmDrop = null)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<div class="cheek l"></div>
<div class="cheek r"></div>
<div class="page" class:dragging>
  <TopBar />
  {#if editor.error}
    <p class="error" role="alert">{editor.error}</p>
  {/if}
  {#if editor.preset}
    <Oled />
    {#if kit}<KitBuilder /><KitRows />{/if}
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
  .veil { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; background: rgba(8, 6, 5, .6); }
  .ask { width: 360px; max-width: 90vw; background: linear-gradient(180deg, #171412, #100e0d); border: 1px solid var(--edge-hi); border-radius: 5px; box-shadow: 0 14px 40px rgba(0, 0, 0, .6); padding: 14px 16px 12px; }
  .ask p { margin: 0 0 12px; font-family: var(--cond); font-size: 12.5px; letter-spacing: .04em; color: #e2d9ca; line-height: 1.5; }
  .ask .row { display: flex; gap: 8px; justify-content: flex-end; }
  .ask .btn { height: 26px; padding: 0 12px; border-radius: 3px; border: 1px solid var(--edge-hi); background: #1b1815; color: var(--muted); font-family: var(--cond); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .ask .btn:hover { color: var(--text); border-color: var(--brass); }
  .ask .btn.go { border-color: #8a5a2a; color: #e8b06a; }
</style>
