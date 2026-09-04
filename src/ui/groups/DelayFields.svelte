<script lang="ts">
  /**
   * The `<delay>` element's fields — sync, sync type (gated), ping-pong,
   * analog — shared by a sound's Delay panel and the kit bus, which keep the
   * same element under different parents with different tooltips.
   */
  import { DELAY_ATTR_ORDER } from '../../core/preset'
  import { setAttr, type XmlElement } from '../../core/xml'
  import Select from '../controls/Select.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { syncLevelOptions, syncTypeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props {
    delay: XmlElement | undefined
    /** Creates `<delay>` in the parent's order on first write. */
    ensure: () => XmlElement
    /** Prefix for the fields' tooling names (`kit.`), or none. */
    prefix?: string
    /** The tooltip for a `delay.*` help key. */
    tip: (key: 'delay.syncLevel' | 'delay.syncType' | 'delay.pingPong' | 'delay.analog') => string | undefined
  }
  let { delay, ensure, prefix = '', tip }: Props = $props()
  const set = (name: string) => (v: string) => setAttr(ensure(), name, v, DELAY_ATTR_ORDER)
</script>

<div class="fields">
  <Select label="Sync" name="{prefix}delay.syncLevel" value={delay?.attrs.syncLevel} options={syncLevelOptions()} title={tip('delay.syncLevel')} onchange={set('syncLevel')} />
  {#if editor.supports('syncType')}
    <Select label="Sync Type" name="{prefix}delay.syncType" value={delay?.attrs.syncType} options={syncTypeOptions()} title={tip('delay.syncType')} onchange={set('syncType')} />
  {/if}
  <div class="f"><span class="lbl">Stereo</span><Toggle label="Ping-pong" name="{prefix}delay.pingPong" value={delay?.attrs.pingPong} title={tip('delay.pingPong')} onchange={set('pingPong')} /></div>
  <div class="f"><span class="lbl">Character</span><Toggle label="Analog" name="{prefix}delay.analog" value={delay?.attrs.analog} title={tip('delay.analog')} onchange={set('analog')} /></div>
</div>
