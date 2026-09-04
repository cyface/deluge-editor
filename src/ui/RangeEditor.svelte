<script lang="ts">
  /**
   * The multi-sample range editor (issue #29). A sample oscillator holds one
   * range per key zone; this is the map of them, the list, and the fields for
   * whichever is selected.
   *
   * Root note is derived from `transpose`/`cents` and written back the same
   * way (`rootCents`), so there is nothing extra to store and a preset built
   * here reads on the instrument exactly as one built on it. Every edit goes
   * through `src/core/preset/ranges.ts` — the clamps, the ordering and the
   * one-range flattening are the firmware's, not this component's.
   *
   * Picking the file itself is the shared dialog (`SamplePicker.svelte`): this
   * panel says which range the answer is for, and one sample or a whole folder
   * are the two ways in, side by side. What an import or a re-detect left
   * beside the ranges is `RangeImport` and `RangeRedetect`.
   */
  import { noteName } from '../core/preset/notes'
  import { baseName as base, loopPointText as loopFmt, rangesLocked, removeRange, rootName, rootParts, setRangeRoot, setRangeTopNote, setRangeZone, tuningText as tuning, zoneOf, zoneText } from '../core/preset/ranges'
  import RangeImport from './RangeImport.svelte'
  import RangeRedetect from './RangeRedetect.svelte'
  import KeyMap from './controls/KeyMap.svelte'
  import NumberField from './controls/NumberField.svelte'
  import Panel from './controls/Panel.svelte'
  import Status from './controls/Status.svelte'
  import { notOnCard, notOnCardYet } from './copy'
  import { HELP, UI_HELP } from './help'
  import { ROOT_SOURCE } from './rangesource'
  import { audio } from './state/audio.svelte'
  import { editor } from './state/editor.svelte'
  import { multisample } from './state/multisample.svelte'
  import { ranges as ed } from './state/ranges.svelte'
  import { samples as stash } from './state/samples.svelte'

  const osc = $derived(ed.osc)
  const list = $derived(ed.ranges)
  const sel = $derived(ed.index)
  const current = $derived(ed.range)
  const label = $derived(ed.which === 2 ? 'B' : 'A')
  const reversed = $derived(osc?.attrs.reversed === '1')
  const last = $derived(list.length - 1)

  /**
   * Read-only when any write would refuse (`rangesLocked`): ranges keyed by
   * velocity, or a `rangeTopNote`/`transpose`/`cents` this code cannot read.
   * How a range is printed (`base`, `tuning`, `zoneText`, `loopFmt`) is
   * `src/core/preset/rangeformat.ts`.
   */
  const editable = $derived(osc !== null && !rangesLocked(osc))

  /** Every zone write sends the whole zone: the writer omits the loop points when they are zero, as the firmware does. */
  function setZone(field: 'startSamplePos' | 'endSamplePos' | 'startLoopPos' | 'endLoopPos', v: number) {
    if (osc) setRangeZone(osc, sel, { ...zoneOf(current), [field]: v })
  }
  const root = $derived(current ? rootParts(current.rootCents) : { note: 60, cents: 0 })
  function setRoot(note: number, cents: number) {
    if (osc) setRangeRoot(osc, sel, note * 100 + cents)
  }

  function remove(index: number) {
    if (!osc) return
    removeRange(osc, index)
    ed.select(Math.min(index, list.length - 1))
  }

  /** What the folder import or a re-detect left beside these ranges (issue #33). */
  const session = $derived(multisample.session?.which === ed.which ? multisample.session : null)
  const LEGEND = $derived(
    session?.kind === 'redetect' ? (['file', 'name', 'between', 'kept'] as const) : (['file', 'name', 'between', 'user'] as const),
  )
  /** A re-detect the user hasn't accepted: nothing has been written yet. */
  const plan = $derived(multisample.plan?.which === ed.which ? multisample.plan : null)
  const hasFiles = $derived(list.some((r) => r.fileName))

  const summary = $derived(
    list.length === 0
      ? 'no sample yet'
      : `${list.length} sample${list.length === 1 ? '' : 's'}${editable ? ' · drag a split to move a boundary' : ''}`,
  )

  let table: HTMLTableElement | undefined = $state()
  /** A click on a row selects it — unless it landed on one of the row's own buttons. */
  function rowClick(e: MouseEvent, i: number) {
    if ((e.target as HTMLElement).closest('button, input')) return
    ed.select(i)
  }
  /** Enter or Space select the focused row; the arrows move the selection and the focus with it. */
  function rowKey(e: KeyboardEvent, i: number) {
    if ((e.target as HTMLElement).closest('button, input')) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      ed.select(i)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const to = Math.max(0, Math.min(last, i + (e.key === 'ArrowDown' ? 1 : -1)))
      ed.select(to)
      table?.querySelector<HTMLElement>(`[data-range="${to}"]`)?.focus()
    }
  }
