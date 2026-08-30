<script lang="ts">
  import {
    OSC_ATTR_ORDER, MODULATOR_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS,
    type OscElement, type SoundElement,
  } from '../../core/preset'
  import { ensureParams, osc, params } from '../../core/preset/sound'
  import { degreesToRetrig, retrigToDegrees } from '../../core/params/scale'
  import { child, childrenOf, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import NumberField from '../controls/NumberField.svelte'
  import Select from '../controls/Select.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { loopModeOptions, oscTypeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const fm = $derived(sound.attrs.mode === 'fm')
  const ensureOsc = (n: 1 | 2) => () => ensureChild(sound, `osc${n}`, SOUND_CHILD_ORDER)
  const ensureMod = (n: 1 | 2) => () => ensureChild(sound, `modulator${n}`, SOUND_CHILD_ORDER)
  const P = () => ensureParams(sound)
  const retrigFmt = (n: number) => (n < 0 ? 'off' : `${n}°`)

  function rangeFiles(o: OscElement | undefined): string[] {
    if (!o) return []
    const s = child(o, 'sampleRanges')
    const w = child(o, 'wavetableRanges')
    return [
      ...(s ? childrenOf(s, 'sampleRange').map((r) => r.attrs.fileName ?? '?') : []),
      ...(w ? childrenOf(w, 'wavetableRange').map((r) => r.attrs.fileName ?? '?') : []),
    ]
  }
  const label = ['', 'A', 'B'] as const
  const attr = (n: 1 | 2, s: string) => `osc${label[n]}${s}` as (typeof SOUND_PARAM_ATTRS)[number]
</script>

{#each [1, 2] as const as n (n)}
  {@const o = osc(sound, n)}
  {@const type = fm ? 'sine' : (o?.attrs.type ?? 'saw')}
  <div class="h3">Osc {label[n]}{#if fm}<span class="sub">carrier · sine</span>{/if}</div>
  {#if !fm}
    <div class="fields">
      <Select label="Waveform" name="osc{n}.type" value={o?.attrs.type} options={oscTypeOptions(editor.supports)} onchange={(v) => setAttr(ensureOsc(n)(), 'type', v, OSC_ATTR_ORDER)} />
      {#if type === 'sample'}
        <Select label="Loop" name="osc{n}.loopMode" value={o?.attrs.loopMode} options={loopModeOptions()} onchange={(v) => setAttr(ensureOsc(n)(), 'loopMode', v, OSC_ATTR_ORDER)} />
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
      <div class="f"><span class="lbl">Stretch</span><Toggle label="Time Stretch" name="osc{n}.timeStretchEnable" value={o?.attrs.timeStretchEnable} onchange={(v) => setAttr(ensureOsc(n)(), 'timeStretchEnable', v, OSC_ATTR_ORDER)} /></div>
      <NumberField label="Stretch Amount" name="osc{n}.timeStretchAmount" value={o?.attrs.timeStretchAmount} min={-48} max={48} onchange={(v) => setAttr(ensureOsc(n)(), 'timeStretchAmount', String(v), OSC_ATTR_ORDER)} />
      <div class="f"><span class="lbl">Interp.</span><Toggle label="Linear" name="osc{n}.linearInterpolation" value={o?.attrs.linearInterpolation} onchange={(v) => setAttr(ensureOsc(n)(), 'linearInterpolation', v, OSC_ATTR_ORDER)} /></div>
    </div>
  {/if}
  {#if o?.attrs.fileName !== undefined}
    <div class="fields"><div class="f"><span class="lbl">File</span><div class="ro" title={o.attrs.fileName}>{o.attrs.fileName || '(none)'}</div></div></div>
  {/if}
  {#if rangeFiles(o).length}
    <div class="fields"><div class="f"><span class="lbl">{rangeFiles(o).length} ranges</span><div class="ro" title={rangeFiles(o).join('\n')}>{rangeFiles(o).map((f) => f.split('/').pop()).join(' · ')}</div></div></div>
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
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
</style>
