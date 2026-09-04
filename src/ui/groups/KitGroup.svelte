<script lang="ts">
  /**
   * Kit-level bus: the kit's own filters, effects and sidechain, applied to
   * the summed output of every row. Sub-sections mirror the main-area panels
   * (Mod FX, Distortion, Delay, Reverb) so the same control reads the same
   * everywhere — only the values live in the kit's XML, not the row's.
   */
  import { KIT_ATTR_ORDER, KIT_CHILD_ORDER, KIT_DELAY_ATTR_ORDER, KIT_FILTER_ATTR_ORDER, KIT_PARAMS_CHILD_ORDER, KIT_PARAM_ATTRS, SIDECHAIN_ATTR_ORDER, type KitElement } from '../../core/preset'
  import { menuToSidechainAttack, menuToSidechainRelease, sidechainAttackToMenu, sidechainReleaseToMenu } from '../../core/params/scale'
  import { hexToMenu, menuToHex } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import FilterGraph, { type FilterBinding, type FilterParam } from '../controls/FilterGraph.svelte'
  import HexKnob from '../controls/HexKnob.svelte'
  import IntKnob from '../controls/IntKnob.svelte'
  import Select from '../controls/Select.svelte'
  import { HELP, KIT_BUS_NOTE, paramHelp } from '../help'
  import { modFxOptions } from '../options'
  import { editor } from '../state/editor.svelte'
  import DelayFields from './DelayFields.svelte'
  import FilterModeFields from './FilterModeFields.svelte'

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
  /** The one element the bus keeps for the sidechain: `<sidechain>` on community ≥ 1.1, `<compressor>` before. */
  const SC = () => ensureChild(kit, editor.supports('sidechainTag') ? 'sidechain' : 'compressor', KIT_CHILD_ORDER)
  /**
   * The same control's description as on a sound, plus what the kit bus makes
   * of it (issue #20). The knobs here hang off `<lpf>`/`<delay>` children
   * whose attributes are named `frequency`/`rate`, so they cannot find their
   * own description the way a sound's knobs do — the parameter is named here.
   */
  const bus = (p: string) => `${paramHelp(p) ?? HELP[p] ?? ''} ${KIT_BUS_NOTE}`.trim()

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
      setAttr(el, half(p), menuToHex(menu, 'standard'), KIT_FILTER_ATTR_ORDER)
    },
  }
</script>

<FilterGraph {filters} />
<FilterModeFields attrs={kit.attrs} prefix="kit." tip={bus} onchange={(name, v) => set(name)(v)} />
<div class="knobrow">
  <HexKnob el={lpf} ensure={() => ensureChild(P(), 'lpf', KIT_PARAMS_CHILD_ORDER)} attr="frequency" label="LPF Freq" order={KIT_FILTER_ATTR_ORDER} title={bus('lpfFrequency')} />
  <HexKnob el={lpf} ensure={() => ensureChild(P(), 'lpf', KIT_PARAMS_CHILD_ORDER)} attr="resonance" label="LPF Res" order={KIT_FILTER_ATTR_ORDER} title={bus('lpfResonance')} />
  <HexKnob el={hpf} ensure={() => ensureChild(P(), 'hpf', KIT_PARAMS_CHILD_ORDER)} attr="frequency" label="HPF Freq" order={KIT_FILTER_ATTR_ORDER} title={bus('hpfFrequency')} />
  <HexKnob el={hpf} ensure={() => ensureChild(P(), 'hpf', KIT_PARAMS_CHILD_ORDER)} attr="resonance" label="HPF Res" order={KIT_FILTER_ATTR_ORDER} title={bus('hpfResonance')} />
</div>

<div class="h3">Output</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="volume" label="Volume" order={KIT_PARAM_ATTRS} title={bus('volumePostFX')} />
  <HexKnob el={params} ensure={P} attr="pan" label="Pan" scale="pan" order={KIT_PARAM_ATTRS} title={bus('pan')} />
</div>

<div class="h3">Mod FX</div>
<div class="fields">
  <Select label="Type" name="kit.modFXType" value={kit.attrs.modFXType} options={modFxOptions(editor.supports)} title={bus('sound.modFXType')} onchange={set('modFXType')} />
</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="modFXRate" label="Rate" order={KIT_PARAM_ATTRS} title={bus('modFXRate')} />
  <HexKnob el={params} ensure={P} attr="modFXDepth" label="Depth" order={KIT_PARAM_ATTRS} title={bus('modFXDepth')} />
  <HexKnob el={params} ensure={P} attr="modFXOffset" label="Offset" order={KIT_PARAM_ATTRS} title={bus('modFXOffset')} />
  <HexKnob el={params} ensure={P} attr="modFXFeedback" label="Feedback" order={KIT_PARAM_ATTRS} title={bus('modFXFeedback')} />
</div>

<div class="h3">Distortion</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="bitCrush" label="Bitcrush" order={KIT_PARAM_ATTRS} title={bus('bitcrushAmount')} />
  <HexKnob el={params} ensure={P} attr="sampleRateReduction" label="Decimation" order={KIT_PARAM_ATTRS} title={bus('sampleRateReduction')} />
</div>

<div class="h3">Delay</div>
<div class="knobrow">
  <HexKnob el={dly} ensure={() => ensureChild(P(), 'delay', KIT_PARAMS_CHILD_ORDER)} attr="rate" label="Time" order={KIT_DELAY_ATTR_ORDER} title={bus('delayRate')} />
  <HexKnob el={dly} ensure={() => ensureChild(P(), 'delay', KIT_PARAMS_CHILD_ORDER)} attr="feedback" label="Feedback" order={KIT_DELAY_ATTR_ORDER} title={bus('delayFeedback')} />
</div>
<DelayFields {delay} ensure={D} prefix="kit." tip={bus} />

<div class="h3">Reverb</div>
<div class="knobrow">
  <HexKnob el={params} ensure={P} attr="reverbAmount" label="Send" order={KIT_PARAM_ATTRS} title={bus('reverbAmount')} />
</div>

<div class="h3">Sidechain</div>
<div class="knobrow">
  <IntKnob el={sc} ensure={SC} attr="attack" label="Attack" read={sidechainAttackToMenu} write={menuToSidechainAttack} order={SIDECHAIN_ATTR_ORDER} title={bus('sidechain.attack')} />
  <IntKnob el={sc} ensure={SC} attr="release" label="Release" read={sidechainReleaseToMenu} write={menuToSidechainRelease} order={SIDECHAIN_ATTR_ORDER} title={bus('sidechain.release')} />
  <HexKnob el={params} ensure={P} attr="sidechainCompressorShape" label="Shape" order={KIT_PARAM_ATTRS} title={bus('compressorShape')} />
</div>
