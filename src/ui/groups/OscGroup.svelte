<script lang="ts">
  import {
    OSC_ATTR_ORDER, MODULATOR_ATTR_ORDER, SOUND_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS,
    type OscElement, type SoundElement,
  } from '../../core/preset'
  import { sampleRanges, soundingOrder } from '../../core/preset/ranges'
  import { ensureParams, osc, params } from '../../core/preset/sound'
  import { degreesToRetrig, retrigToDegrees } from '../../core/params/scale'
  import { child, childrenOf, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import KeyMap from '../controls/KeyMap.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import Select from '../controls/Select.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { loopModeOptions, oscTypeOptions, synthModeOptions } from '../options'
  import { editor } from '../state/editor.svelte'
  import { multisample } from '../state/multisample.svelte'
  import { ranges as rangeEditor } from '../state/ranges.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const fm = $derived(sound.attrs.mode === 'fm')
  const ensureOsc = (n: 1 | 2) => () => ensureChild(sound, `osc${n}`, SOUND_CHILD_ORDER)
  const ensureMod = (n: 1 | 2) => () => ensureChild(sound, `modulator${n}`, SOUND_CHILD_ORDER)
  const P = () => ensureParams(sound)
  const retrigFmt = (n: number) => (n < 0 ? 'off' : `${n}°`)

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
  const attr = (n: 1 | 2, s: string) => `osc${label[n]}${s}` as (typeof SOUND_PARAM_ATTRS)[number]
</script>

<!-- The mode reshapes this whole panel (subtractive / FM / ringmod), so it lives here. -->
<div class="fields">
  <Select label="Synth Mode" name="mode" value={sound.attrs.mode} options={synthModeOptions()} onchange={(v) => setAttr(sound, 'mode', v, SOUND_ATTR_ORDER)} />
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
      <Select label="Waveform" name="osc{n}.type" value={o?.attrs.type} options={oscTypeOptions(editor.supports)} fallback="square" onchange={(v) => setAttr(ensureOsc(n)(), 'type', v, OSC_ATTR_ORDER)} />
      {#if type === 'sample'}
        <!-- repeatMode = SampleRepeatMode::CUT in the Source constructor (source.cpp:38). -->
        <Select label="Repeat" name="osc{n}.loopMode" value={o?.attrs.loopMode} options={loopModeOptions()} fallback="0" onchange={(v) => setAttr(ensureOsc(n)(), 'loopMode', v, OSC_ATTR_ORDER)} />
      {/if}
    </div>
  {/if}
  <div class="knobrow">
    <HexKnob el={params(sound)} ensure={P} attr={attr(n, 'Volume')} label="Level" order={SOUND_PARAM_ATTRS} {sound} />
    {#if type === 'wavetable'}
      <HexKnob el={params(sound)} ensure={P} attr={attr(n, 'WavetablePosition')} label="Wave Pos" order={SOUND_PARAM_ATTRS} {sound} />
    {:else if type !== 'sample' && type !== 'dx7'}
      <HexKnob el={params(sound)} ensure={P} attr={attr(n, 'PulseWidth')} label="Pulse Width" scale="half" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
    {#if fm}
      <HexKnob el={params(sound)} ensure={P} attr={n === 1 ? 'carrier1Feedback' : 'carrier2Feedback'} label="Feedback" order={SOUND_PARAM_ATTRS} {sound} />
    {/if}
  </div>
  <div class="fields">
    <NumberField label="Transpose" name="osc{n}.transpose" value={o?.attrs.transpose} min={-96} max={96} onchange={(v) => setAttr(ensureOsc(n)(), 'transpose', String(v), OSC_ATTR_ORDER)} />
    <NumberField label="Cents" name="osc{n}.cents" value={o?.attrs.cents} min={-50} max={50} onchange={(v) => setAttr(ensureOsc(n)(), 'cents', String(v), OSC_ATTR_ORDER)} />
    {#if type !== 'sample'}
      <NumberField label="Retrig Phase" name="osc{n}.retrigPhase" value={o?.attrs.retrigPhase === undefined ? undefined : retrigToDegrees(Number(o.attrs.retrigPhase))} min={-1} max={360} format={retrigFmt} onchange={(v) => setAttr(ensureOsc(n)(), 'retrigPhase', String(degreesToRetrig(v)), OSC_ATTR_ORDER)} />
    {/if}
    {#if n === 2 && !fm}
      <div class="f"><span class="lbl">Sync</span><Toggle label="Osc Sync" name="osc2.oscillatorSync" value={o?.attrs.oscillatorSync} onchange={(v) => setAttr(ensureOsc(2)(), 'oscillatorSync', v, OSC_ATTR_ORDER)} /></div>
    {/if}
  </div>
  {#if type === 'sample'}
    <div class="fields">
      <div class="f"><span class="lbl">Reverse</span><Toggle label="Reversed" name="osc{n}.reversed" value={o?.attrs.reversed} onchange={(v) => setAttr(ensureOsc(n)(), 'reversed', v, OSC_ATTR_ORDER)} /></div>
      <!-- timeStretchEnable is the device's Pitch/speed menu: the firmware
           maps it to pitchAndSpeedAreIndependent (sound.cpp:3383/3599,
           upstream/community). Not related to repeat-mode Stretch. -->
      <div class="f"><span class="lbl">Pitch/Speed</span><Toggle label="Independent" name="osc{n}.timeStretchEnable" value={o?.attrs.timeStretchEnable} onchange={(v) => setAttr(ensureOsc(n)(), 'timeStretchEnable', v, OSC_ATTR_ORDER)} /></div>
      <NumberField label="Speed" name="osc{n}.timeStretchAmount" value={o?.attrs.timeStretchAmount} min={-48} max={48} onchange={(v) => setAttr(ensureOsc(n)(), 'timeStretchAmount', String(v), OSC_ATTR_ORDER)} />
      <div class="f"><span class="lbl">Interp.</span><Toggle label="Linear" name="osc{n}.linearInterpolation" value={o?.attrs.linearInterpolation} onchange={(v) => setAttr(ensureOsc(n)(), 'linearInterpolation', v, OSC_ATTR_ORDER)} /></div>
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
          {list.map((r) => shortName(r.fileName) || '(none)').join(' · ') || '(none)'}
        </div>
      </div>
    </div>
    {#if list.length === 0}
      <!-- The firmware loads this happily and plays nothing: a SAMPLE source
           with no file has nothing to render (`Source::loadAllSamples`,
           processing/source.cpp:105). Silence is the hardest fault to find on
           the instrument, so it is called out here. -->
      <p class="caution" data-testid="osc-no-sample-{n}">
        This oscillator is set to Sample but has no sample — it will be silent on the Deluge.
      </p>
    {:else}
      <KeyMap
        ranges={list}
        compact
        selected={rangeEditor.openOn === n ? rangeEditor.index : -1}
        onselect={(i) => { rangeEditor.open(n); rangeEditor.select(i) }}
      />
    {/if}
    <div class="rangeact">
      <button type="button" class="btn small" data-testid="edit-ranges-{n}" onclick={() => rangeEditor.toggle(n)}>
        {rangeEditor.openOn === n ? 'Close ranges' : list.length > 1 ? 'Edit ranges' : 'Ranges…'}
      </button>
      <!-- A whole folder at once (issue #33): the panel reads the samples and
           writes the ranges as it works them out. -->
      <button type="button" class="btn small" data-testid="build-multisample-{n}" title="Rebuild this oscillator's ranges from a folder of samples" onclick={() => multisample.start(n)}>
        From folder…
      </button>
    </div>
  {:else if !fm}
    <!-- The way into a multi-sampled instrument from a synth that isn't one
         yet. Clicking it switches this oscillator to Sample so the panel and
         the waveform agree; closing the panel having read no folder puts the
         waveform back. -->
    <div class="rangeact">
      <button type="button" class="btn small" data-testid="build-multisample-{n}" title="Build a multi-sampled instrument on this oscillator from a folder of samples" onclick={() => multisample.start(n)}>
        Build from folder…
      </button>
    </div>
  {/if}
  {#if wavetableFiles(o).length}
    <div class="fields"><div class="f"><span class="lbl">{wavetableFiles(o).length} wavetable ranges</span><div class="ro" title={wavetableFiles(o).join('\n')}>{wavetableFiles(o).map(shortName).join(' · ')}</div></div></div>
  {/if}
  {#if type === 'dx7'}
    <div class="fields">
      <div class="f"><span class="lbl">DX7 patch</span><div class="ro">{o?.attrs.dx7patch ? `${o.attrs.dx7patch.length / 2} bytes` : 'none'}</div></div>
      <NumberField label="Engine" name="osc{n}.dx7enginemode" value={o?.attrs.dx7enginemode} min={0} max={3} onchange={(v) => setAttr(ensureOsc(n)(), 'dx7enginemode', String(v), OSC_ATTR_ORDER)} />
      <NumberField label="Random Detune" name="osc{n}.dx7randomdetune" value={o?.attrs.dx7randomdetune} min={0} max={50} onchange={(v) => setAttr(ensureOsc(n)(), 'dx7randomdetune', String(v), OSC_ATTR_ORDER)} />
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
      <NumberField label="Transpose" name="modulator{n}.transpose" value={m?.attrs.transpose} min={-96} max={96} onchange={(v) => setAttr(ensureMod(n)(), 'transpose', String(v), MODULATOR_ATTR_ORDER)} />
      <NumberField label="Cents" name="modulator{n}.cents" value={m?.attrs.cents} min={-50} max={50} onchange={(v) => setAttr(ensureMod(n)(), 'cents', String(v), MODULATOR_ATTR_ORDER)} />
      <NumberField label="Retrig Phase" name="modulator{n}.retrigPhase" value={m?.attrs.retrigPhase === undefined ? undefined : retrigToDegrees(Number(m.attrs.retrigPhase))} min={-1} max={360} format={retrigFmt} onchange={(v) => setAttr(ensureMod(n)(), 'retrigPhase', String(degreesToRetrig(v)), MODULATOR_ATTR_ORDER)} />
      {#if n === 2}
        <div class="f"><span class="lbl">Route</span><Toggle label="→ Mod 1" name="modulator2.toModulator1" value={m?.attrs.toModulator1} onchange={(v) => setAttr(ensureMod(2)(), 'toModulator1', v, MODULATOR_ATTR_ORDER)} /></div>
      {/if}
    </div>
  {/each}
{/if}

<style>
  .rangeact { display: flex; gap: 6px; margin: 8px 0 0 4px; }
  .caution {
    margin: 8px 0 0 4px; padding: 5px 7px; border: 1px solid #6b4a1c; background: #1d1710; border-radius: 3px;
    font-family: var(--cond); font-size: 11px; line-height: 1.3; color: #e8b06a;
  }
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
</style>
