<script lang="ts">
  import { DELAY_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import Select from '../controls/Select.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { HELP } from '../help'
  import { syncLevelOptions, syncTypeOptions } from '../options'
  import { editor } from '../state/editor.svelte'
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
<div class="fields">
  <Select label="Sync" name="delay.syncLevel" value={delay?.attrs.syncLevel} options={syncLevelOptions()} title={HELP['delay.syncLevel']} onchange={(v) => setAttr(D(), 'syncLevel', v, DELAY_ATTR_ORDER)} />
  {#if editor.supports('syncType')}
    <Select label="Sync Type" name="delay.syncType" value={delay?.attrs.syncType} options={syncTypeOptions()} title={HELP['delay.syncType']} onchange={(v) => setAttr(D(), 'syncType', v, DELAY_ATTR_ORDER)} />
  {/if}
  <div class="f"><span class="lbl">Stereo</span><Toggle label="Ping-pong" name="delay.pingPong" value={delay?.attrs.pingPong} title={HELP['delay.pingPong']} onchange={(v) => setAttr(D(), 'pingPong', v, DELAY_ATTR_ORDER)} /></div>
  <div class="f"><span class="lbl">Character</span><Toggle label="Analog" name="delay.analog" value={delay?.attrs.analog} title={HELP['delay.analog']} onchange={(v) => setAttr(D(), 'analog', v, DELAY_ATTR_ORDER)} /></div>
</div>
<div class="h3">Reverb</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="reverbAmount" label="Send" order={SOUND_PARAM_ATTRS} {sound} />
</div>

<style>
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
</style>
