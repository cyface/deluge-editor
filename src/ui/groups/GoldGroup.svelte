<script lang="ts">
  /**
   * The 16 gold-encoder assignments: 8 mod-button pages × 2 knobs, bottom
   * knob first in the file, editable (issue #23). A slot the file doesn't
   * carry shows the stock assignment as its default; the first edit writes
   * the full 16-entry array the way the firmware would (`ensureModKnobs`).
   */
  import { STOCK_MOD_KNOBS, type SoundElement } from '../../core/preset'
  import { modKnobs, setModKnob, type ModKnobAssign } from '../../core/preset/sound'
  import type { ModKnobElement } from '../../core/preset/types'
  import Select from '../controls/Select.svelte'
  import { knobParamOptions, sourceOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const knobs = $derived(modKnobs(sound))
  const paramOpts = $derived(knobParamOptions(editor.supports))
  const sourceOpts = $derived([{ value: '', label: 'Direct' }, ...sourceOptions(editor.supports)])

  // The volume family is one knob target the firmware disambiguates by source
  // (ensureKnobReferencesCorrectVolume, sound.cpp:1317); the select shows the
  // canonical name and setModKnob writes the right string for the source.
  const canon = (p: string | undefined) =>
    p === 'volume' || p === 'volumePostReverbSend' ? 'volumePostFX' : p

  const knob = (i: number): ModKnobElement | undefined => knobs[i]
  const stock = (i: number) => STOCK_MOD_KNOBS[i]
  const deviates = (k: ModKnobElement | undefined, i: number) =>
    k !== undefined &&
    (k.attrs.controlsParam !== stock(i)?.controlsParam ||
      k.attrs.patchAmountFromSource !== stock(i)?.patchAmountFromSource ||
      k.attrs.patchAmountFromSecondSource !== undefined)

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
        {@const src = k ? (k.attrs.patchAmountFromSource ?? '') : undefined}
        <div class="slot" class:dev={deviates(k, i)}>
          <Select label={i % 2 ? 'Top Knob' : 'Bottom Knob'} name="modKnob{i}.controlsParam" value={canon(k?.attrs.controlsParam)} options={paramOpts} fallback={k ? undefined : canon(stock(i).controlsParam)} onchange={(v) => assign(i, { controlsParam: v as ModKnobAssign['controlsParam'] })} />
          <Select label="Via" name="modKnob{i}.patchAmountFromSource" value={src} options={sourceOpts} fallback={k ? undefined : (stock(i).patchAmountFromSource ?? '')} onchange={(v) => assign(i, { patchAmountFromSource: (v || undefined) as ModKnobAssign['patchAmountFromSource'] })} />
          {#if k?.attrs.patchAmountFromSecondSource}
            <div class="second">
              <Select label="2nd Source" name="modKnob{i}.patchAmountFromSecondSource" value={k.attrs.patchAmountFromSecondSource} options={sourceOpts} onchange={(v) => assign(i, { patchAmountFromSecondSource: (v || undefined) as ModKnobAssign['patchAmountFromSecondSource'] })} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
<p class="hint">A parameter on a gold encoder is drawn with a brass face. “Via” makes the knob set a patch cable's strength instead of the parameter itself. The assignments are positional in the file.</p>

<style>
  .gold { display: grid; gap: 6px; margin: 8px 0 0 4px; }
  .gpage { border: 1px solid var(--edge); border-radius: 3px; padding: 6px 7px; background: #1a1714; }
  .n { font-family: var(--cond); font-size: 9.5px; letter-spacing: .11em; text-transform: uppercase; color: var(--faint); margin-bottom: 3px; }
  .slot { display: grid; grid-template-columns: 3fr 2fr; gap: 4px 6px; align-items: end; padding: 3px 0 3px 5px; border-left: 2px solid transparent; }
  .slot.dev { border-left-color: var(--brass-dim); }
  .second { grid-column: 1 / -1; }
</style>
