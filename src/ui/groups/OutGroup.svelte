<script lang="ts">
  import {
    AUDIO_COMPRESSOR_ATTR_ORDER, EQUALIZER_ATTR_ORDER, MIDI_OUTPUT_ATTR_ORDER, PARAMS_CHILD_ORDER,
    SIDECHAIN_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, STUTTER_ATTR_ORDER, type SoundElement,
  } from '../../core/preset'
  import { addCable, cableMenu, cables, ensureParams, params, setCableMenu } from '../../core/preset/sound'
  import {
    blendToKnob, compressorToKnob, formatCable, knobToBlend, knobToCompressor, menuToSidechainAttack, menuToSidechainRelease,
    sidechainAttackToMenu, sidechainReleaseToMenu,
  } from '../../core/params/scale'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import Knob from '../controls/Knob.svelte'
  import IntKnob from '../controls/IntKnob.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import Select from '../controls/Select.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { HELP } from '../help'
  import { syncLevelOptions, syncTypeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
  const eq = $derived(params(sound) && child(params(sound)!, 'equalizer'))
  const EQ = () => ensureChild(P(), 'equalizer', PARAMS_CHILD_ORDER)
  // Community ≥ 1.1 writes <sidechain>, official <compressor>; the reader takes either.
  const sc = $derived(child(sound, 'sidechain') ?? child(sound, 'compressor'))
  // The ducking amount is the sidechain → volumePostReverbSend cable (its source
  // is spelled "compressor" in XML), same value the device's VOLUME DUCKING edits.
  const duckCable = $derived(
    cables(sound).find((c) => c.attrs.source === 'compressor' && c.attrs.destination === 'volumePostReverbSend'),
  )
  const setDucking = (n: number) => {
    if (duckCable) setCableMenu(duckCable, n * 100)
    else setCableMenu(addCable(sound, 'compressor', 'volumePostReverbSend'), n * 100)
  }
  const SC = () => ensureChild(sound, editor.supports('sidechainTag') ? 'sidechain' : 'compressor', SOUND_CHILD_ORDER)
  const comp = $derived(child(sound, 'audioCompressor'))
  const COMP = () => ensureChild(sound, 'audioCompressor', SOUND_CHILD_ORDER)
  const stutter = $derived(child(sound, 'stutter'))
  const ST = () => ensureChild(sound, 'stutter', SOUND_CHILD_ORDER)
  const midi = $derived(child(sound, 'midiOutput'))
  const MIDI = () => ensureChild(sound, 'midiOutput', SOUND_CHILD_ORDER)
  const chan = (n: number) => (n === 255 ? 'none' : n === 254 ? 'MPE lower' : n === 253 ? 'MPE upper' : `ch ${n + 1}`)
</script>

<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="volume" label="Volume" order={SOUND_PARAM_ATTRS} {sound} extraDest="volume" />
  <HexKnob el={params(sound)} ensure={P} attr="pan" label="Pan" scale="pan" order={SOUND_PARAM_ATTRS} {sound} />
</div>

<div class="h3">EQ</div>
<div class="knobrow">
  <HexKnob el={eq} ensure={EQ} attr="bass" label="Bass" order={EQUALIZER_ATTR_ORDER} {sound} />
  <HexKnob el={eq} ensure={EQ} attr="treble" label="Treble" order={EQUALIZER_ATTR_ORDER} {sound} />
  <HexKnob el={eq} ensure={EQ} attr="bassFrequency" label="Bass Freq" order={EQUALIZER_ATTR_ORDER} {sound} dest="bassFreq" />
  <HexKnob el={eq} ensure={EQ} attr="trebleFrequency" label="Treble Freq" order={EQUALIZER_ATTR_ORDER} {sound} dest="trebleFreq" />
</div>

<div class="h3">Sidechain</div>
<p class="hint">Ducking from the song's sidechain.</p>
<div class="knobrow">
  <!-- The device's VOLUME DUCKING knob is really the strength of the
       sidechain → volumePostReverbSend patch cable (sidechain::VolumeShortcut,
       gui/ui/menus.cpp:561), so this knob edits that cable. -->
  <Knob label="Ducking" value={duckCable ? Math.round(cableMenu(duckCable) / 100) : 0} min={-50} max={50} param="sidechain.ducking" title={`${HELP['sidechain.ducking']}\n\n${duckCable ? formatCable(cableMenu(duckCable)) : 'no cable yet'}`} onchange={setDucking} />
  <IntKnob el={sc} ensure={SC} attr="attack" label="Attack" read={sidechainAttackToMenu} write={menuToSidechainAttack} order={SIDECHAIN_ATTR_ORDER} title={HELP['sidechain.attack']} />
  <IntKnob el={sc} ensure={SC} attr="release" label="Release" read={sidechainReleaseToMenu} write={menuToSidechainRelease} order={SIDECHAIN_ATTR_ORDER} title={HELP['sidechain.release']} />
  <HexKnob el={params(sound)} ensure={P} attr="compressorShape" label="Shape" order={SOUND_PARAM_ATTRS} {sound} />
</div>
<!-- The <sidechain>/<compressor> reader presets SYNC_LEVEL_NONE /
     SYNC_TYPE_EVEN before reading (mod_controllable_audio.cpp, tag `beta`,
     "Set default values in case they are not configured"). -->
<div class="fields">
  <Select label="Sync" name="sidechain.syncLevel" value={sc?.attrs.syncLevel} fallback="0" options={syncLevelOptions()} title={HELP['sidechain.syncLevel']} onchange={(v) => setAttr(SC(), 'syncLevel', v, SIDECHAIN_ATTR_ORDER)} />
  {#if editor.supports('syncType')}
    <Select label="Sync Type" name="sidechain.syncType" value={sc?.attrs.syncType} fallback="0" options={syncTypeOptions()} title={HELP['sidechain.syncType']} onchange={(v) => setAttr(SC(), 'syncType', v, SIDECHAIN_ATTR_ORDER)} />
  {/if}
</div>

{#if editor.supports('audioCompressor')}
  <div class="h3">Compressor</div>
  <div class="knobrow">
    <HexKnob el={params(sound)} ensure={P} attr="compressorThreshold" label="Threshold" scale="half" order={SOUND_PARAM_ATTRS} {sound} />
    <IntKnob el={comp} ensure={COMP} attr="attack" label="Attack" max={127} read={compressorToKnob} write={knobToCompressor} order={AUDIO_COMPRESSOR_ATTR_ORDER} title={HELP['compressor.attack']} />
    <IntKnob el={comp} ensure={COMP} attr="release" label="Release" max={127} read={compressorToKnob} write={knobToCompressor} order={AUDIO_COMPRESSOR_ATTR_ORDER} title={HELP['compressor.release']} />
    <IntKnob el={comp} ensure={COMP} attr="ratio" label="Ratio" max={127} read={compressorToKnob} write={knobToCompressor} order={AUDIO_COMPRESSOR_ATTR_ORDER} title={HELP['compressor.ratio']} />
    <IntKnob el={comp} ensure={COMP} attr="compHPF" label="Side HPF" max={127} read={compressorToKnob} write={knobToCompressor} order={AUDIO_COMPRESSOR_ATTR_ORDER} title={HELP['compressor.compHPF']} />
    {#if editor.supports('compressorBlend')}
      <IntKnob el={comp} ensure={COMP} attr="compBlend" label="Blend" max={128} read={blendToKnob} write={knobToBlend} order={AUDIO_COMPRESSOR_ATTR_ORDER} title={HELP['compressor.compBlend']} />
    {/if}
  </div>
{/if}

{#if editor.supports('stutterConfig')}
  <div class="h3">Stutter</div>
  <p class="hint">Used only when the sound's own stutter is selected on the device.</p>
  <div class="knobrow">
    <HexKnob el={params(sound)} ensure={P} attr="stutterRate" label="Rate" order={SOUND_PARAM_ATTRS} {sound} />
  </div>
  <!-- StutterConfig's member defaults stand when the attribute is missing:
       quantized = true, reversed = false, pingPong = false
       (model/fx/stutterer.h, tag `beta`). -->
  <div class="fields">
    <div class="f"><span class="lbl">Quantise</span><Toggle label="Quantized" name="stutter.quantized" value={stutter?.attrs.quantized} fallback="1" title={HELP['stutter.quantized']} onchange={(v) => setAttr(ST(), 'quantized', v, STUTTER_ATTR_ORDER)} /></div>
    <div class="f"><span class="lbl">Direction</span><Toggle label="Reverse" name="stutter.reverse" value={stutter?.attrs.reverse} fallback="0" title={HELP['stutter.reverse']} onchange={(v) => setAttr(ST(), 'reverse', v, STUTTER_ATTR_ORDER)} /></div>
    <div class="f"><span class="lbl">Stereo</span><Toggle label="Ping-pong" name="stutter.pingPong" value={stutter?.attrs.pingPong} fallback="0" title={HELP['stutter.pingPong']} onchange={(v) => setAttr(ST(), 'pingPong', v, STUTTER_ATTR_ORDER)} /></div>
  </div>
{/if}

{#if editor.supports('midiOutput')}
  <div class="h3">MIDI Out</div>
  <!-- Sound's members default to the 255 sentinels: outputMidiChannel =
       MIDI_CHANNEL_NONE, outputMidiNoteForDrum = MIDI_NOTE_NONE (sound.h and
       definitions_cxx.hpp, tag `beta`); the format functions name them. -->
  <div class="fields">
    <NumberField label="Channel" name="midiOutput.channel" value={midi?.attrs.channel} min={0} max={255} fallback={255} format={chan} title={HELP['midiOutput.channel']} onchange={(v) => setAttr(MIDI(), 'channel', String(v), MIDI_OUTPUT_ATTR_ORDER)} />
    <NumberField label="Note" name="midiOutput.noteForDrum" value={midi?.attrs.noteForDrum} min={0} max={255} fallback={255} format={(n) => (n === 255 ? 'as played' : String(n))} title={HELP['midiOutput.noteForDrum']} onchange={(v) => setAttr(MIDI(), 'noteForDrum', String(v), MIDI_OUTPUT_ATTR_ORDER)} />
  </div>
{/if}
