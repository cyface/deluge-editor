<script lang="ts">
  /**
   * One row of the kit table (`KitRows.svelte`): its grip, preview, pad
   * colour, name, source, repeat and direction, volume and pan, and the
   * reorder/remove actions. What it shows is read straight off the row's
   * element through `core/preset`; the table owns the selection and the
   * drag, and hears about them through the callbacks.
   */
  import { rowDescription as describe, rowSampleFile as sampleFile, rowSampleOsc as sampleOsc, rowSourceAction as sourceAction } from '../core/kit/rows'
  import { parsePan } from '../core/params/scale'
  import { OSC_ATTR_ORDER, type DrumRow } from '../core/preset'
  import { paramMenu, setParamMenu } from '../core/preset/sound'
  import { setAttr } from '../core/xml'
  import Select from './controls/Select.svelte'
  import Waveform from './controls/Waveform.svelte'
  import { notOnCard, notOnCardYet } from './copy'
  import { HELP, UI_HELP } from './help'
  import { loopModeOptions } from './options'
  import { audio } from './state/audio.svelte'
  import { isSoundRow } from './state/editor.svelte'
  import { samples as stash } from './state/samples.svelte'

  interface Props {
    row: DrumRow
    /** Position in pad order, from 0. */
    i: number
    count: number
    selected: boolean
    /** A dragged row is about to land here. */
    over: boolean
    onselect: () => void
    onkeydown: (e: KeyboardEvent) => void
    ondragstart: (e: DragEvent) => void
    ondragend: () => void
    ondragover: () => void
    ondrop: () => void
    onmove: (to: number) => void
    onremove: () => void
    onrename: (name: string) => void
    onpick: () => void
  }
  let { row: r, i, count, selected, over, onselect, onkeydown, ondragstart, ondragend, ondragover, ondrop, onmove, onremove, onrename, onpick }: Props = $props()

  const PADS = ['--osc', '--at', '--flt', '--env1', '--lfo1', '--lfo2', '--fx', '--vel']
  const DIRECTIONS = [{ value: '0', label: 'Fwd' }, { value: '1', label: 'Rev' }]

  // What a row shows — its description, its sample and what Source offers — is `src/core/kit/rows.ts`.

  const vol = (r: DrumRow) => (isSoundRow(r) ? (paramMenu(r, 'volume') ?? '') : '')
  const pan = (r: DrumRow) => {
    if (!isSoundRow(r)) return ''
    const p = paramMenu(r, 'pan')
    return p === undefined ? '' : p === 0 ? 'CTR' : `${p < 0 ? 'L' : 'R'}${Math.abs(p)}` // the knob's spelling (docs/decisions.md)
  }

  /** Commit a typed volume: 0–50, the Deluge's own scale. Empty leaves the value alone. */
  function commitVol(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const n = Math.round(Number(input.value.trim()))
    if (isSoundRow(r) && input.value.trim() !== '' && Number.isFinite(n)) {
      setParamMenu(r, 'volume', Math.max(0, Math.min(50, n)))
    }
    input.value = String(vol(r)) // re-show the stored value (clamped, or unchanged on bad input)
  }

  /** Commit a typed pan: CTR, L1–L25, R1–R25, or a signed number (negative = left) — `parsePan` reads every spelling. */
  function commitPan(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const n = parsePan(input.value)
    if (isSoundRow(r) && n !== undefined) setParamMenu(r, 'pan', n)
    input.value = pan(r)
  }

  /** A click on the row selects it — unless it landed on one of the row's own controls. */
  function click(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('input, select, button')) return
    onselect()
  }
  const file = $derived(sampleFile(r))
  const sampled = $derived(sampleOsc(r))
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<tr
  class:on={selected}
  class:over
  data-row={i}
  tabindex="0"
  aria-selected={selected}
  onclick={click}
  {onkeydown}
  ondragover={(e) => { e.preventDefault(); ondragover() }}
  ondrop={(e) => { e.preventDefault(); ondrop() }}
