<script lang="ts">
  import { SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { child, ensureChild } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import { HELP } from '../help'
  import DelayFields from './DelayFields.svelte'
  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
  const delay = $derived(child(sound, 'delay'))
  const D = () => ensureChild(sound, 'delay', SOUND_CHILD_ORDER)
</script>

<div class="h3">Delay</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="delayRate" label="Time" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="delayFeedback" label="Feedback" order={SOUND_PARAM_ATTRS} {sound} />
</div>
<DelayFields {delay} ensure={D} tip={(k) => HELP[k]} />
<div class="h3">Reverb</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="reverbAmount" label="Amount" order={SOUND_PARAM_ATTRS} {sound} />
</div>
