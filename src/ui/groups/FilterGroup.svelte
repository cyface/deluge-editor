<script lang="ts">
  import { SOUND_ATTR_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { setAttr } from '../../core/xml'
  import FilterGraph from '../controls/FilterGraph.svelte'
  import HexKnob from '../controls/HexKnob.svelte'
  import Select from '../controls/Select.svelte'
  import { hpfModeOptions, lpfModeOptions, routeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
  const set = (name: string) => (v: string) => setAttr(sound, name, v, SOUND_ATTR_ORDER)
</script>

<div class="split">
  <div>
    <FilterGraph {sound} />
    <p class="hint">Drag a control point: sideways for cutoff, up for resonance.</p>
  </div>
  <div>
    <div class="fields">
      <Select label="LPF Mode" name="lpfMode" value={sound.attrs.lpfMode} options={lpfModeOptions(editor.supports)} onchange={set('lpfMode')} />
      {#if editor.supports('hpfMode')}
        <Select label="HPF Mode" name="hpfMode" value={sound.attrs.hpfMode} options={hpfModeOptions()} onchange={set('hpfMode')} />
      {/if}
      {#if editor.supports('filterRoute')}
        <Select label="Routing" name="filterRoute" value={sound.attrs.filterRoute} options={routeOptions()} onchange={set('filterRoute')} />
      {/if}
    </div>
    <div class="knobrow">
      <HexKnob el={params(sound)} ensure={P} attr="lpfFrequency" label="LPF Freq" order={SOUND_PARAM_ATTRS} {sound} />
      <HexKnob el={params(sound)} ensure={P} attr="lpfResonance" label="LPF Res" order={SOUND_PARAM_ATTRS} {sound} />
      {#if editor.supports('filterMorph')}
        <HexKnob el={params(sound)} ensure={P} attr="lpfMorph" label="LPF Morph" order={SOUND_PARAM_ATTRS} {sound} />
      {/if}
      <HexKnob el={params(sound)} ensure={P} attr="hpfFrequency" label="HPF Freq" order={SOUND_PARAM_ATTRS} {sound} />
      <HexKnob el={params(sound)} ensure={P} attr="hpfResonance" label="HPF Res" order={SOUND_PARAM_ATTRS} {sound} />
      {#if editor.supports('filterMorph')}
        <HexKnob el={params(sound)} ensure={P} attr="hpfMorph" label="HPF Morph" order={SOUND_PARAM_ATTRS} {sound} />
      {/if}
      {#if editor.supports('waveFold')}
        <HexKnob el={params(sound)} ensure={P} attr="waveFold" label="Fold" order={SOUND_PARAM_ATTRS} {sound} title="Wavefolder on the oscillator mix, before the filters" />
      {/if}
    </div>
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(256px, 1fr); gap: 16px; margin-top: 5px; }
  @media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
  .split :global(.graph), .split :global(.glegend), .split .fields, .split .knobrow { margin-left: 0; }
  .split .fields { margin-top: 0; }
</style>
