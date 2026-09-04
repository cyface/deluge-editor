<script lang="ts">
  /**
   * The filter's three selects — LPF mode, HPF mode, routing — with their
   * firmware gates, shared by a sound's Filters panel and the kit bus. The
   * two differ only in whose attributes they are and how the tooltip is
   * worded, so those are the props.
   */
  import Select from '../controls/Select.svelte'
  import { hpfModeOptions, lpfModeOptions, routeOptions } from '../options'
  import { editor } from '../state/editor.svelte'

  interface Props {
    attrs: Record<string, string | undefined>
    /** Prefix for the fields' tooling names (`kit.`), or none. */
    prefix?: string
    /** The tooltip for a `sound.*` help key. */
    tip: (key: 'sound.lpfMode' | 'sound.hpfMode' | 'sound.filterRoute') => string | undefined
    onchange: (name: 'lpfMode' | 'hpfMode' | 'filterRoute', v: string) => void
  }
  let { attrs, prefix = '', tip, onchange }: Props = $props()
</script>

<div class="fields">
  <Select label="LPF Mode" name="{prefix}lpfMode" value={attrs.lpfMode} options={lpfModeOptions(editor.supports)} title={tip('sound.lpfMode')} onchange={(v) => onchange('lpfMode', v)} />
  {#if editor.supports('hpfMode')}
    <Select label="HPF Mode" name="{prefix}hpfMode" value={attrs.hpfMode} options={hpfModeOptions()} title={tip('sound.hpfMode')} onchange={(v) => onchange('hpfMode', v)} />
  {/if}
  {#if editor.supports('filterRoute')}
    <Select label="Routing" name="{prefix}filterRoute" value={attrs.filterRoute} options={routeOptions()} title={tip('sound.filterRoute')} onchange={(v) => onchange('filterRoute', v)} />
  {/if}
</div>
