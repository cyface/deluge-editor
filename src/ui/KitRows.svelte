<script lang="ts">
  /**
   * A kit's rows in pad order. Selecting a sound row edits it in the panels
   * below; rows reorder by dragging the grip or nudging with the arrows
   * (bottom pad first in the file, so row 1 is the bottom of the grid).
   * From the keyboard, the arrows move the selection and Enter or Space
   * select the focused row. Each row is a `KitRow`.
   */
  import { moveRow, removeRow, renameRow } from '../core/kit/build'
  import { MIDI_OUTPUT_ATTR_ORDER, referencedSampleFiles, type DrumRow, type KitElement } from '../core/preset'
  import { sampleRanges } from '../core/preset/ranges'
  import { UI_HELP } from './help'
  import { osc } from '../core/preset/sound'
  import { setAttr } from '../core/xml'
  import KitRow from './KitRow.svelte'
  import KitStatus from './KitStatus.svelte'
  import NumberField from './controls/NumberField.svelte'
  import Panel from './controls/Panel.svelte'
  import Status from './controls/Status.svelte'
  import { HELP } from './help'
  import { midiTip } from './copy'
  import { audio } from './state/audio.svelte'
  import { card } from './state/card.svelte'
  import { editor, isSoundRow } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'
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

  const pushCount = $derived(stash.pushable.length)
  /**
   * The card's missing samples split by what can be done about them: the
   * ones this session holds go with Send (or the next save to the Deluge);
   * the rest can only be found elsewhere on the card, or replaced.
   */
  const toSend = $derived([...stash.missing].filter((f) => stash.bytes.has(f)).length)
  const lost = $derived([...stash.missing].filter((f) => !stash.bytes.has(f)))
  /** Found copies still worth offering: their sample is still missing. */
  const found = $derived(kitBuilder.found?.filter((f) => stash.missing.has(f.from)) ?? [])

  /** Rows that name a sample the card lacks and the editor can't send. */
  const lostRows = $derived(
    editor.rows.flatMap((r, i) => (isSoundRow(r) && referencedSampleFiles(r).some((f) => stash.missing.has(f) && !stash.bytes.has(f)) ? [i] : [])),
  )

  /** The missing count's click: select the next such row after the selected one, and bring it into view. */
  function nextLost() {
    if (!lostRows.length) return
    const to = lostRows.find((i) => i > editor.row) ?? lostRows[0]
    editor.row = to
    table?.querySelector<HTMLElement>(`[data-row="${to}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  /** The builder's panel is up (a kit with no samples yet), and it shows the builder's status itself. */
  const builderPanel = $derived(!kitBuilder.built && !follow.on)

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
    {#if lost.length}<button
        type="button"
        class="misscount"
        data-testid="missing-count"
        title="These rows will be silent on the Deluge. Click to go to the next one, then choose another sample with Sample… or remove the row — or Find on card"
        onclick={nextLost}
      >⚠ {lost.length} sample{lost.length === 1 ? '' : 's'} missing</button> · {/if}{#if toSend}<span
        class="tosend"
        data-testid="tosend-count"
        title="Not on the card yet — Send them, or save the kit to the Deluge, to copy them there"
      >⚠ {toSend} sample{toSend === 1 ? '' : 's'} to send</span> · {/if}{editor.rows.length} in pad order · bottom row first in the file · drag or ▲▼ to reorder
  {/snippet}
  {#snippet actions()}
    <!-- The instrument's own gesture: a new drum arrives silent and named
         U1, U2, … and gets its sample afterwards. -->
    <button type="button" class="btn small" data-testid="add-row" title={UI_HELP['ui.rows.add']} onclick={() => kitBuilder.addRow()}>Add row</button>
    {#if kitBuilder.built && !follow.on}
      <button type="button" class="btn small" data-testid="add-samples" title={UI_HELP['ui.rows.addSamples']} disabled={!!kitBuilder.busy} onclick={() => (kitBuilder.addOpen = true)}>Add samples…</button>
    {/if}
    {#if lost.length && card.status === 'connected'}
      <button
        type="button"
        class="btn small"
        data-testid="find-missing"
        disabled={!!kitBuilder.busy}
        title="Look under SAMPLES/ on the Deluge for files with the same names, nearest folder first"
        onclick={() => kitBuilder.locateMissing()}
      >Find on card</button>
    {/if}
    {#if pushCount > 0}
      <button
        type="button"
        class="btn small"
        data-testid="push-samples"
        disabled={!card.supported || !!kitBuilder.busy}
        title={midiTip(`Write ${pushCount} sample file${pushCount === 1 ? '' : 's'} to SAMPLES/${stash.folder ?? ''} on the card`, card.supported)}
        onclick={() => kitBuilder.pushToCard()}
      >Send {pushCount} sample{pushCount === 1 ? '' : 's'} to the card</button>
    {/if}
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
  {#if found.length}
    <div class="found" data-testid="found-missing">
      <p>Found on the card:</p>
      <ul>
        {#each found as f (f.from)}
          <li><s>{f.from}</s> → <b>{f.to}</b>{#if f.others} <i>(+{f.others} other cop{f.others === 1 ? 'y' : 'ies'})</i>{/if}</li>
        {/each}
      </ul>
      <div class="btns">
        <button type="button" class="btn go small" data-testid="use-found" onclick={() => kitBuilder.useFound()}>Use {found.length === 1 ? 'it' : 'them'}</button>
        <button type="button" class="btn small" onclick={() => (kitBuilder.found = null)}>Dismiss</button>
      </div>
    </div>
  {/if}
  {#if !builderPanel && !kitBuilder.addOpen}<KitStatus />{/if}
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
  .misscount { all: unset; cursor: pointer; color: var(--bad-text); text-decoration: underline dotted; text-underline-offset: 2px; }
  .misscount:hover { text-decoration-style: solid; }
  .misscount:focus-visible { outline: 1px solid var(--brass-dim); outline-offset: 2px; }
  .tosend { color: var(--warn-text); }
  .found { margin: 8px 0 0 4px; font-family: var(--cond); font-size: 11.5px; color: var(--muted); }
  .found p { margin: 0 0 4px; }
  .found ul { margin: 0 0 6px; padding-left: 16px; font-family: var(--mono); font-size: 10.5px; }
  .found s { color: var(--faint); }
  .found b { color: var(--text-hi); font-weight: 500; }
  .found .btns { display: flex; gap: 6px; }
</style>
