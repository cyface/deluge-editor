<script lang="ts">
  import { LFO_SCOPE } from '../../core/firmware/features'
  import { ENVELOPE_ATTR_ORDER, LFO_ATTR_ORDER, paramLabel, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { cablesFrom, ensureEnvelope, ensureParams, envelope, lfo, params } from '../../core/preset/sound'
  import { ensureChild, setAttr } from '../../core/xml'
  import EnvGraph from '../controls/EnvGraph.svelte'
  import HexKnob from '../controls/HexKnob.svelte'
  import LfoGraph from '../controls/LfoGraph.svelte'
  import Seg from '../controls/Seg.svelte'
  import Select from '../controls/Select.svelte'
  import { HELP } from '../help'
  import { lfoTypeOptions, syncLevelOptions, syncTypeOptions } from '../options'
  import { sourceColor } from '../sources'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  let envSel = $state(1)
  let lfoSel = $state(1)
  type N = 1 | 2 | 3 | 4
  const envs = $derived([1, 2, 3, 4].filter((n) => n <= 2 || editor.supports(`env${n}`)))
  const lfos = $derived([1, 2, 3, 4].filter((n) => n <= 2 || editor.supports(`lfo${n}`)))
  $effect(() => { if (!envs.includes(envSel)) envSel = 1 })
  $effect(() => { if (!lfos.includes(lfoSel)) lfoSel = 1 })

  const envItems = $derived(
    envs.map((n) => ({
      id: n,
      label: String(n),
      // Env 1's hardwired role reads in the graph's corner label, not a tiny sup.
      dot: cablesFrom(sound, `envelope${n}`).length ? sourceColor(`envelope${n}`) : undefined,
      idle: !envelope(sound, n as N),
      title: n === 1 ? 'Envelope 1 is hardwired to volume' : `Envelope ${n}`,
    })),
  )
  const lfoItems = $derived(
    lfos.map((n) => ({
      id: n,
      label: String(n),
      // Scope and cables read in the note under the tabs, not a tiny sup.
      dot: cablesFrom(sound, `lfo${n}`).length ? sourceColor(`lfo${n}`) : undefined,
      idle: !lfo(sound, n as N),
      title: LFO_SCOPE[`lfo${n}` as keyof typeof LFO_SCOPE] === 'global' ? 'Runs once per sound: can reach global parameters and sync to tempo' : 'Runs per voice',
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
  const lfoSyncs = $derived(lfoSel === 1 || lfoSel === 3 || (lfoSel === 2 && editor.supports('lfo2Sync')) || (lfoSel === 4 && editor.supports('lfo4')))
  /**
   * With a sync level set, the firmware never looks at the rate parameter:
   * `Sound::getGlobalLFOPhaseIncrement` and `Voice::getLocalLFOPhaseIncrement`
   * return the tempo-derived increment instead, and `maySourcePatchToParam`
   * refuses cables to it. The stored value stays and still round-trips; the
   * knob stops taking input.
   */
  const lfoSynced = $derived(lfoSyncs && (theLfo?.attrs.syncLevel ?? '0') !== '0')
  const SYNCED_NOTE = 'Disabled by tempo sync — the Deluge takes this LFO’s speed from the song, not from this value.'
</script>

<div class="h3">Envelopes</div>
<Seg items={envItems} selected={envSel} onselect={(n) => (envSel = n)} />
<EnvGraph {sound} selected={envSel} available={envs} />
<div class="knobrow">
  {#each ENVELOPE_ATTR_ORDER as stage (stage)}
    <HexKnob el={env} ensure={() => ensureEnvelope(sound, envSel as N)} attr={stage} label={stage} order={ENVELOPE_ATTR_ORDER} {sound} dest="env{envSel}{stage[0].toUpperCase()}{stage.slice(1)}" />
  {/each}
</div>

<div class="h3">LFOs</div>
<Seg items={lfoItems} selected={lfoSel} onselect={(n) => (lfoSel = n)} />
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
