<script lang="ts">
  /** A `0`/`1` flag attribute. */
  interface Props {
    label: string
    value: string | undefined
    onchange: (v: '0' | '1') => void
    name?: string
    /** The firmware's default state, when its source has been cited; an absent attribute shows dimmed in this position. */
    fallback?: '0' | '1'
    /** What the flag does (issue #20). The default marker stays in the label. */
    title?: string
  }
  let { label, value, onchange, name, fallback, title }: Props = $props()
  const on = $derived((value ?? fallback) === '1')
</script>

<button
  type="button"
  class="toggle"
  class:on
  class:default={value === undefined}
  data-attr={name}
  aria-pressed={on}
  {title}
  onclick={() => onchange(on ? '0' : '1')}
>
  {label}{#if value === undefined && fallback !== undefined}<small>default · {fallback === '1' ? 'on' : 'off'}</small>{/if}
</button>

<style>
  /* The absent-attribute state, spelled out: the italic label alone doesn't
     say which way the firmware's default points. */
  small { font-size: 9px; font-weight: 400; letter-spacing: .04em; text-transform: none; color: var(--faint); }
</style>
