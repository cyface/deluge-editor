<script lang="ts">
  /**
   * A kit's rows in pad order. Selecting a sound row edits it in the panels
   * below; rows reorder by dragging the grip or nudging with the arrows
   * (bottom pad first in the file, so row 1 is the bottom of the grid).
   * From the keyboard, the arrows move the selection and Enter or Space
   * select the focused row. Each row is a `KitRow`.
   */
  import { moveRow, removeRow, renameRow } from '../core/kit/build'
  import { MIDI_OUTPUT_ATTR_ORDER, type DrumRow, type KitElement } from '../core/preset'
  import { sampleRanges } from '../core/preset/ranges'
  import { UI_HELP } from './help'
  import { osc } from '../core/preset/sound'
  import { setAttr } from '../core/xml'
  import KitRow from './KitRow.svelte'
  import NumberField from './controls/NumberField.svelte'
  import Panel from './controls/Panel.svelte'
  import Status from './controls/Status.svelte'
  import { HELP } from './help'
  import { audio } from './state/audio.svelte'
  import { editor, isSoundRow } from './state/editor.svelte'
  import { kit as kitBuilder } from './state/kit.svelte'
  import { ranges as rangeEditor } from './state/ranges.svelte'
  import { samplePick } from './state/samplepick.svelte'
  import { samples as stash } from './state/samples.svelte'

  /**
   * Point a row at a sample from here, rather than making the user find the
   * oscillator panel: the same question the folder import asks, for one file.
   *
   * A row holding more than one range is a file this editor doesn't write —
   * velocity layers from a fork — so that opens the range editor to show them
   * read-only instead.
   */
  function pickSample(i: number, r: DrumRow) {
    editor.row = i
    if (!isSoundRow(r)) return
    const o = osc(r, 1)
    if (o?.attrs.type !== 'sample') return
    if (sampleRanges(o).length > 1) rangeEditor.show(1)
    else
      samplePick.start(o, {
        label: r.attrs.name || `row ${i + 1}`,
        onFolder: (path, entries) => kitBuilder.addCardFolder(path, entries),
      })
  }

  const sel = $derived(editor.selectedRow)
  const kit = $derived(editor.preset as KitElement)

  let dragFrom = $state<number | null>(null)
  let dragOver = $state<number | null>(null)
  let table: HTMLTableElement | undefined = $state()

  /** Reorder, keeping the selection on the row it was on. */
  function move(from: number, to: number) {
    if (to < 0 || to >= editor.rows.length) return
    const selected = editor.selectedRow
    moveRow(kit, from, to)
    if (selected) editor.row = editor.rows.indexOf(selected)
  }

  function drop(i: number) {
    if (dragFrom !== null && dragFrom !== i) move(dragFrom, i)
    dragFrom = null
    dragOver = null
  }

  function remove(i: number) {
    removeRow(kit, editor.rows[i])
    if (editor.row >= editor.rows.length) editor.row = Math.max(0, editor.rows.length - 1)
    else if (editor.row > i) editor.row -= 1
  }

  /** Enter or Space select the focused row; the arrows move the selection and the focus with it. */
  function rowKey(e: KeyboardEvent, i: number) {
    if ((e.target as HTMLElement).closest('input, select, button')) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      editor.row = i
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const to = Math.max(0, Math.min(editor.rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
      editor.row = to
      table?.querySelector<HTMLElement>(`[data-row="${to}"]`)?.focus()
    }
  }
</script>

<Panel title="Rows" flow>
  {#snippet subtitle()}
    {#if stash.missing.size}<span class="misscount" data-testid="missing-count">⚠ {stash.missing.size} sample{stash.missing.size === 1 ? '' : 's'} not on the card</span> · {/if}{editor.rows.length} in pad order · bottom row first in the file · drag or ▲▼ to reorder
  {/snippet}
  {#snippet actions()}
    <!-- The instrument's own gesture: a new drum arrives silent and named
         U1, U2, … and gets its sample afterwards. -->
    <button type="button" class="btn small" data-testid="add-row" title={UI_HELP['ui.rows.add']} onclick={() => kitBuilder.addRow()}>Add row</button>
  {/snippet}
  <div class="scroll">
    <table class="rows" data-testid="kit-rows" bind:this={table}>
      <thead><tr><th></th><th></th><th></th><th></th><th class="num">#</th><th>Row</th><th>Source</th><th>Repeat</th><th>Direction</th><th class="num">Vol</th><th class="num">Pan</th><th></th></tr></thead>
      <tbody>
        {#each editor.rows as r, i (r)}
          <KitRow
            row={r}
            {i}
            count={editor.rows.length}
            selected={i === editor.row}
            over={i === dragOver && dragFrom !== null && dragFrom !== i}
            onselect={() => (editor.row = i)}
            onkeydown={(e) => rowKey(e, i)}
            ondragstart={(e) => { dragFrom = i; e.dataTransfer?.setData('text/plain', String(i)) }}
            ondragend={() => { dragFrom = null; dragOver = null }}
            ondragover={() => (dragOver = i)}
            ondrop={() => drop(i)}
            onmove={(to) => move(i, to)}
            onremove={() => remove(i)}
            onrename={(name) => { if (name) renameRow(r, name) }}
            onpick={() => pickSample(i, r)}
          />
        {/each}
      </tbody>
    </table>
  </div>
  {#if audio.error}<Status kind="err">{audio.error}</Status>{/if}
  {#if stash.checkError}<Status kind="err" testid="missing-check-error">Could not check the card for these samples: {stash.checkError}</Status>{/if}
  {#if sel && !isSoundRow(sel)}
    <div class="fields">
      <NumberField label="Channel" name="row.channel" value={sel.attrs.channel} min={0} max={15} format={(n) => `ch ${n + 1}`} title={HELP['row.channel']} onchange={(v) => setAttr(sel, 'channel', String(v), MIDI_OUTPUT_ATTR_ORDER)} />
      {#if sel.tag === 'midiOutput'}
        <NumberField label="Note" name="row.note" value={sel.attrs.note} min={0} max={127} title={HELP['row.note']} onchange={(v) => setAttr(sel, 'note', String(v), MIDI_OUTPUT_ATTR_ORDER)} />
      {/if}
    </div>
    <p class="hint">A MIDI or gate row has no sound of its own; the panels below stay hidden.</p>
  {/if}
</Panel>

<style>
  .scroll { overflow-x: auto; max-height: 300px; overflow-y: auto; }
  .misscount { color: var(--bad-text); }
</style>
