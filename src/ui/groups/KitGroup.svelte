<script lang="ts">
  /**
   * Kit-level bus: the kit's own filters, effects and sidechain, applied to
   * the summed output of every row. Sub-sections mirror the main-area panels
   * (Mod FX, Distortion, Delay, Reverb) so the same control reads the same
   * everywhere — only the values live in the kit's XML, not the row's.
   */
  import { DELAY_ATTR_ORDER, KIT_ATTR_ORDER, KIT_CHILD_ORDER, KIT_PARAMS_CHILD_ORDER, KIT_PARAM_ATTRS, SIDECHAIN_ATTR_ORDER, type KitElement } from '../../core/preset'
  import { menuToSidechainAttack, menuToSidechainRelease, sidechainAttackToMenu, sidechainReleaseToMenu } from '../../core/params/scale'
  import { hexToMenu, menuToHex } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import FilterGraph, { type FilterBinding, type FilterParam } from '../controls/FilterGraph.svelte'
  import HexKnob from '../controls/HexKnob.svelte'
  import IntKnob from '../controls/IntKnob.svelte'
  import Select from '../controls/Select.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { hpfModeOptions, lpfModeOptions, modFxOptions, routeOptions, syncLevelOptions, syncTypeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props { kit: KitElement }
  let { kit }: Props = $props()
  const params = $derived(child(kit, 'defaultParams'))
  const P = () => ensureChild(kit, 'defaultParams', KIT_CHILD_ORDER)
  const lpf = $derived(params && child(params, 'lpf'))
  const hpf = $derived(params && child(params, 'hpf'))
  const dly = $derived(params && child(params, 'delay'))
  const delay = $derived(child(kit, 'delay'))
  const D = () => ensureChild(kit, 'delay', KIT_CHILD_ORDER)
  const sc = $derived(child(kit, 'sidechain') ?? child(kit, 'compressor'))
  const set = (name: string) => (v: string) => setAttr(kit, name, v, KIT_ATTR_ORDER)
  const FREQ = ['frequency', 'resonance'] as const
  const RATE = ['rate', 'feedback'] as const

  // The kit bus keeps its filter values in <defaultParams><lpf>/<hpf>
  // children, same 0–50 scaling as a sound's flat attributes.
  const half = (p: FilterParam) => (p.endsWith('Frequency') ? 'frequency' : 'resonance') as 'frequency' | 'resonance'
  const filters: FilterBinding = {
    attr: (name) => kit.attrs[name],
    read: (p) => {
      const hex = (p.startsWith('lpf') ? lpf : hpf)?.attrs[half(p)]
      return hex === undefined ? undefined : hexToMenu(hex, 'standard')
    },
    write: (p, menu) => {
      const el = ensureChild(P(), p.startsWith('lpf') ? 'lpf' : 'hpf', KIT_PARAMS_CHILD_ORDER)
      setAttr(el, half(p), menuToHex(menu, 'standard'), FREQ)
    },
  }
</script>

