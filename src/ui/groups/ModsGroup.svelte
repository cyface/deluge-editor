<script lang="ts" module>
  /*
   * Which envelope and LFO tab is open lives at module level: the Overview
   * re-deals its panels into stacks as the window resizes, and a keyed panel
   * that moves between stacks is remounted, which would throw a component's
   * own selection away. There is one Overview, so one selection is right.
   */
  let envPick = $state(1)
  let lfoPick = $state(1)
</script>

<script lang="ts">
  import { LFO_SCOPE, type Feature } from '../../core/firmware/features'
  import { canLfoSync, lfoRateIgnored } from '../../core/firmware/lfo'
  import { ENVELOPE_ATTR_ORDER, LFO_ATTR_ORDER, paramLabel, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { cablesFrom, ensureEnvelope, ensureParams, envelope, lfo, params } from '../../core/preset/sound'
  import { ensureChild, setAttr } from '../../core/xml'
  import EnvGraph from '../controls/EnvGraph.svelte'
  import HexKnob from '../controls/HexKnob.svelte'
  import LfoGraph from '../controls/LfoGraph.svelte'
  import Seg from '../controls/Seg.svelte'
  import Select from '../controls/Select.svelte'
  import { ENV1_HARDWIRED, SYNCED_NOTE } from '../copy'
  import { HELP, UI_HELP } from '../help'
  import { lfoTypeOptions, syncLevelOptions, syncTypeOptions } from '../options'
  import { sourceColor } from '../sources'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  type N = 1 | 2 | 3 | 4
  // Two of each on every firmware; the third and fourth are features by name,
  // spelled out so a typo is a type error rather than a silently absent tab.
  const EXTRA: Record<3 | 4, { env: Feature; lfo: Feature }> = { 3: { env: 'env3', lfo: 'lfo3' }, 4: { env: 'env4', lfo: 'lfo4' } }
  const envs = $derived([1, 2, 3, 4].filter((n) => n <= 2 || editor.supports(EXTRA[n as 3 | 4].env)))
  const lfos = $derived([1, 2, 3, 4].filter((n) => n <= 2 || editor.supports(EXTRA[n as 3 | 4].lfo)))
  // The selection is the pick clamped to the tabs this firmware has — never a frame late.
  const envSel = $derived(envs.includes(envPick) ? envPick : 1)
  const lfoSel = $derived(lfos.includes(lfoPick) ? lfoPick : 1)

  const envItems = $derived(
    envs.map((n) => ({
      id: n,
      label: String(n),
      // Env 1's hardwired role reads in the graph's corner label, not a tiny sup.
      dot: cablesFrom(sound, `envelope${n}`).length ? sourceColor(`envelope${n}`) : undefined,
      idle: !envelope(sound, n as N),
      title: n === 1 ? ENV1_HARDWIRED : `Envelope ${n}`,
    })),
  )
  const lfoItems = $derived(
    lfos.map((n) => ({
      id: n,
      label: String(n),
      // Scope and cables read in the note under the tabs, not a tiny sup.
      dot: cablesFrom(sound, `lfo${n}`).length ? sourceColor(`lfo${n}`) : undefined,
      idle: !lfo(sound, n as N),
      title: UI_HELP[LFO_SCOPE[`lfo${n}` as keyof typeof LFO_SCOPE] === 'global' ? 'ui.mods.lfoGlobal' : 'ui.mods.lfoVoice'],
    })),
  )
  const lfoNote = $derived.by(() => {
    const scope = LFO_SCOPE[`lfo${lfoSel}` as keyof typeof LFO_SCOPE] === 'global' ? 'Global' : 'Voice'
    const dests = [...new Set(cablesFrom(sound, `lfo${lfoSel}`).map((c) => paramLabel(c.attrs.destination ?? '?')))]
    return `${scope} — ${dests.length ? `modifying ${dests.join(', ')}` : 'modifying nothing (no cables)'}`
  })
  const env = $derived(envelope(sound, envSel as N))
  const theLfo = $derived(lfo(sound, lfoSel as N))
  const ensureLfo = () => ensureChild(sound, `lfo${lfoSel as N}`, SOUND_CHILD_ORDER)
  const lfoRateAttr = $derived(`lfo${lfoSel}Rate` as (typeof SOUND_PARAM_ATTRS)[number])
  const lfoSyncs = $derived(canLfoSync(editor.version, lfoSel as N))
  /**
   * With a sync level set, the firmware never looks at the rate parameter:
   * `Sound::getGlobalLFOPhaseIncrement` and `Voice::getLocalLFOPhaseIncrement`
   * return the tempo-derived increment instead, and `maySourcePatchToParam`
   * refuses cables to it. The stored value stays and still round-trips; the
   * knob stops taking input.
   */
  const lfoSynced = $derived(lfoRateIgnored(sound, lfoSel as N, editor.version))
</script>

<div class="h3">Envelopes</div>
<Seg items={envItems} selected={envSel} onselect={(n) => (envPick = n)} />
<EnvGraph {sound} selected={envSel} available={envs} />
<div class="knobrow">
  {#each ENVELOPE_ATTR_ORDER as stage (stage)}
    <HexKnob el={env} ensure={() => ensureEnvelope(sound, envSel as N)} attr={stage} label={stage} order={ENVELOPE_ATTR_ORDER} {sound} dest="env{envSel}{stage[0].toUpperCase()}{stage.slice(1)}" />
  {/each}
</div>

<div class="h3">LFOs</div>
<Seg items={lfoItems} selected={lfoSel} onselect={(n) => (lfoPick = n)} />
<p class="lfonote">{lfoNote}</p>
<!-- Absent-attribute defaults: shape stays LFOConfig()'s TRIANGLE
     (modulation/lfo.h, tag `beta`); the <lfoN> readers preset
     SYNC_LEVEL_NONE / SYNC_TYPE_EVEN before reading (sound.cpp, tag `beta`,
     "Set default values in case they are not configured"). -->
<div class="fields">
  <Select label="Shape" name="lfo{lfoSel}.type" value={theLfo?.attrs.type} fallback="triangle" options={lfoTypeOptions(editor.supports)} title={HELP['lfo.type']} onchange={(v) => setAttr(ensureLfo(), 'type', v, LFO_ATTR_ORDER)} />
  {#if lfoSyncs}
    <Select label="Sync" name="lfo{lfoSel}.syncLevel" value={theLfo?.attrs.syncLevel} fallback="0" options={syncLevelOptions()} title={HELP['lfo.syncLevel']} onchange={(v) => setAttr(ensureLfo(), 'syncLevel', v, LFO_ATTR_ORDER)} />
    {#if editor.supports('syncType')}
      <Select label="Sync Type" name="lfo{lfoSel}.syncType" value={theLfo?.attrs.syncType} fallback="0" options={syncTypeOptions()} title={HELP['lfo.syncType']} onchange={(v) => setAttr(ensureLfo(), 'syncType', v, LFO_ATTR_ORDER)} />
    {/if}
  {/if}
</div>
<LfoGraph {sound} selected={lfoSel as N} available={lfos} />
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={() => ensureParams(sound)} attr={lfoRateAttr} label="Rate" order={SOUND_PARAM_ATTRS} {sound} disabled={lfoSynced} disabledNote={SYNCED_NOTE} />
</div>

<style>
  .lfonote { margin: 5px 0 0 4px; font-family: var(--mono); font-size: 9.5px; color: var(--faint); }
</style>
