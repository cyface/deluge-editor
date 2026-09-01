<script lang="ts">
  import { SOUND_ATTR_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import Select from '../controls/Select.svelte'
  import { HELP } from '../help'
  import { modFxOptions } from '../options'
  import { editor } from '../state/editor.svelte'
  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
</script>

<div class="fields">
  <Select label="Type" name="modFXType" value={sound.attrs.modFXType} options={modFxOptions(editor.supports)} title={HELP['sound.modFXType']} onchange={(v) => setAttr(sound, 'modFXType', v, SOUND_ATTR_ORDER)} />
</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="modFXRate" label="Rate" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="modFXDepth" label="Depth" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="modFXOffset" label="Offset" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="modFXFeedback" label="Feedback" order={SOUND_PARAM_ATTRS} {sound} />
</div>
