<script lang="ts">
  import { ARP_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import Select from '../controls/Select.svelte'
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

<div class="fields">
  {#if modern}
    <Select label="Arp" name="arpeggiator.arpMode" value={arp?.attrs.arpMode} options={arpModeOptions()} onchange={set('arpMode')} />
    <Select label="Note Order" name="arpeggiator.noteMode" value={arp?.attrs.noteMode} options={arpNoteModeOptions(editor.supports)} onchange={set('noteMode')} />
    <Select label="Octave Order" name="arpeggiator.octaveMode" value={arp?.attrs.octaveMode} options={arpOctaveModeOptions()} onchange={set('octaveMode')} />
  {:else}
    <Select label="Mode" name="arpeggiator.mode" value={arp?.attrs.mode} options={oldArpModeOptions()} onchange={set('mode')} />
  {/if}
  <Select label="Sync" name="arpeggiator.syncLevel" value={arp?.attrs.syncLevel} options={syncLevelOptions()} onchange={set('syncLevel')} />
  {#if editor.supports('syncType')}
    <Select label="Sync Type" name="arpeggiator.syncType" value={arp?.attrs.syncType} options={syncTypeOptions()} onchange={set('syncType')} />
  {/if}
  <NumberField label="Octaves" name="arpeggiator.numOctaves" value={arp?.attrs.numOctaves} min={1} max={8} onchange={set('numOctaves')} />
  {#if editor.supports('arpMpeVelocity')}
    <Select label="MPE → Velocity" name="arpeggiator.mpeVelocity" value={arp?.attrs.mpeVelocity} options={arpMpeOptions()} onchange={set('mpeVelocity')} />
  {/if}
  {#if editor.supports('arpChordType')}
    <NumberField label="Chord Type" name="arpeggiator.chordType" value={arp?.attrs.chordType} min={0} max={32} onchange={set('chordType')} />
  {/if}
  {#if editor.supports('arp3')}
    <NumberField label="Step Repeat" name="arpeggiator.stepRepeat" value={arp?.attrs.stepRepeat} min={1} max={16} onchange={set('stepRepeat')} />
  {/if}
</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="arpeggiatorRate" label="Rate" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="arpeggiatorGate" label="Gate" order={SOUND_PARAM_ATTRS} {sound} />
  {#if modern}
    <HexKnob el={params(sound)} ensure={P} attr="ratchetProbability" label="Ratchet Prob" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="ratchetAmount" label="Ratchets" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="sequenceLength" label="Seq Length" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
  {#if editor.supports('arpRhythm')}
    <HexKnob el={params(sound)} ensure={P} attr="rhythm" label="Rhythm" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
</div>
{#if editor.supports('arp3')}
  <div class="h3">Randomiser</div>
  <div class="knobrow">
    <HexKnob el={params(sound)} ensure={P} attr="noteProbability" label="Note" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="bassProbability" label="Bass" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="chordProbability" label="Chord" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="chordPolyphony" label="Chord Poly" order={SOUND_PARAM_ATTRS} {sound} />
    {#if editor.supports('arpReverseGlideSwap')}
      <HexKnob el={params(sound)} ensure={P} attr="reverseProbability" label="Reverse" order={SOUND_PARAM_ATTRS} {sound} />
      <HexKnob el={params(sound)} ensure={P} attr="glideProbability" label="Glide" order={SOUND_PARAM_ATTRS} {sound} />
      <HexKnob el={params(sound)} ensure={P} attr="swapProbability" label="Swap" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
  </div>
{/if}
{#if editor.supports('arpSpread')}
  <div class="h3">Spread</div>
  <div class="knobrow">
    <HexKnob el={params(sound)} ensure={P} attr="spreadVelocity" label="Velocity" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="spreadGate" label="Gate" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="spreadOctave" label="Octave" order={SOUND_PARAM_ATTRS} {sound} />
  </div>
{/if}
