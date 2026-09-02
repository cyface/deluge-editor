<script lang="ts">
  import CablePicker from './CablePicker.svelte'
  import CardPanel from './CardPanel.svelte'
  import ChangesDock from './ChangesDock.svelte'
  import EmptyState from './EmptyState.svelte'
  import FlowStrip from './FlowStrip.svelte'
  import FollowView from './FollowView.svelte'
  import KitBuilder from './KitBuilder.svelte'
  import KitRows from './KitRows.svelte'
  import FolderImport from './FolderImport.svelte'
  import Oled from './Oled.svelte'
  import Overview from './Overview.svelte'
  import RangeEditor from './RangeEditor.svelte'
  import Randomize from './Randomize.svelte'
  import SamplePicker from './SamplePicker.svelte'
  import TopBar from './TopBar.svelte'
  import { collectDroppedSamples } from './dropdir'
  import { card } from './state/card.svelte'
  import { editor } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'
  import { ranges as rangeEditor } from './state/ranges.svelte'
  import { randomizer } from './state/randomize.svelte'
  import { kit as kitBuilder } from './state/kit.svelte'
  import { multisample } from './state/multisample.svelte'
  import { changesNote, confirm, loadedName } from './state/confirm.svelte'
  import { samplePick } from './state/samplepick.svelte'
  import { samples as stash } from './state/samples.svelte'

  let dragging = $state(false)

  async function drop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    confirm.cancel()
    if (!e.dataTransfer) return
    // A folder (or loose WAVs) builds an instrument from samples; a file is a
    // preset. Over a synth the folder is a multi-sample import: it opens the
    // review and builds the ranges there and then, on an oscillator that was
    // not already a sampled one, so there is nothing to confirm. Over a kit
    // the samples ADD rows, over nothing they start a kit, and a preset file
    // replaces whatever is loaded: those ask first.
    const dropped = await collectDroppedSamples(e.dataTransfer)
    if (dropped) {
      const folder = dropped.folder ?? stash.folder ?? (editor.fileName.replace(/\.xml$/i, '') || 'Kit')
      if (editor.preset && editor.preset.tag !== 'kit') {
        // Straight in: the drop already answered "where are the samples?".
        await multisample.addLocalFolder(folder, dropped.files)
        return
      }
      const run = () => kitBuilder.addLocalSamples(folder, dropped.files)
      const n = dropped.files.length
      if (editor.preset?.tag === 'kit') {
        confirm.ask({ question: `Add ${n} WAV${n === 1 ? '' : 's'} from “${folder}” to ${editor.fileName || 'the current kit'}?`, verb: 'Add', run })
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
      confirm.ask({ question: `Open ${f.name}? It replaces ${loadedName()}${changesNote()}.`, verb: 'Replace', run })
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
  onkeydown={(e) => { if (e.key === 'Escape') { confirm.cancel(); if (multisample.open) multisample.cancel(); if (samplePick.open) samplePick.cancel(); if (card.open) card.close(); randomizer.open = false } }}
/>

{#if multisample.open}<FolderImport />{/if}
{#if samplePick.open}<SamplePicker />{/if}

<!-- The one question dialog (`state/confirm.svelte.ts`): a drop over a
     preset, samples onto a kit, New over unsaved work. Above everything,
     including the menus that ask it. -->
{#if confirm.pending}
  <div class="veil" role="alertdialog" aria-label={confirm.pending.question} data-testid="confirm">
    <div class="ask">
      <p>{confirm.pending.question}</p>
      <div class="row">
        <button type="button" class="btn go" data-testid="confirm-go" onclick={() => confirm.go()}>{confirm.pending.verb}</button>
        <button type="button" class="btn" data-testid="confirm-cancel" onclick={() => confirm.cancel()}>Cancel</button>
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
  <!-- A verified save closes the card dialog, so its confirmation lands here
       — green for "written and verified", amber when another editor on the
       same Deluge could overwrite it a second later (issue #8). It takes
       itself away after a few seconds. -->
  {#if card.saved}
    <p class="saved" class:qualified={card.otherEditor} role="status" data-testid="card-saved">{card.saved}</p>
  {/if}
  <!-- The generator sits in the flow, under the bar that opens it: it stays
       open across many rolls, so it pushes the editor down rather than
       covering the OLED sentence and the first column of the patch it is
       rolling. -->
  <Randomize />
  {#if editor.preset}
    <Oled />
    <!-- Follow Mode keeps the row table (it picks the row the CCs land on)
         but not the sample builder, which is a different job entirely. -->
    {#if kit}{#if !follow.on}<KitBuilder />{/if}<KitRows />{/if}
    {#if follow.on}
      <!-- Follow Mode replaces the editor's own view with the subset MIDI
           Follow can reach (issue #9). The flow strip's pins and the range
           editor belong to the full page, so they stand down with it. -->
      <FollowView sound={editor.sound} {kit} />
    {:else if editor.sound}
      <FlowStrip sound={editor.sound} />
      <!-- The range editor is as wide as the page: 70 key bands don't fit a
           masonry column, and the map is the point of it (issue #29). -->
      {#if rangeEditor.osc}<RangeEditor />{/if}
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
  .saved { margin: 10px 0 0; padding: 8px 10px; border: 1px solid #2f4a2c; background: #101710; color: #9ed492; font-family: var(--mono); font-size: 11px; border-radius: 3px; }
  .saved.qualified { border-color: #6b4a1c; background: #1d1710; color: #e8b06a; }
  .veil { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; background: rgba(8, 6, 5, .6); }
  .ask { width: 360px; max-width: 90vw; background: linear-gradient(180deg, #171412, #100e0d); border: 1px solid var(--edge-hi); border-radius: 5px; box-shadow: 0 14px 40px rgba(0, 0, 0, .6); padding: 14px 16px 12px; }
  .ask p { margin: 0 0 12px; font-family: var(--cond); font-size: 12.5px; letter-spacing: .04em; color: #e2d9ca; line-height: 1.5; }
  .ask .row { display: flex; gap: 8px; justify-content: flex-end; }
  .ask .btn { height: 26px; padding: 0 12px; border-radius: 3px; border: 1px solid var(--edge-hi); background: #1b1815; color: var(--muted); font-family: var(--cond); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .ask .btn:hover { color: var(--text); border-color: var(--brass); }
  .ask .btn.go { border-color: #8a5a2a; color: #e8b06a; }
</style>
