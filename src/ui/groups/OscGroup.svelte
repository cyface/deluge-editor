<script lang="ts">
  import {
    OSC_ATTR_ORDER, MODULATOR_ATTR_ORDER, SOUND_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS,
    isKit, type OscElement, type SoundElement,
  } from '../../core/preset'
  import { sampleRanges, soundingOrder } from '../../core/preset/ranges'
  import { ensureParams, osc, oscHasFile, params } from '../../core/preset/sound'
  import { degreesToRetrig, retrigToDegrees } from '../../core/params/scale'
  import { pulseWidthOffered } from '../../core/params/pulse'
  import { child, childrenOf, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import KeyMap from '../controls/KeyMap.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import PulseGraph from '../controls/PulseGraph.svelte'
  import Select from '../controls/Select.svelte'
  import Status from '../controls/Status.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { HELP } from '../help'
  import { loopModeOptions, oscTypeOptions, synthModeOptions } from '../options'
  import { editor } from '../state/editor.svelte'
  import { multisample } from '../state/multisample.svelte'
  import { ranges as rangeEditor } from '../state/ranges.svelte'
  import { samplePick } from '../state/samplepick.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const fm = $derived(sound.attrs.mode === 'fm')
  const ensureOsc = (n: 1 | 2) => () => ensureChild(sound, `osc${n}`, SOUND_CHILD_ORDER)
  const ensureMod = (n: 1 | 2) => () => ensureChild(sound, `modulator${n}`, SOUND_CHILD_ORDER)
  const P = () => ensureParams(sound)
  const retrigFmt = (n: number) => (n < 0 ? 'off' : `${n}°`)

  /**
   * Whether this sound is a kit row. A drum is one sound and one sample —
   * every hit sounds `kNoteForDrum` (`processing/sound/sound_drum.cpp:65`,
   * upstream/community bef6d9df) — so there is no key map to show and no
   * folder to import: the panel offers the one file instead. Ranges already in
   * such a file are a fork's velocity layers, which are shown but never
   * written, so a row that has them keeps its way in to look at them.
   */
  const drum = $derived(editor.preset !== null && isKit(editor.preset))

  /**
   * A wavetable oscillator's ranges, which this editor reads but does not
   * write; sample ranges get the key map and the editor below (issue #29).
   */
  function wavetableFiles(o: OscElement | undefined): string[] {
    const w = o ? child(o, 'wavetableRanges') : undefined
    return w ? childrenOf(w, 'wavetableRange').map((r) => r.attrs.fileName ?? '?') : []
  }
  const shortName = (f: string | undefined): string => (f ?? '').split('/').pop() ?? ''
  const label = ['', 'A', 'B'] as const
  /** What the sample dialog says it is choosing for: the drum by name, else the oscillator. */
  const sampleFor = (n: 1 | 2): string => (drum ? sound.attrs.name || 'this row' : `Osc ${label[n]}`)
  const attr = (n: 1 | 2, s: string) => `osc${label[n]}${s}` as (typeof SOUND_PARAM_ATTRS)[number]
</script>

<!-- The mode reshapes this whole panel (subtractive / FM / ringmod), so it lives here. -->
<div class="fields">
  <Select label="Synth Mode" name="mode" value={sound.attrs.mode} options={synthModeOptions()} title={HELP['sound.mode']} onchange={(v) => setAttr(sound, 'mode', v, SOUND_ATTR_ORDER)} />
</div>

{#each [1, 2] as const as n (n)}
  {@const o = osc(sound, n)}
  <!-- An absent type plays square: the Source constructor default survives file
       load (source.cpp:41) — setupAsDefaultSynth's saw is only for new synths. -->
  {@const type = fm ? 'sine' : (o?.attrs.type ?? 'square')}
  <!-- In FM the firmware hides the osc type menu entirely — carriers are always
       sine (osc::Type::isRelevant, gui/menu_item/osc/type.h) — so no Waveform select. -->
  <div class="h3">Osc {label[n]}{#if fm}<span class="sub">FM carrier · always sine</span>{/if}</div>
  {#if !fm}
    <div class="fields">
      <Select label="Waveform" name="osc{n}.type" value={o?.attrs.type} options={oscTypeOptions(editor.supports)} fallback="square" title={HELP['osc.type']} onchange={(v) => setAttr(ensureOsc(n)(), 'type', v, OSC_ATTR_ORDER)} />
      {#if type === 'sample'}
        <!-- repeatMode = SampleRepeatMode::CUT in the Source constructor (source.cpp:38). -->
        <Select label="Repeat" name="osc{n}.loopMode" value={o?.attrs.loopMode} options={loopModeOptions()} fallback="0" title={HELP['osc.loopMode']} onchange={(v) => setAttr(ensureOsc(n)(), 'loopMode', v, OSC_ATTR_ORDER)} />
      {/if}
    </div>
  {/if}
  <!-- `PulseWidth::isRelevant` (gui/menu_item/osc/pulse_width.h) decides this,
       not the waveform's name: never in FM, never for a sample or an input,
       and a wavetable only once it has a file. DX7 is left out because it
       never reaches the oscillator renderer at all — `Voice::render` hands it
       to `dxVoice->compute`, so the menu's offer of the control is empty. -->
  {@const pw = type !== 'dx7' && pulseWidthOffered(type, { fm, fileLoaded: oscHasFile(o) })}
  <div class="knobrow">
    <HexKnob el={params(sound)} ensure={P} attr={attr(n, 'Volume')} label="Level" order={SOUND_PARAM_ATTRS} {sound} />
    {#if type === 'wavetable'}
      <HexKnob el={params(sound)} ensure={P} attr={attr(n, 'WavetablePosition')} label="Wave Pos" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
    {#if pw}
      <HexKnob el={params(sound)} ensure={P} attr={attr(n, 'PulseWidth')} label="Pulse Width" scale="half" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
    {#if fm}
      <HexKnob el={params(sound)} ensure={P} attr={n === 1 ? 'carrier1Feedback' : 'carrier2Feedback'} label="Feedback" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
  </div>
  {#if pw}
    <PulseGraph {sound} {n} {type} />
  {/if}
  <div class="fields">
    <NumberField label="Transpose" name="osc{n}.transpose" value={o?.attrs.transpose} min={-96} max={96} title={HELP['osc.transpose']} onchange={(v) => setAttr(ensureOsc(n)(), 'transpose', String(v), OSC_ATTR_ORDER)} />
    <NumberField label="Cents" name="osc{n}.cents" value={o?.attrs.cents} min={-50} max={50} title={HELP['osc.cents']} onchange={(v) => setAttr(ensureOsc(n)(), 'cents', String(v), OSC_ATTR_ORDER)} />
    {#if type !== 'sample'}
      <NumberField label="Retrig Phase" name="osc{n}.retrigPhase" value={o?.attrs.retrigPhase === undefined ? undefined : retrigToDegrees(Number(o.attrs.retrigPhase))} min={-1} max={360} format={retrigFmt} title={HELP['osc.retrigPhase']} onchange={(v) => setAttr(ensureOsc(n)(), 'retrigPhase', String(degreesToRetrig(v)), OSC_ATTR_ORDER)} />
    {/if}
    {#if n === 2 && !fm}
      <div class="f"><span class="lbl">Sync</span><Toggle label="Osc Sync" name="osc2.oscillatorSync" value={o?.attrs.oscillatorSync} title={HELP['osc2.oscillatorSync']} onchange={(v) => setAttr(ensureOsc(2)(), 'oscillatorSync', v, OSC_ATTR_ORDER)} /></div>
    {/if}
  </div>
  {#if type === 'sample'}
    <div class="fields">
      <div class="f"><span class="lbl">Reverse</span><Toggle label="Reversed" name="osc{n}.reversed" value={o?.attrs.reversed} title={HELP['osc.reversed']} onchange={(v) => setAttr(ensureOsc(n)(), 'reversed', v, OSC_ATTR_ORDER)} /></div>
      <!-- timeStretchEnable is the device's Pitch/speed menu: the firmware
           maps it to pitchAndSpeedAreIndependent (sound.cpp:3383/3599,
           upstream/community). Not related to repeat-mode Stretch. -->
      <div class="f"><span class="lbl">Pitch/Speed</span><Toggle label="Independent" name="osc{n}.timeStretchEnable" value={o?.attrs.timeStretchEnable} title={HELP['osc.timeStretchEnable']} onchange={(v) => setAttr(ensureOsc(n)(), 'timeStretchEnable', v, OSC_ATTR_ORDER)} /></div>
      <NumberField label="Speed" name="osc{n}.timeStretchAmount" value={o?.attrs.timeStretchAmount} min={-48} max={48} title={HELP['osc.timeStretchAmount']} onchange={(v) => setAttr(ensureOsc(n)(), 'timeStretchAmount', String(v), OSC_ATTR_ORDER)} />
      <div class="f"><span class="lbl">Interp.</span><Toggle label="Linear" name="osc{n}.linearInterpolation" value={o?.attrs.linearInterpolation} title={HELP['osc.linearInterpolation']} onchange={(v) => setAttr(ensureOsc(n)(), 'linearInterpolation', v, OSC_ATTR_ORDER)} /></div>
    </div>
  {/if}
  {#if type === 'sample' && o}
    <!-- Every range, not just the first: a multi-sample oscillator's key map
         is the only place its boundaries are legible. Clicking a band opens
         the range editor on that range. -->
    {@const list = soundingOrder(sampleRanges(o))}
    <div class="fields">
      <div class="f">
        <span class="lbl">{list.length === 1 ? 'Sample' : `${list.length} samples`}</span>
        <div class="ro" title={list.map((r) => r.fileName ?? '(no file)').join('\n')}>
          {list.map((r) => shortName(r.fileName) || '(no file)').join(' · ') || '(none)'}
        </div>
      </div>
    </div>
    {#if list.length === 0}
      <!-- The firmware loads this happily and plays nothing: a SAMPLE source
           with no file has nothing to render (`Source::loadAllSamples`,
           processing/source.cpp:105). Silence is the hardest fault to find on
           the instrument, so it is called out here. -->
      <Status kind="caution" testid="osc-no-sample-{n}">
        This oscillator is set to Sample but has no sample — it will be silent on the Deluge.
      </Status>
    {:else if list.length > 1}
      <!-- Only where there are boundaries to read. One sample spans the whole
           keyboard, so its map is a single band saying nothing the line above
           doesn't. -->
      <KeyMap
        ranges={list}
        compact
        selected={rangeEditor.openOn === n ? rangeEditor.index : -1}
        onselect={(i) => { rangeEditor.show(n); rangeEditor.select(i) }}
      />
    {/if}
    <!-- One sample or a whole folder, side by side: the two ways a sample
         oscillator is filled in. Only a sample oscillator is offered them —
         the Waveform select is the way in, so the panel never invites a file
         onto something that would not play it. The single one is the only one
         a drum has — every hit sounds the same note, so the key map would be a
         map of nothing — and it stands down once there is more than one sample,
         where "which of them" is the range editor's question. -->
    <div class="rangeact">
      {#if list.length <= 1}
        <button type="button" class="btn small" data-testid="pick-sample-{n}" title={HELP['osc.pickSample']} onclick={() => o && samplePick.start(o, { label: sampleFor(n) })}>
          {list[0]?.fileName ? 'Change sample…' : 'Sample…'}
        </button>
      {/if}
      {#if !drum || list.length > 1}
        <button type="button" class="btn small" data-testid="edit-ranges-{n}" title={HELP['osc.editRanges']} onclick={() => rangeEditor.toggle(n)}>
          {rangeEditor.openOn === n ? 'Close ranges' : list.length > 1 ? 'Edit ranges' : 'Ranges…'}
        </button>
      {/if}
      {#if !drum}
        <!-- A whole folder at once (issue #33): the panel reads the samples and
             writes the ranges as it works them out. A drum has nowhere to put
             them, so it is not offered one. -->
        <button type="button" class="btn small" data-testid="build-multisample-{n}" title={HELP['osc.fromFolder']} onclick={() => multisample.start(n)}>
          From folder…
        </button>
      {/if}
    </div>
  {/if}
  {#if wavetableFiles(o).length}
    <div class="fields"><div class="f"><span class="lbl">{wavetableFiles(o).length} wavetable ranges</span><div class="ro" title={wavetableFiles(o).join('\n')}>{wavetableFiles(o).map(shortName).join(' · ')}</div></div></div>
  {/if}
  {#if type === 'dx7'}
    <div class="fields">
      <div class="f"><span class="lbl">DX7 patch</span><div class="ro">{o?.attrs.dx7patch ? `${o.attrs.dx7patch.length / 2} bytes` : 'none'}</div></div>
      <NumberField label="Engine" name="osc{n}.dx7enginemode" value={o?.attrs.dx7enginemode} min={0} max={3} title={HELP['osc.dx7enginemode']} onchange={(v) => setAttr(ensureOsc(n)(), 'dx7enginemode', String(v), OSC_ATTR_ORDER)} />
      <NumberField label="Random Detune" name="osc{n}.dx7randomdetune" value={o?.attrs.dx7randomdetune} min={0} max={50} title={HELP['osc.dx7randomdetune']} onchange={(v) => setAttr(ensureOsc(n)(), 'dx7randomdetune', String(v), OSC_ATTR_ORDER)} />
    </div>
  {/if}
{/each}

<div class="h3">Noise</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="noiseVolume" label="Noise" order={SOUND_PARAM_ATTRS} {sound} />
</div>

{#if fm}
  {#each [1, 2] as const as n (n)}
    {@const m = child(sound, `modulator${n}`)}
    <div class="h3">Modulator {n}</div>
    <div class="knobrow">
      <HexKnob el={params(sound)} ensure={P} attr={n === 1 ? 'modulator1Amount' : 'modulator2Amount'} label="Level" order={SOUND_PARAM_ATTRS} {sound} />
      <HexKnob el={params(sound)} ensure={P} attr={n === 1 ? 'modulator1Feedback' : 'modulator2Feedback'} label="Feedback" order={SOUND_PARAM_ATTRS} {sound} />
    </div>
    <div class="fields">
      <NumberField label="Transpose" name="modulator{n}.transpose" value={m?.attrs.transpose} min={-96} max={96} title={HELP['modulator.transpose']} onchange={(v) => setAttr(ensureMod(n)(), 'transpose', String(v), MODULATOR_ATTR_ORDER)} />
      <NumberField label="Cents" name="modulator{n}.cents" value={m?.attrs.cents} min={-50} max={50} title={HELP['modulator.cents']} onchange={(v) => setAttr(ensureMod(n)(), 'cents', String(v), MODULATOR_ATTR_ORDER)} />
      <NumberField label="Retrig Phase" name="modulator{n}.retrigPhase" value={m?.attrs.retrigPhase === undefined ? undefined : retrigToDegrees(Number(m.attrs.retrigPhase))} min={-1} max={360} format={retrigFmt} title={HELP['modulator.retrigPhase']} onchange={(v) => setAttr(ensureMod(n)(), 'retrigPhase', String(degreesToRetrig(v)), MODULATOR_ATTR_ORDER)} />
      {#if n === 2}
        <div class="f"><span class="lbl">Route</span><Toggle label="→ Mod 1" name="modulator2.toModulator1" value={m?.attrs.toModulator1} title={HELP['modulator2.toModulator1']} onchange={(v) => setAttr(ensureMod(2)(), 'toModulator1', v, MODULATOR_ATTR_ORDER)} /></div>
      {/if}
    </div>
  {/each}
{/if}

<style>
  .rangeact { display: flex; gap: 6px; margin: 8px 0 0 4px; }
</style>
