<script lang="ts">
  import { CABLE_ATTR_ORDER, type SoundElement } from '../../core/preset'
  import { cableMenu, cables, removeCable, setCableMenu } from '../../core/preset/sound'
  import { formatCable } from '../../core/params/scale'
  import { setAttr } from '../../core/xml'
  import { paramLabel } from '../../core/preset'
  import Knob from '../controls/Knob.svelte'
  import Select from '../controls/Select.svelte'
  import { destinationOptions, sourceOptions } from '../options'
  import { sourceColor } from '../sources'
  import { editor } from '../state/editor.svelte'
  import { picker } from '../state/picker.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const list = $derived(cables(sound))
  const polarity = $derived(editor.supports('patchCablePolarity'))

  // A cable created elsewhere (right-click on a control, issue #13) scrolls
  // into view and glows briefly, so the amount is right there to edit.
  let root: HTMLElement | undefined = $state()
  const revealed = (c: (typeof list)[number]) =>
    editor.reveal !== null && c.attrs.source === editor.reveal.source && c.attrs.destination === editor.reveal.destination
  $effect(() => {
    if (editor.reveal === null || root === undefined) return
    root.querySelector('.cable.new')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const t = setTimeout(() => (editor.reveal = null), 1800)
    return () => clearTimeout(t)
  })
</script>

<div class="cables" bind:this={root}>
  {#each list as c, i (c)}
    {@const effPolarity = c.attrs.polarity ?? (c.attrs.source === 'aftertouch' ? 'unipolar' : 'bipolar')}
    <div class="cable" class:hl={editor.inspect === c.attrs.source} class:new={revealed(c)} data-cable={i}>
      <!-- The elbow leaves the source field's centre, squares down, and squares
           back in to the destination field's centre: signal flow, not decoration. -->
      <svg class="arrow" width="20" height="96" viewBox="0 0 20 96" aria-hidden="true">
        <path d="M20 33 H 5 V 84 H 9" fill="none" stroke={sourceColor(c.attrs.source)} stroke-width="2" stroke-linejoin="miter" />
        <path d="M9 79 L 17 84 L 9 89 Z" fill={sourceColor(c.attrs.source)} />
      </svg>
      <div class="sel">
        <Select label="Source" name="cable{i}.source" value={c.attrs.source} options={sourceOptions(editor.supports)} onchange={(v) => setAttr(c, 'source', v, CABLE_ATTR_ORDER)} />
        <Select label="Destination" name="cable{i}.destination" value={c.attrs.destination} options={destinationOptions(editor.supports)} onchange={(v) => setAttr(c, 'destination', v, CABLE_ATTR_ORDER)} />
      </div>
      <div class="amt">
        <Knob label="Amount" value={Math.round(cableMenu(c) / 100)} min={-50} max={50} onchange={(n) => setCableMenu(c, n * 100)} param="cable{i}.amount" title={formatCable(cableMenu(c))} />
        {#if polarity}
          <!-- An absent polarity is bipolar, except an aftertouch source which
               defaults unipolar (readPatchCablesFromFile, patch_cable_set.cpp:827-833). -->
          <div class="pol" class:default={c.attrs.polarity === undefined}>
            <button type="button" class:on={effPolarity === 'bipolar'} data-attr="cable{i}.polarity.bipolar" title={c.attrs.polarity === undefined && effPolarity === 'bipolar' ? 'default · bipolar' : 'Bipolar'} onclick={() => setAttr(c, 'polarity', 'bipolar', CABLE_ATTR_ORDER)}>± bi</button>
            <button type="button" class:on={effPolarity === 'unipolar'} data-attr="cable{i}.polarity.unipolar" title={c.attrs.polarity === undefined && effPolarity === 'unipolar' ? 'default · unipolar' : 'Unipolar'} onclick={() => setAttr(c, 'polarity', 'unipolar', CABLE_ATTR_ORDER)}>+ uni</button>
          </div>
        {/if}
      </div>
      <button type="button" class="btn small x" title="Remove cable" onclick={() => removeCable(sound, c)}>✕</button>
      {#if c.children.length}
        <div class="nested">{c.children.length} cable{c.children.length === 1 ? '' : 's'} modulate this depth (kept as is)</div>
      {/if}
    </div>
  {:else}
    <p class="empty">Nothing patched. Every knob is exactly its stored value.</p>
  {/each}
</div>
<div class="add">
  <!-- Same picker as a control's right-click; the row lands on LPF Freq and
       both sides stay editable in place. -->
  <button type="button" class="btn small" data-testid="add-cable" onclick={(e) => picker.show('lpfFrequency', paramLabel('lpfFrequency'), e.clientX, e.clientY)}>+ Cable</button>
</div>

<style>
  .cables { margin: 6px 0 0 4px; }
  .cable { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 6px 8px; align-items: start; padding: 7px 8px; border-radius: 3px; background: #1b1815; border: 1px solid var(--edge); margin-bottom: 6px; }
  .cable.hl { border-color: var(--brass-dim); }
  .cable.new { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass-dim), 0 0 14px rgba(212, 163, 77, .25); }
  .sel { display: grid; gap: 5px; }
  /* The svg overhangs its column so the elbow's ends actually touch the fields. */
  .arrow { display: block; margin-right: -8px; }
  .amt { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .pol { display: flex; gap: 2px; }
  .pol button {
    background: #100e0c; border: 1px solid var(--edge-hi); border-radius: 3px; color: var(--muted); cursor: pointer;
    font-family: var(--cond); font-size: 9.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; padding: 2px 6px;
  }
  .pol button.on { background: linear-gradient(180deg, #3d2f15, #251c0e); border-color: var(--brass-dim); color: var(--brass-hi); }
  /* A default (file omits polarity) shows dimmed, not italic — small caps stay legible. */
  .pol.default button.on { opacity: .75; }
  .x { color: var(--faint); }
  .nested { grid-column: 1 / -1; font-family: var(--mono); font-size: 9.5px; color: var(--faint); }
  .add { margin: 4px 0 0 4px; }
</style>
