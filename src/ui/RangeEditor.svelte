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
   * are the two ways in, side by side.
   */
  import { noteName } from '../core/preset/notes'
  import { removeRange, rootName, rootParts, setRangeRoot, setRangeTopNote, setRangeZone, type SampleRange } from '../core/preset/ranges'
  import KeyMap from './controls/KeyMap.svelte'
  import NumberField from './controls/NumberField.svelte'
  import { HELP } from './help'
  import { audio } from './state/audio.svelte'
  import { editor } from './state/editor.svelte'
  import { multisample, type RangeRootFrom } from './state/multisample.svelte'
  import { ranges as ed } from './state/ranges.svelte'
  import { samples as stash } from './state/samples.svelte'

  const osc = $derived(ed.osc)
  const list = $derived(ed.ranges)
  const sel = $derived(ed.index)
  const current = $derived(ed.range)
  const label = $derived(ed.which === 2 ? 'B' : 'A')
  const reversed = $derived(osc?.attrs.reversed === '1')
  const last = $derived(list.length - 1)

  const base = (path: string | undefined): string => (path ?? '').split('/').pop() ?? ''
  const tuning = (r: SampleRange): string =>
    r.transpose === 0 && r.cents === 0 ? '—' : [r.transpose ? `${r.transpose > 0 ? '+' : ''}${r.transpose} st` : '', r.cents ? `${r.cents > 0 ? '+' : ''}${r.cents} ¢` : ''].filter(Boolean).join(' ')

  const num = (v: string | undefined): number => Number(v ?? 0) || 0
  const zoneOf = (r: SampleRange | undefined) => ({
    startSamplePos: num(r?.zone?.attrs.startSamplePos),
    endSamplePos: num(r?.zone?.attrs.endSamplePos),
    startLoopPos: num(r?.zone?.attrs.startLoopPos),
    endLoopPos: num(r?.zone?.attrs.endLoopPos),
  })
  /**
   * A zero loop point is not a position — it means the marker isn't set. The
   * voice falls back to the zone's own start and end when it loops
   * (`loopStart = holder->loopStartPos ? … : holder->startPos`, and the same
   * for the end, `model/voice/voice.cpp:2138-2139`, upstream/community beta),
   * and the serializer omits the attribute rather than writing 0
   * (`sound.cpp:3650-3655`). So say so, instead of printing a marker at 0.
   */
  const loopText = (start: number, end: number): string =>
    `loop ${start || 'zone start'}–${end || 'zone end'}`
  const zoneText = (r: SampleRange): string => {
    const z = zoneOf(r)
    if (!r.zone) return '—'
    const play = `${z.startSamplePos}–${z.endSamplePos || 'end'}`
    return z.startLoopPos || z.endLoopPos ? `${play} · ${loopText(z.startLoopPos, z.endLoopPos)}` : play
  }
  /** Zero in a loop field is the marker being off, not a position of zero. */
  const loopFmt = (n: number): string => (n === 0 ? 'off' : String(n))

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

  /**
   * What the folder import left beside these ranges (issue #33): where each
   * root came from, the offset it fitted, and the files it could not place.
   * It belongs here rather than in a panel of its own — this is the editor for
   * what the import wrote, and an import is a way of filling it in.
   */
  const session = $derived(multisample.session?.which === ed.which ? multisample.session : null)
  const SOURCE: Record<RangeRootFrom, { short: string; why: string }> = {
    user: { short: 'you', why: 'you set this root by hand' },
    file: { short: 'WAV tag', why: 'the note the file itself declares, in its smpl/inst chunk' },
    name: { short: 'file name', why: 'read from the name, through the folder offset' },
    between: { short: 'spaced', why: 'evenly between the neighbours that did resolve' },
    kept: { short: 'kept', why: 'nothing in the file or its name placed it, so its root is untouched' },
    unknown: { short: '—', why: 'nothing placed this one' },
  }
  const LEGEND = $derived(
    session?.kind === 'redetect' ? (['file', 'name', 'between', 'kept'] as const) : (['file', 'name', 'between', 'user'] as const),
  )

  /**
   * Re-detecting the roots of ranges that are already here (issue #33): read
   * again, then show what would move. Nothing is written until Apply, and
   * boundaries are never part of it — the instrument's own route to this
   * question throws every range away first, which is why it lives here.
   */
  const plan = $derived(multisample.plan?.which === ed.which ? multisample.plan : null)
  /** The rows worth showing: the ones that would move, and the ones nothing placed. */
  const moves = $derived(plan ? plan.rows.filter((r) => r.root === undefined || r.root !== r.was) : [])
  const agreed = $derived(plan ? plan.rows.length - moves.length : 0)
  const readable = $derived(plan ? plan.rows.length - plan.unreadable.length : 0)
  const hasFiles = $derived(list.some((r) => r.fileName))
  /** The note field beside each left-out file, keyed by its path. */
  let assignNote = $state<Record<string, number>>({})
  const noteFor = (fileName: string, named: number | undefined): number =>
    assignNote[fileName] ?? (named === undefined ? 60 : Math.round(named / 100))

  const sessionLead = $derived(session?.kind === 'redetect' ? 'Re-detected' : 'From folder')
  const sessionWhat = $derived(
    !session
      ? ''
      : session.kind === 'redetect'
        ? `${session.placed} root${session.placed === 1 ? '' : 's'} changed`
        : `${session.placed} sample${session.placed === 1 ? '' : 's'} placed${session.leftOut.length ? `, ${session.leftOut.length} left out` : ''}`,
  )

  const summary = $derived(
    list.length === 0
      ? 'no sample yet'
      : `${list.length} sample${list.length === 1 ? '' : 's'}${ed.editable ? ' · drag a split to move a boundary' : ''}`,
  )
