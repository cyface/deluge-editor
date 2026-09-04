<script lang="ts" module>
  /* The open slot survives the panel being re-dealt into another masonry stack (see `ModsGroup`). */
  let open = $state<number | null>(null)
</script>

<script lang="ts">
  /**
   * The 16 gold-encoder assignments: 8 mod-button pages × 2 knobs, bottom
   * knob first in the file, editable (issue #23). A slot the file doesn't
   * carry shows the stock assignment as its default; the first edit writes
   * the full 16-entry array the way the firmware would (`ensureModKnobs`).
   * Rarely edited, so each slot is a one-line summary that expands in place
   * to the selects (issue #27).
   */
  import { STOCK_MOD_KNOBS, type SoundElement } from '../../core/preset'
  import { canonicalKnobParam, modKnobSummary } from '../../core/preset/modknobs'
  import { modKnobs, setModKnob, type ModKnobAssign } from '../../core/preset/sound'
  import type { ModKnobElement } from '../../core/preset/types'
  import Select from '../controls/Select.svelte'
  import { HELP } from '../help'
  import { knobParamOptions, sourceOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const knobs = $derived(modKnobs(sound))
  const paramOpts = $derived(knobParamOptions(editor.supports))
  const sourceOpts = $derived([{ value: '', label: 'Direct' }, ...sourceOptions(editor.supports)])
  // The volume family is one knob target the firmware disambiguates by source
  // (`canonicalKnobParam`); the select shows the canonical name and setModKnob
  // writes the right string for the source.
  const canon = canonicalKnobParam

  const knob = (i: number): ModKnobElement | undefined => knobs[i]
  const stock = (i: number) => STOCK_MOD_KNOBS[i]
  const deviates = (k: ModKnobElement | undefined, i: number) =>
    k !== undefined &&
    (k.attrs.controlsParam !== stock(i)?.controlsParam ||
      k.attrs.patchAmountFromSource !== stock(i)?.patchAmountFromSource ||
      k.attrs.patchAmountFromSecondSource !== undefined)

  // A source the gate hides (or an unknown one) still shows its raw string,
  // same rule as Select.svelte: the control tells the truth.
  const sourceLabel = (s: string) => sourceOpts.find((o) => o.value === s)?.label ?? s
  const summary = (k: ModKnobElement | undefined, i: number) => modKnobSummary(k, i, sourceLabel)

  function assign(i: number, patch: Partial<ModKnobAssign>): void {
    const k = knob(i)
    const cur: ModKnobAssign = {
      controlsParam: k?.attrs.controlsParam ?? stock(i).controlsParam,
      patchAmountFromSource: k?.attrs.patchAmountFromSource ?? (k ? undefined : stock(i).patchAmountFromSource),
      patchAmountFromSecondSource: k?.attrs.patchAmountFromSecondSource,
    }
    // A new source orphans a second source (it modulated the old cable's depth).
    if ('patchAmountFromSource' in patch && !('patchAmountFromSecondSource' in patch)) {
      patch.patchAmountFromSecondSource = undefined
    }
    setModKnob(sound, i, { ...cur, ...patch })
  }
</script>

<div class="gold">
  {#each Array.from({ length: 8 }, (_, n) => n) as p (p)}
    <div class="gpage">
      <div class="n">Page {p + 1}</div>
      <!-- Top knob first on screen; the file writes the bottom knob first. -->
      {#each [2 * p + 1, 2 * p] as i (i)}
        {@const k = knob(i)}
        {@const text = summary(k, i)}
        <div class="slot" class:dev={deviates(k, i)}>
          <button type="button" class="row" data-knob={i} aria-expanded={open === i} title={`${HELP['gold.slot']}\n\n${text}`} onclick={() => (open = open === i ? null : i)}>
            <span class="pos">{i % 2 ? 'Top' : 'Bottom'}</span>
            <span class="what" class:default={k === undefined}>{text}</span>
            <span class="chev">{open === i ? '▾' : '▸'}</span>
          </button>
          {#if open === i}
            {@const src = k ? (k.attrs.patchAmountFromSource ?? '') : undefined}
            <div class="edit">
              <Select label="Parameter" name="modKnob{i}.controlsParam" value={canon(k?.attrs.controlsParam)} options={paramOpts} fallback={k ? undefined : canon(stock(i).controlsParam)} title={HELP['gold.param']} onchange={(v) => assign(i, { controlsParam: v as ModKnobAssign['controlsParam'] })} />
              <Select label="Via" name="modKnob{i}.patchAmountFromSource" value={src} options={sourceOpts} fallback={k ? undefined : (stock(i).patchAmountFromSource ?? '')} title={HELP['gold.source']} onchange={(v) => assign(i, { patchAmountFromSource: (v || undefined) as ModKnobAssign['patchAmountFromSource'] })} />
              {#if k?.attrs.patchAmountFromSecondSource}
                <Select label="2nd Source" name="modKnob{i}.patchAmountFromSecondSource" value={k.attrs.patchAmountFromSecondSource} options={sourceOpts} title={HELP['gold.secondSource']} onchange={(v) => assign(i, { patchAmountFromSecondSource: (v || undefined) as ModKnobAssign['patchAmountFromSecondSource'] })} />
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
<p class="hint">“Via” makes the knob set a patch cable's strength instead of the parameter itself.</p>

<style>
  .gold { display: grid; gap: 5px; margin: 8px 0 0 4px; }
  .gpage { border: 1px solid var(--edge); border-radius: 3px; padding: 4px 7px 5px; background: #1a1714; }
  .n { font-family: var(--cond); font-size: 9.5px; letter-spacing: .11em; text-transform: uppercase; color: var(--faint); margin-bottom: 1px; }
  .slot { border-left: 2px solid transparent; padding-left: 5px; }
  .slot.dev { border-left-color: var(--brass-dim); }
  .row {
    display: flex; align-items: baseline; gap: 7px; width: 100%; padding: 2px 0; margin: 0;
    background: none; border: none; cursor: pointer; text-align: left;
  }
  .pos { flex: none; width: 42px; font-family: var(--cond); font-size: 9.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: 11px; color: #ddd4c4; }
  /* A slot the file omits shows the stock assignment dimmed-italic, like a select's default entry. */
  .what.default { color: var(--faint); font-style: italic; }
  .row:hover .what { color: var(--brass-hi); }
  .chev { flex: none; font-size: 9px; color: var(--faint); }
  .edit { display: grid; gap: 5px; padding: 2px 0 6px; }
</style>