>
  <td
    class="grip"
    draggable="true"
    title={UI_HELP['ui.row.drag']}
    aria-hidden="true"
    ondragstart={ondragstart}
    {ondragend}
  >⋮⋮</td>
  <td class="playcell">
    {#if file}
      <button
        type="button"
        class="play"
        class:live={audio.playing === file}
        data-testid="row-play"
        disabled={audio.loading !== null || (!audio.canPreview(file) && audio.playing !== file)}
        title={UI_HELP[audio.playing === file ? 'ui.preview.stop' : audio.canPreview(file) ? 'ui.preview.play' : 'ui.preview.unavailable']}
        aria-label="Preview row {i + 1}"
        onclick={() => audio.toggle(file, sampled?.attrs.reversed === '1')}
      >{audio.playing === file ? '■' : audio.loading === file ? `${Math.round(audio.progress * 100)}%` : '▶'}</button>
    {/if}
  </td>
  <td class="wavecell">
    {#if file}<Waveform fileName={file} />{/if}
  </td>
  <td><span class="pad" style="background:var({PADS[i % PADS.length]})"></span></td>
  <td class="num">{i + 1}</td>
  <td class="namecell">
    {#if selected}
      <input
        class="rename"
        data-testid="row-name"
        value={r.attrs.name ?? ''}
        placeholder="(unnamed)"
        spellcheck="false"
        aria-label="Name of row {i + 1}"
        onchange={(e) => onrename((e.currentTarget as HTMLInputElement).value.trim())}
      />
    {:else}
      <span class="rname">{r.attrs.name ?? '(unnamed)'}</span>
    {/if}
  </td>
  <td class="src">
    {#if file && stash.missing.has(file)}
      {@const held = stash.bytes.has(file)}
      <span
        class="warn"
        class:pending={held}
        data-testid="row-missing"
        title={held ? notOnCardYet('kit') : notOnCard('kit', 'row')}
      >⚠</span>
    {/if}
    {#if sampled}
      {@const act = sourceAction(r)}
      <!-- The row's own way to its sample: the oscillator panel is a
           long way down the page, and on a blank row there is
           nothing here to click at all. -->
      <button
        type="button"
        class="pick"
        data-testid="row-sample"
        title={UI_HELP[act === 'layers' ? 'ui.row.layers' : act === 'ranges' ? 'ui.row.ranges' : 'ui.row.pickSample']}
        aria-label="{act === 'sample' ? 'Sample' : 'Layers'} for row {i + 1}"
        onclick={onpick}
      >{act === 'sample' ? 'Sample…' : act === 'layers' ? 'Layers…' : 'Ranges…'}</button>
    {/if}
    <span class="file" title={describe(r)}>{describe(r)}</span>
  </td>
  <td>
    {#if sampled}
      <!-- repeatMode = SampleRepeatMode::CUT in the Source constructor (source.cpp:38). -->
      <Select
        label="Repeat"
        testid="row-mode"
        compact
        value={sampled.attrs.loopMode}
        options={loopModeOptions()}
        fallback="0"
        title={HELP['osc.loopMode']}
        onchange={(v) => setAttr(sampled, 'loopMode', v, OSC_ATTR_ORDER)}
      />
    {/if}
  </td>
  <td>
    {#if sampled}
      <!-- `reversed` is false in the Source constructor (source.cpp, tag `beta`). -->
      <Select
        label="Direction"
        testid="row-direction"
        compact
        value={sampled.attrs.reversed}
        options={DIRECTIONS}
        fallback="0"
        title={UI_HELP['ui.row.direction']}
        onchange={(v) => setAttr(sampled, 'reversed', v, OSC_ATTR_ORDER)}
      />
    {/if}
  </td>
  <td class="num">
    {#if isSoundRow(r)}
      <input
        class="cell"
        data-testid="row-vol"
        value={vol(r)}
        placeholder="—"
        title={UI_HELP['ui.row.volume']}
        aria-label="Volume of row {i + 1}"
        spellcheck="false"
        onchange={commitVol}
      />
    {/if}
  </td>
  <td class="num">
    {#if isSoundRow(r)}
      <input
        class="cell"
        data-testid="row-pan"
        value={pan(r)}
        placeholder="—"
        title={UI_HELP['ui.row.pan']}
        aria-label="Pan of row {i + 1}"
        spellcheck="false"
        onchange={commitPan}
      />
    {/if}
  </td>
  <td class="acts">
    <button type="button" class="act" title={UI_HELP['ui.row.up']} aria-label="Move row {i + 1} up" disabled={i === 0} onclick={() => onmove(i - 1)}>▲</button>
    <button type="button" class="act" title={UI_HELP['ui.row.down']} aria-label="Move row {i + 1} down" disabled={i === count - 1} onclick={() => onmove(i + 1)}>▼</button>
    <button type="button" class="act x" title={UI_HELP['ui.row.remove']} aria-label="Remove row {i + 1}" onclick={onremove}>×</button>
  </td>
</tr>

<style>
  .grip { cursor: grab; color: var(--faint); font-size: 10px; letter-spacing: -1px; user-select: none; width: 16px; }
  .grip:active { cursor: grabbing; }
  tr.over td { border-top: 2px solid var(--brass); }
  tr:focus-visible { outline-offset: -2px; }
  /* Same face as .rname (theme.css): editing must not shrink the name. The
     negative margin swallows the border+padding so the input's text sits
     exactly where the plain names in the other rows start. */
  .rename {
    width: calc(100% + 6px); min-width: 70px; box-sizing: border-box; margin-left: -6px;
    background: var(--well); border: 1px solid var(--edge-hi);
    border-radius: var(--r-s); padding: 1px 5px; font-family: var(--cond); font-size: 13px; font-weight: 600;
    letter-spacing: .05em; text-transform: uppercase; color: #e0d7c7;
  }
  .rename:focus { outline: 1px solid var(--brass); }
  .acts { white-space: nowrap; }
  .act {
    background: none; border: 0; color: var(--faint); cursor: pointer; font-size: 9px; padding: 2px 3px; line-height: 1;
  }
  .act:hover:not(:disabled) { color: var(--brass-hi); }
  .act:disabled { opacity: .25; cursor: default; }
  .act.x { font-size: 13px; vertical-align: -1px; }
  .act.x:hover { color: var(--bad-text); }
  .playcell { width: 30px; text-align: center; }
  .wavecell { width: 88px; line-height: 0; }
  /* The greedy Source column must not squeeze names into wrapping. */
  .namecell { min-width: 150px; }
  .namecell :global(.rname) { white-space: nowrap; }
  .cell {
    width: 34px; box-sizing: border-box; background: var(--well); border: 1px solid var(--edge); border-radius: var(--r-s);
    color: #cfc6b6; font-family: var(--mono); font-size: 10.5px; padding: 2px 4px; text-align: right;
  }
  .cell:hover, .cell:focus { border-color: var(--brass-dim); color: #efe6d7; outline: none; }
  .cell::placeholder { color: var(--faint); }
  /* Source takes all spare width; the path only ellipsizes when the screen
     truly runs out (the .scroll wrapper still allows a horizontal scroll). */
  .src { width: 100%; }
  .src :global(.file) { display: inline; max-width: none; }
  .pick {
    background: none; border: 1px solid var(--edge); border-radius: var(--r-s); color: var(--muted); cursor: pointer;
    font-family: var(--cond); font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
    padding: 1px 5px; margin-right: 6px; vertical-align: 1px;
  }
  .pick:hover { color: var(--brass-hi); border-color: var(--brass-dim); }
  .warn { color: var(--bad-text); margin-right: 4px; cursor: help; }
  .warn.pending { color: var(--warn-text); }
  .play {
    background: none; border: 1px solid var(--edge-hi); border-radius: var(--r-s); color: var(--muted); cursor: pointer;
    font-size: 9px; line-height: 1; padding: 3px 5px; min-width: 22px; font-variant-numeric: tabular-nums;
  }
  .play:hover:not(:disabled) { color: var(--brass-hi); border-color: var(--brass-dim); }
  .play.live { color: var(--brass-hi); border-color: var(--brass-dim); }
  .play:disabled { opacity: .35; cursor: default; }
</style>