</script>

<section class="panel" data-testid="range-editor">
  <div class="ph">
    <h2>Osc {label} Ranges</h2>
    <span class="sub">{summary}</span>
    <button type="button" class="x" aria-label="Close the range editor" onclick={() => ed.close()}>×</button>
  </div>

  {#if !ed.editable}
    <!-- Velocity layers are a fork-only feature (no `rangeTopVelocity` in stock
         firmware): shown, never rewritten, so the file passes through as it came. -->
    <p class="caution" data-testid="range-velocity">
      These ranges are keyed by velocity, which this editor doesn't model — they are shown read-only and pass through unchanged.
    </p>
  {/if}

  {#if list.length > 1}
    <!-- The map is the boundaries; with one sample there are none, and the
         band would span the keyboard whatever the sample is. -->
    <KeyMap
      ranges={list}
      selected={sel}
      onselect={(i) => ed.select(i)}
      onmove={ed.editable ? (i, note) => osc && setRangeTopNote(osc, i, note) : undefined}
    />
  {/if}

  {#if plan}
    <!-- A re-detect the user hasn't accepted: nothing has been written yet
         (issue #33). Roots only — the boundaries between them are decisions,
         and the instrument's own version of this deletes every range first. -->
    <div class="import propose" data-testid="range-redetect">
      <div class="line">
        <span class="lead">Re-detected</span>
        <span class="mono who">
          {plan.changed === 0
            ? 'nothing would move'
            : `${plan.changed} of ${plan.rows.length} root${plan.rows.length === 1 ? '' : 's'} would move`}
        </span>
        <span class="why">
          {#if plan.folders.length > 1}
            {plan.folders.length} folders, each calibrated on its own
          {:else if plan.folders[0]?.offsetFrom === 'anchors'}
            calibrated against the files that declare a root
          {:else}
            read from the file names — nothing declares a root to calibrate against
          {/if}
          {#if agreed}· {agreed} already agree{/if}
        </span>
        <span class="shift">
          <button type="button" class="btn small go" data-testid="range-redetect-apply" onclick={() => multisample.applyRedetect()}>Apply</button>
          <button type="button" class="btn small" data-testid="range-redetect-cancel" onclick={() => multisample.cancelRedetect()}>Cancel</button>
        </span>
      </div>

      {#if plan.disordered}
        <p class="caution" data-testid="range-redetect-disordered">
          These roots don't climb with the keyboard — a sample would be rooted below the one beneath it. That is what a
          misread name or an assumed offset looks like, so read the list before applying.
        </p>
      {/if}
      {#if plan.unreadable.length}
        <p class="caution" data-testid="range-redetect-unread">
          {readable === 0
            ? 'No WAV header could be read, so this comes from the file names alone.'
            : `${plan.unreadable.length} of ${plan.rows.length} WAV headers could not be read; those files were placed by name alone.`}
          Connect the Deluge, or import the folder from this computer, to use the notes the files themselves declare.
        </p>
      {/if}

      {#if moves.length}
        <div class="leftout">
          <span class="lead">What this would do</span>
          <ul class="props">
            {#each moves as m (m.index)}
              <li>
                <span class="fname" title={m.fileName}>{m.base}</span>
                <span class="mono move">{rootName(m.was)} → {m.root === undefined ? 'kept' : rootName(m.root)}</span>
                <span class="why">{SOURCE[m.from].why}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}

  {#if session}
    <div class="import" data-testid="range-import">
      <div class="line">
        <span class="lead">{sessionLead}</span>
        <span class="mono who">{session.folder ?? 'samples'}</span>
        <span class="why">
          {sessionWhat}
          · roots {session.offsetFrom === 'anchors' ? 'calibrated against the files that declare one' : 'read from the file names'}
        </span>
        <span class="shift">
          <span class="lead">Shift all</span>
          <button type="button" class="btn small" data-testid="range-shift-down-oct" aria-label="Down an octave" onclick={() => multisample.shift(-12)}>−12</button>
          <button type="button" class="btn small" aria-label="Down a semitone" onclick={() => multisample.shift(-1)}>−1</button>
          <button type="button" class="btn small" aria-label="Up a semitone" onclick={() => multisample.shift(1)}>+1</button>
          <button type="button" class="btn small" aria-label="Up an octave" onclick={() => multisample.shift(12)}>+12</button>
        </span>
        <button type="button" class="btn small" data-testid="range-import-dismiss" onclick={() => multisample.dismissSession()}>Done</button>
      </div>

      {#if session.discardedFileRoots}
        <!-- The firmware's own rule (sample_browser.cpp:1360): every file in
             the folder declaring the same note means a lazy exporter tagged
             them all, so the tags are worth nothing. -->
        <p class="caution" data-testid="range-import-discarded">
          Every WAV in that folder declared the same root note, so the tags were thrown away — as the Deluge throws them away. The file names carried the import instead.
        </p>
      {/if}

      {#if session.leftOut.length}
        <div class="leftout" data-testid="range-left-out">
          <span class="lead">Left out</span>
          <ul>
            {#each session.leftOut as l (l.file.fileName)}
              <li>
                <span class="fname" title={l.file.fileName}>{l.base}</span>
                <span class="why">{l.reason === 'no root' ? 'no note in its name or its header' : 'no key band left beside its neighbours'}</span>
                <input
                  class="note"
                  type="number"
                  min="0"
                  max="127"
                  aria-label="Root note for {l.base}"
                  value={noteFor(l.file.fileName, l.named)}
                  onchange={(e) => (assignNote[l.file.fileName] = Number((e.currentTarget as HTMLInputElement).value))}
                />
                <span class="mono rn">{noteName(noteFor(l.file.fileName, l.named))}</span>
                <button type="button" class="btn small" data-testid="range-assign" onclick={() => multisample.assign(l.file.fileName, noteFor(l.file.fileName, l.named))}>Add</button>
                <button type="button" class="mini" title="Leave this file out" aria-label="Discard {l.base}" onclick={() => multisample.discard(l.file.fileName)}>×</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}

  {#if list.length}
    <div class="scroll">
      <table class="rows" data-testid="range-rows">
        <thead><tr><th class="playcell"></th><th class="num">#</th><th>Keys</th><th>Root</th>{#if session}<th>Root from</th>{/if}<th>Sample</th><th>Tuning</th><th>Zone</th><th></th></tr></thead>
        <tbody>
          {#each list as r, i (r.el)}
            <tr class:on={i === sel} data-range={i} onclick={() => ed.select(i)}>
              <td class="playcell">
                {#if r.fileName}
                  {@const f = r.fileName}
                  <button
                    type="button"
                    class="mini play"
                    class:live={audio.playing === f}
                    data-testid="range-play"
                    disabled={audio.loading !== null || (!audio.canPreview(f) && audio.playing !== f)}
                    title={audio.playing === f
                      ? 'Stop'
                      : audio.canPreview(f)
                        ? 'Preview this sample'
                        : 'Sample is not on this computer — connect the Deluge to preview it'}
                    aria-label="{audio.playing === f ? 'Stop' : 'Preview'} {base(f)}"
                    onclick={(e) => { e.stopPropagation(); void audio.toggle(f, reversed) }}
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
                {@const src = SOURCE[session.from[r.fileName ?? ''] ?? 'unknown']}
                <td class="mono src" title={src.why}>{src.short}</td>
              {/if}
              <td>
                {#if r.fileName && stash.missing.has(r.fileName)}
                  {@const held = stash.bytes.has(r.fileName)}
                  <span
                    class="miss"
                    class:pending={held}
                    data-testid="range-missing"
                    title={held
                      ? 'Not on the card yet — saving the preset will copy it there'
                      : 'Not on the card — the Deluge loads the preset anyway, but this range will be silent'}
                  >⚠</span>
                {/if}
                <span class="fname" title={r.fileName}>{base(r.fileName) || '(no file)'}</span>
              </td>
              <td class="mono">{tuning(r)}</td>
              <td class="mono zone">{zoneText(r)}</td>
              <td class="acts">
                {#if ed.editable}
                  <button type="button" class="mini" title="Remove this range" aria-label="Remove range {i + 1}" data-testid="range-remove" onclick={(e) => { e.stopPropagation(); remove(i) }}>×</button>
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
          <span class="item"><b>{SOURCE[key].short}</b> — {SOURCE[key].why}</span>
        {/each}
      </p>
    {/if}
  {:else}
    <p class="empty">This oscillator has no sample. Add one to start a multi-sample instrument.</p>
  {/if}

  {#if current && ed.editable}
    <div class="h3">Range {sel + 1}<span class="sub">{current.fileName ?? '(no file)'}</span></div>
    <div class="fields">
      <div class="f">
        <span class="lbl">Sample</span>
        <div class="ro" title={current.fileName}>{base(current.fileName) || '(none)'}</div>
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

  {#if ed.editable}
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
        <p class="busy">{multisample.busy}… {Math.round(multisample.progress * 100)}%</p>
      {:else if multisample.error}
        <p class="err" role="alert" data-testid="range-error">{multisample.error}</p>
      {:else if multisample.notice}
        <p class="okline" data-testid="range-notice">{multisample.notice}</p>
      {:else if stash.checkError}
        <p class="err" role="alert" data-testid="missing-check-error">Could not check the card for these samples: {stash.checkError}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .panel { margin: 9px 0 0; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge); border-radius: 4px; padding: 9px 11px 12px; position: relative; overflow: hidden; }
  .panel::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--osc); }
  .ph { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px 4px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; white-space: nowrap; }
  .ph .x { margin-left: auto; background: none; border: 0; color: var(--faint); font-size: 15px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .ph .x:hover { color: var(--brass-hi); }
  /* A 70-range instrument scrolls its list rather than burying the page. */
  .scroll { overflow: auto; max-height: 44vh; margin-top: 10px; }
  .mono { font-family: var(--mono); font-size: 10.5px; color: #cfc6b6; white-space: nowrap; }
  .zone { color: var(--faint); }
  .fname { font-family: var(--mono); font-size: 10.5px; }
  .miss { color: var(--warn); cursor: help; margin-right: 4px; }
  .miss.pending { color: var(--faint); }
  td.acts { text-align: right; white-space: nowrap; }
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
  .import { margin: 10px 0 0 4px; border: 1px solid var(--edge-hi); border-radius: 3px; padding: 8px 9px; background: #100e0c; }
  .import .line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .import .who { color: #e2d9ca; }
  .import .why { font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .import .shift { display: flex; align-items: center; gap: 5px; margin-left: auto; }
  .lead { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .leftout { margin-top: 9px; }
  .leftout ul { list-style: none; margin: 5px 0 0; padding: 0; }
  .leftout li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .leftout .why { flex: 1; min-width: 120px; }
  .note { width: 46px; background: #0c0b0a; border: 1px solid var(--edge-hi); border-radius: 3px; color: #ddd4c4; font-family: var(--mono); font-size: 10.5px; height: 21px; padding: 0 4px; }
  .rn { color: var(--faint); min-width: 30px; }
  .src { color: var(--muted); }
  .legend { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 14px; margin: 9px 0 0 4px; font-family: var(--cond); font-size: 11px; line-height: 1.4; color: var(--faint); }
  .legend b { color: #cfc6b6; font-weight: 600; }
  .caution { margin: 8px 0 0 4px; padding: 6px 8px; border: 1px solid #4a3a1a; background: #171208; border-radius: 3px; font-size: 11px; color: var(--warn); }
  .propose { border-color: var(--brass, #c5a059); }
  .props { max-height: 30vh; overflow-y: auto; }
  .props .move { min-width: 130px; }
  .status { margin: 9px 0 0 4px; }
  .status p { margin: 0; font-family: var(--mono); font-size: 10.5px; }
  .busy { color: #cfe3c9; }
  .err { padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; color: #e8a08f; border-radius: 3px; }
  .okline { color: #a9c99f; }
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
</style>
