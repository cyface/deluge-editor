<script lang="ts">
  import { SOUND_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, UNISON_ATTR_ORDER, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import IntKnob from '../controls/IntKnob.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import Select from '../controls/Select.svelte'
  import { HELP } from '../help'
  import { polyphonyOptions, voicePriorityOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const unison = $derived(child(sound, 'unison'))
  const ensureUnison = () => ensureChild(sound, 'unison', SOUND_CHILD_ORDER)
  const set = (name: string) => (v: string | number) => setAttr(sound, name, String(v), SOUND_ATTR_ORDER)
</script>

<!-- Absent-attribute defaults are the deserializer's: Sound's member
     initialisers stand when the file omits the attribute (sound.h, tag
     `beta`: polyphonic = PolyphonyMode::POLY, maxVoiceCount = 8,
     transpose = 0, voicePriority = VoicePriority::MEDIUM). -->
<div class="fields">
  <Select label="Polyphony" name="polyphonic" value={sound.attrs.polyphonic} fallback="poly" options={polyphonyOptions()} title={HELP['sound.polyphonic']} onchange={set('polyphonic')} />
  {#if editor.supports('maxVoices')}
    <NumberField label="Max Voices" name="maxVoices" value={sound.attrs.maxVoices} min={1} max={16} fallback={8} title={HELP['sound.maxVoices']} onchange={set('maxVoices')} />
  {/if}
  <NumberField label="Transpose" name="transpose" value={sound.attrs.transpose} min={-96} max={96} fallback={0} title={HELP['sound.transpose']} onchange={set('transpose')} />
  <Select label="Voice Priority" name="voicePriority" value={sound.attrs.voicePriority} fallback="1" options={voicePriorityOptions()} title={HELP['sound.voicePriority']} onchange={set('voicePriority')} />
</div>
<div class="knobrow">
  <IntKnob el={unison} ensure={ensureUnison} attr="num" label="Unison" min={1} max={8} order={UNISON_ATTR_ORDER} title={HELP['unison.num']} />
  <IntKnob el={unison} ensure={ensureUnison} attr="detune" label="Detune" min={0} max={50} order={UNISON_ATTR_ORDER} title={HELP['unison.detune']} />
  {#if editor.supports('unisonSpread')}
    <IntKnob el={unison} ensure={ensureUnison} attr="spread" label="Spread" min={0} max={50} order={UNISON_ATTR_ORDER} title={HELP['unison.spread']} />
  {/if}
  <HexKnob el={params(sound)} ensure={() => ensureParams(sound)} attr="portamento" label="Portamento" order={SOUND_PARAM_ATTRS} {sound} />
</div>
