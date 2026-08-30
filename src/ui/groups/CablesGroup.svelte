<script lang="ts">
  import { CABLE_ATTR_ORDER, paramLabel, type ParamName, type PatchSource, type SoundElement } from '../../core/preset'
  import { addCable, cableMenu, cables, removeCable, setCableMenu } from '../../core/preset/sound'
  import { formatCable } from '../../core/params/scale'
  import { setAttr } from '../../core/xml'
  import Knob from '../controls/Knob.svelte'
  import Select from '../controls/Select.svelte'
  import { destinationOptions, polarityOptions, sourceOptions } from '../options'
  import { sourceColor, sourceName } from '../sources'
  import { editor } from '../state/editor.svelte'
  import { groupOf } from '../groups'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const list = $derived(cables(sound))
  const polarity = $derived(editor.supports('patchCablePolarity'))
</script>

<div class="cables">
  {#each list as c, i (c)}
    <div class="cable" class:hl={editor.inspect === c.attrs.source} data-cable={i}>
      <span class="sw" style="background:{sourceColor(c.attrs.source)}"></span>
      <div class="sel">
        <Select label="Source" name="cable{i}.source" value={c.attrs.source} options={sourceOptions(editor.supports)} onchange={(v) => setAttr(c, 'source', v, CABLE_ATTR_ORDER)} />
        <Select label="Destination" name="cable{i}.destination" value={c.attrs.destination} options={destinationOptions(editor.supports)} onchange={(v) => setAttr(c, 'destination', v, CABLE_ATTR_ORDER)} />
        {#if polarity}
          <Select label="Polarity" name="cable{i}.polarity" value={c.attrs.polarity} options={polarityOptions()} onchange={(v) => setAttr(c, 'polarity', v, CABLE_ATTR_ORDER)} />
        {/if}
      </div>
      <Knob label="Amount" value={Math.round(cableMenu(c) / 100)} min={-50} max={50} onchange={(n) => setCableMenu(c, n * 100)} param="cable{i}.amount" title={formatCable(cableMenu(c))} />
      <button type="button" class="btn small x" title="Remove cable" onclick={() => removeCable(sound, c)}>✕</button>
      {#if c.children.length}
        <div class="nested">{c.children.length} cable{c.children.length === 1 ? '' : 's'} modulate this depth (kept as is)</div>
      {/if}
      <div class="where">{sourceName(c.attrs.source)} → {paramLabel(c.attrs.destination ?? '?')}{#if groupOf(c.attrs.destination)} · {groupOf(c.attrs.destination)?.name}{/if}</div>
    </div>
  {:else}
    <p class="empty">Nothing patched. Every knob is exactly its stored value.</p>
  {/each}
</div>
<div class="add">
  <button type="button" class="btn small" data-testid="add-cable" onclick={() => addCable(sound, 'lfo1' as PatchSource, 'lpfFrequency' as ParamName, 0)}>+ Cable</button>
</div>

<style>
  .cables { margin: 6px 0 0 4px; }
  .cable { display: grid; grid-template-columns: 6px 1fr auto auto; gap: 8px; align-items: end; padding: 7px 8px; border-radius: 3px; background: #1b1815; border: 1px solid var(--edge); margin-bottom: 6px; }
  .cable.hl { border-color: var(--brass-dim); }
  .sw { width: 6px; height: 100%; min-height: 40px; border-radius: 2px; }
  .sel { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px; }
  .x { color: var(--faint); }
  .nested, .where { grid-column: 2 / -1; font-family: var(--mono); font-size: 9.5px; color: var(--faint); }
  .add { margin: 4px 0 0 4px; }
</style>