<FilterGraph {filters} />
<div class="fields">
  <Select label="LPF Mode" name="kit.lpfMode" value={kit.attrs.lpfMode} options={lpfModeOptions(editor.supports)} onchange={set('lpfMode')} />
  {#if editor.supports('hpfMode')}
    <Select label="HPF Mode" name="kit.hpfMode" value={kit.attrs.hpfMode} options={hpfModeOptions()} onchange={set('hpfMode')} />
  {/if}
  {#if editor.supports('filterRoute')}
    <Select label="Routing" name="kit.filterRoute" value={kit.attrs.filterRoute} options={routeOptions()} onchange={set('filterRoute')} />
  {/if}
</div>
<div class="knobrow">
  <HexKnob el={lpf} ensure={() => ensureChild(P(), 'lpf', KIT_PARAMS_CHILD_ORDER)} attr="frequency" label="LPF Freq" order={FREQ} />
  <HexKnob el={lpf} ensure={() => ensureChild(P(), 'lpf', KIT_PARAMS_CHILD_ORDER)} attr="resonance" label="LPF Res" order={FREQ} />
  <HexKnob el={hpf} ensure={() => ensureChild(P(), 'hpf', KIT_PARAMS_CHILD_ORDER)} attr="frequency" label="HPF Freq" order={FREQ} />
  <HexKnob el={hpf} ensure={() => ensureChild(P(), 'hpf', KIT_PARAMS_CHILD_ORDER)} attr="resonance" label="HPF Res" order={FREQ} />
</div>

<div class="h3">Output</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="volume" label="Volume" order={KIT_PARAM_ATTRS} />
  <HexKnob el={params} ensure={P} attr="pan" label="Pan" scale="pan" order={KIT_PARAM_ATTRS} />
</div>

<div class="h3">Mod FX</div>
<div class="fields">
  <Select label="Type" name="kit.modFXType" value={kit.attrs.modFXType} options={modFxOptions(editor.supports)} onchange={set('modFXType')} />
</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="modFXRate" label="Rate" order={KIT_PARAM_ATTRS} />
  <HexKnob el={params} ensure={P} attr="modFXDepth" label="Depth" order={KIT_PARAM_ATTRS} />
  <HexKnob el={params} ensure={P} attr="modFXOffset" label="Offset" order={KIT_PARAM_ATTRS} />
  <HexKnob el={params} ensure={P} attr="modFXFeedback" label="Feedback" order={KIT_PARAM_ATTRS} />
</div>

<div class="h3">Distortion</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="bitCrush" label="Bitcrush" order={KIT_PARAM_ATTRS} />
  <HexKnob el={params} ensure={P} attr="sampleRateReduction" label="Decimation" order={KIT_PARAM_ATTRS} />
</div>

<div class="h3">Delay</div>
<div class="knobrow">
  <HexKnob el={dly} ensure={() => ensureChild(P(), 'delay', KIT_PARAMS_CHILD_ORDER)} attr="rate" label="Time" order={RATE} />
  <HexKnob el={dly} ensure={() => ensureChild(P(), 'delay', KIT_PARAMS_CHILD_ORDER)} attr="feedback" label="Feedback" order={RATE} />
</div>
<div class="fields">
  <Select label="Sync" name="kit.delay.syncLevel" value={delay?.attrs.syncLevel} options={syncLevelOptions()} onchange={(v) => setAttr(D(), 'syncLevel', v, DELAY_ATTR_ORDER)} />
  {#if editor.supports('syncType')}
    <Select label="Sync Type" name="kit.delay.syncType" value={delay?.attrs.syncType} options={syncTypeOptions()} onchange={(v) => setAttr(D(), 'syncType', v, DELAY_ATTR_ORDER)} />
  {/if}
  <div class="f"><span class="lbl">Stereo</span><Toggle label="Ping-pong" name="kit.delay.pingPong" value={delay?.attrs.pingPong} onchange={(v) => setAttr(D(), 'pingPong', v, DELAY_ATTR_ORDER)} /></div>
  <div class="f"><span class="lbl">Character</span><Toggle label="Analog" name="kit.delay.analog" value={delay?.attrs.analog} onchange={(v) => setAttr(D(), 'analog', v, DELAY_ATTR_ORDER)} /></div>
</div>

<div class="h3">Reverb</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="reverbAmount" label="Send" order={KIT_PARAM_ATTRS} />
</div>

<div class="h3">Sidechain</div>
<div class="knobrow">
  <IntKnob el={sc} ensure={() => ensureChild(kit, editor.supports('sidechainTag') ? 'sidechain' : 'compressor', KIT_CHILD_ORDER)} attr="attack" label="Attack" read={sidechainAttackToMenu} write={menuToSidechainAttack} order={SIDECHAIN_ATTR_ORDER} />
  <IntKnob el={sc} ensure={() => ensureChild(kit, editor.supports('sidechainTag') ? 'sidechain' : 'compressor', KIT_CHILD_ORDER)} attr="release" label="Release" read={sidechainReleaseToMenu} write={menuToSidechainRelease} order={SIDECHAIN_ATTR_ORDER} />
  <HexKnob el={params} ensure={P} attr="sidechainCompressorShape" label="Shape" order={KIT_PARAM_ATTRS} />
</div>

<style>
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
</style>
