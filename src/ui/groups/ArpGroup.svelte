<script lang="ts">
  import { ARP_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import Select from '../controls/Select.svelte'
  import { HELP } from '../help'
  import { arpModeOptions, arpMpeOptions, arpNoteModeOptions, arpOctaveModeOptions, oldArpModeOptions, syncLevelOptions, syncTypeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
  const arp = $derived(child(sound, 'arpeggiator'))
  const A = () => ensureChild(sound, 'arpeggiator', SOUND_CHILD_ORDER)
  const set = (name: string) => (v: string | number) => setAttr(A(), name, String(v), ARP_ATTR_ORDER)
  const modern = $derived(editor.supports('arpModes'))
</script>

<!-- Fallbacks are ArpeggiatorSettings' member defaults (modulation/arpeggiator.h:73-99,
     syncType from the constructor); syncLevel is derived from the song, so no constant. -->
<div class="fields">
  {#if modern}
    <Select label="Arp" name="arpeggiator.arpMode" value={arp?.attrs.arpMode} options={arpModeOptions()} fallback="off" title={HELP['arp.arpMode']} onchange={set('arpMode')} />
    <Select label="Note Order" name="arpeggiator.noteMode" value={arp?.attrs.noteMode} options={arpNoteModeOptions(editor.supports)} fallback="up" title={HELP['arp.noteMode']} onchange={set('noteMode')} />
    <Select label="Octave Order" name="arpeggiator.octaveMode" value={arp?.attrs.octaveMode} options={arpOctaveModeOptions()} fallback="up" title={HELP['arp.octaveMode']} onchange={set('octaveMode')} />
  {:else}
    <Select label="Mode" name="arpeggiator.mode" value={arp?.attrs.mode} options={oldArpModeOptions()} fallback="off" title={HELP['arp.mode']} onchange={set('mode')} />
  {/if}
  <Select label="Sync" name="arpeggiator.syncLevel" value={arp?.attrs.syncLevel} options={syncLevelOptions()} title={HELP['arp.syncLevel']} onchange={set('syncLevel')} />
  {#if editor.supports('syncType')}
    <Select label="Sync Type" name="arpeggiator.syncType" value={arp?.attrs.syncType} options={syncTypeOptions()} fallback="0" title={HELP['arp.syncType']} onchange={set('syncType')} />
  {/if}
  <NumberField label="Octaves" name="arpeggiator.numOctaves" value={arp?.attrs.numOctaves} min={1} max={8} fallback={2} title={HELP['arp.numOctaves']} onchange={set('numOctaves')} />
  {#if editor.supports('arpMpeVelocity')}
    <Select label="MPE → Velocity" name="arpeggiator.mpeVelocity" value={arp?.attrs.mpeVelocity} options={arpMpeOptions()} fallback="off" title={HELP['arp.mpeVelocity']} onchange={set('mpeVelocity')} />
  {/if}
  {#if editor.supports('arpChordType')}
    <NumberField label="Chord Type" name="arpeggiator.chordType" value={arp?.attrs.chordType} min={0} max={32} fallback={0} title={HELP['arp.chordType']} onchange={set('chordType')} />
  {/if}
  {#if editor.supports('arp3')}
    <NumberField label="Step Repeat" name="arpeggiator.stepRepeat" value={arp?.attrs.stepRepeat} min={1} max={16} fallback={1} title={HELP['arp.stepRepeat']} onchange={set('stepRepeat')} />
  {/if}
</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="arpeggiatorRate" label="Rate" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="arpeggiatorGate" label="Gate" order={SOUND_PARAM_ATTRS} {sound} />
  {#if modern}
    {#if !editor.supports('arp3')}
      <!-- From Arpeggiator 3.0 these live in the Randomiser panel, as on the
           device; this firmware's menu still keeps them under the arp. -->
      <HexKnob el={params(sound)} ensure={P} attr="ratchetProbability" label="Ratchet Prob" order={SOUND_PARAM_ATTRS} {sound} />
      <HexKnob el={params(sound)} ensure={P} attr="ratchetAmount" label="Ratchets" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
    <HexKnob el={params(sound)} ensure={P} attr="sequenceLength" label="Seq Length" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
  {#if editor.supports('arpRhythm')}
    <HexKnob el={params(sound)} ensure={P} attr="rhythm" label="Rhythm" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
</div>
