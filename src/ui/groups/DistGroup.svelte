<script lang="ts">
  import { SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import HexKnob from '../controls/HexKnob.svelte'
  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
</script>

<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="bitCrush" label="Bitcrush" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="sampleRateReduction" label="Decimation" order={SOUND_PARAM_ATTRS} {sound} />
</div>
