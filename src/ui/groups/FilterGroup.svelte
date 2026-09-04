<script lang="ts">
  import { SOUND_ATTR_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params, paramMenu, setParamMenu } from '../../core/preset/sound'
  import { setAttr } from '../../core/xml'
  import FilterGraph, { type FilterBinding } from '../controls/FilterGraph.svelte'
  import HexKnob from '../controls/HexKnob.svelte'
  import { HELP } from '../help'
  import { editor } from '../state/editor.svelte'
  import FilterModeFields from './FilterModeFields.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
  const filters: FilterBinding = {
    attr: (name) => sound.attrs[name],
    read: (p) => paramMenu(sound, p),
    write: (p, menu) => setParamMenu(sound, p, menu),
  }
</script>

<FilterGraph {filters} />
<FilterModeFields attrs={sound.attrs} tip={(k) => HELP[k]} onchange={(name, v) => setAttr(sound, name, v, SOUND_ATTR_ORDER)} />
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
    <HexKnob el={params(sound)} ensure={P} attr="waveFold" label="Wavefolder" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
</div>