</script>

<Panel title="Osc {label} Ranges" sub={summary} color="var(--osc)" flow testid="range-editor">
  {#snippet actions()}
    <button type="button" class="x" aria-label="Close the range editor" onclick={() => ed.close()}>×</button>
  {/snippet}

  {#if !editable}
    <!-- Velocity layers are a fork-only feature (no `rangeTopVelocity` in stock
         firmware): shown, never rewritten, so the file passes through as it came. -->
    <Status kind="caution" testid="range-velocity">
      These ranges are keyed by velocity, which this editor doesn’t model — they are shown read-only and pass through unchanged.
    </Status>
  {/if}

  {#if list.length > 1}
    <!-- The map is the boundaries; with one sample there are none, and the
         band would span the keyboard whatever the sample is. -->
    <KeyMap
      ranges={list}
      selected={sel}
      onselect={(i) => ed.select(i)}
      onmove={editable ? (i, note) => osc && setRangeTopNote(osc, i, note) : undefined}
    />
  {/if}

  {#if plan}<RangeRedetect {plan} />{/if}
  {#if session}<RangeImport {session} />{/if}

  {#if list.length}
    <div class="scroll">
      <table class="rows" data-testid="range-rows" bind:this={table}>
        <thead><tr><th class="playcell"></th><th class="num">#</th><th>Keys</th><th>Root</th>{#if session}<th>Root from</th>{/if}<th>Sample</th><th>Tuning</th><th>Zone</th><th></th></tr></thead>
        <tbody>
          {#each list as r, i (r.el)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <tr class:on={i === sel} data-range={i} tabindex="0" aria-selected={i === sel} onclick={(e) => rowClick(e, i)} onkeydown={(e) => rowKey(e, i)}>
              <td class="playcell">
                {#if r.fileName}
                  {@const f = r.fileName}
                  <button
                    type="button"
                    class="mini play"
                    class:live={audio.playing === f}
                    data-testid="range-play"
                    disabled={audio.loading !== null || (!audio.canPreview(f) && audio.playing !== f)}
                    title={UI_HELP[audio.playing === f ? 'ui.preview.stop' : audio.canPreview(f) ? 'ui.preview.play' : 'ui.preview.unavailable']}
                    aria-label="{audio.playing === f ? 'Stop' : 'Preview'} {base(f)}"
                    onclick={() => void audio.toggle(f, reversed)}
                  >{audio.playing === f ? '■' : '▶'}</button>
                  {#if audio.loading === f}
                    <span class="mono pct" data-testid="range-play-progress">{Math.round(audio.progress * 100)}%</span>
                  {/if}
                {/if}
              </td>
              <td class="num">{i + 1}</td>
              <td class="mono">{r.topNote === undefined ? `above ${noteName((list[i - 1]?.topNote ?? -1) + 1)}` : `up to ${noteName(r.topNote)}`}</td>
              <td class="mono">{rootName(r.rootCents)}</td>
              {#if session}
                {@const src = ROOT_SOURCE[session.from[r.fileName ?? ''] ?? 'unknown']}
                <td class="mono src" title={src.why}>{src.short}</td>
              {/if}
              <td>
                {#if r.fileName && stash.missing.has(r.fileName)}
                  {@const held = stash.bytes.has(r.fileName)}
                  <span
                    class="miss"
                    class:pending={held}
                    data-testid="range-missing"
                    title={held ? notOnCardYet('preset') : notOnCard('preset', 'range')}
                  >⚠</span>
                {/if}
                <span class="fname" title={r.fileName}>{base(r.fileName) || '(no file)'}</span>
              </td>
              <td class="mono">{tuning(r)}</td>
              <td class="mono zone">{zoneText(r)}</td>
              <td class="acts">
                {#if editable}
                  <button type="button" class="mini" title="Remove this range" aria-label="Remove range {i + 1}" data-testid="range-remove" onclick={() => remove(i)}>×</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if session}
      <p class="legend" data-testid="range-legend">
        <span class="lead">Root from</span>
        {#each LEGEND as key (key)}
          <span class="item"><b>{ROOT_SOURCE[key].short}</b> — {ROOT_SOURCE[key].why}</span>
        {/each}
      </p>
    {/if}
  {:else}
    <p class="empty">This oscillator has no sample. Add one to start a multi-sample instrument.</p>
  {/if}

  {#if current && editable}
    <div class="h3">Range {sel + 1}<span class="sub">{current.fileName ?? '(no file)'}</span></div>
    <div class="fields">
      <div class="f">
        <span class="lbl">Sample</span>
        <div class="ro" title={current.fileName}>{base(current.fileName) || '(no file)'}</div>
      </div>
      <NumberField label="Root Note" name="range.root" value={root.note} min={0} max={127} format={(n) => noteName(n)} title={HELP['range.root']} onchange={(v) => setRoot(v, root.cents)} />
      <NumberField label="Detune ¢" name="range.detune" value={root.cents} min={-99} max={99} title={HELP['range.detune']} onchange={(v) => setRoot(root.note, v)} />
      {#if sel < last}
        <NumberField label="Top Note" name="range.topNote" value={current.topNote} min={1} max={126} format={(n) => noteName(n)} title={HELP['range.topNote']} onchange={(v) => osc && setRangeTopNote(osc, sel, v)} />
      {/if}
      <NumberField label="Zone Start" name="range.startSamplePos" value={current.zone?.attrs.startSamplePos} min={0} max={2147483647} fallback={0} title={HELP['range.startSamplePos']} onchange={(v) => setZone('startSamplePos', v)} />
      <!-- The firmware reads a zero end as the whole file (`SampleHolder::setAudioFile`). -->
      <NumberField label="Zone End" name="range.endSamplePos" value={current.zone?.attrs.endSamplePos} min={0} max={2147483647} fallback={0} format={(n) => (n === 0 ? 'whole file' : String(n))} title={HELP['range.endSamplePos']} onchange={(v) => setZone('endSamplePos', v)} />
      <NumberField label="Loop Start" name="range.startLoopPos" value={current.zone?.attrs.startLoopPos} min={0} max={2147483647} fallback={0} format={loopFmt} title={HELP['range.startLoopPos']} onchange={(v) => setZone('startLoopPos', v)} />
      <NumberField label="Loop End" name="range.endLoopPos" value={current.zone?.attrs.endLoopPos} min={0} max={2147483647} fallback={0} format={loopFmt} title={HELP['range.endLoopPos']} onchange={(v) => setZone('endLoopPos', v)} />
    </div>
  {/if}

  {#if editable}
    <div class="acts row">
      <button type="button" class="btn small" data-testid="range-add" onclick={() => ed.startPick({ mode: 'add' })}>Add sample…</button>
      <!-- A whole folder at once, roots and boundaries worked out (issue #33). -->
      <button type="button" class="btn small" data-testid="range-from-folder" onclick={() => ed.which && multisample.start(ed.which)}>From folder…</button>
      {#if hasFiles}
        <!-- The one thing the instrument cannot do to a preset it already has:
             work out its roots again without throwing the ranges away. -->
        <button
          type="button"
          class="btn small"
          data-testid="range-redetect-start"
          disabled={!!multisample.busy}
          title="Read these samples again and work out what note each was recorded at"
          onclick={() => ed.which && void multisample.redetect(ed.which)}
        >Re-detect roots…</button>
      {/if}
      {#if current}
        <button type="button" class="btn small" data-testid="range-change" onclick={() => ed.startPick({ mode: 'set', index: sel })}>Change sample…</button>
        <button type="button" class="btn small" data-testid="range-split-below" onclick={() => ed.startPick({ mode: 'below', index: sel })}>Split, new below…</button>
        <button type="button" class="btn small" data-testid="range-split-above" onclick={() => ed.startPick({ mode: 'above', index: sel })}>Split, new above…</button>
      {/if}
    </div>
  {/if}

  <!-- The import's modal owns these while it is open; the rest of the time
       (a re-detect, a shift, a left-out file that won't fit) this is where
       they land. -->
  {#if !multisample.open && (multisample.busy || multisample.error || multisample.notice || stash.checkError)}
    <div class="status" data-testid="range-status">
      {#if multisample.busy}
        <Status kind="busy">{multisample.busy}… {Math.round(multisample.progress * 100)}%</Status>
      {:else if multisample.error}
        <Status kind="err" testid="range-error">{multisample.error}</Status>
      {:else if multisample.notice}
        <Status kind="ok" testid="range-notice">{multisample.notice}</Status>
      {:else if stash.checkError}
        <Status kind="err" testid="missing-check-error">Could not check the card for these samples: {stash.checkError}</Status>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  /* A 70-range instrument scrolls its list rather than burying the page. */
  .scroll { overflow: auto; max-height: 44vh; margin-top: 10px; }
  .mono { font-family: var(--mono); font-size: 10.5px; color: #cfc6b6; white-space: nowrap; }
  .zone { color: var(--faint); }
  .fname { font-family: var(--mono); font-size: 10.5px; }
  .miss { color: var(--warn); cursor: help; margin-right: 4px; }
  .miss.pending { color: var(--faint); }
  td.acts { text-align: right; white-space: nowrap; }
  tr:focus-visible { outline-offset: -2px; }
  /* The preview sits first, as it does on the kit's rows; the fetch progress
     of a sample read off the Deluge shows beside it while it loads. */
  .playcell { width: 58px; white-space: nowrap; }
  .play.live { color: var(--brass-hi); border-color: var(--brass-dim); }
  .play:disabled { opacity: .35; cursor: default; }
  .play:disabled:hover { color: var(--faint); border-color: transparent; }
  .pct { display: inline-block; width: 30px; text-align: right; font-variant-numeric: tabular-nums; color: var(--faint); }
  /* Fixed width: the play glyph swaps ▶ for ■ and they measure differently,
     which nudged the whole row sideways on every click. */
  .mini {
    background: none; border: 1px solid transparent; color: var(--faint); cursor: pointer; font-size: 11px;
    line-height: 1; padding: 2px 0; border-radius: 2px; width: 24px; text-align: center;
  }
  .mini:hover { color: var(--brass-hi); border-color: var(--edge-hi); }
  .acts.row { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0 4px; }
  .h3 .sub { font-family: var(--mono); text-transform: none; letter-spacing: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lead { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .src { color: var(--muted); }
  .legend { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 14px; margin: 9px 0 0 4px; font-family: var(--cond); font-size: 11px; line-height: 1.4; color: var(--faint); }
  .legend b { color: #cfc6b6; font-weight: 600; }
  .status { margin: 1px 0 0; }
</style>
