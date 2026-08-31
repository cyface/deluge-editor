<script lang="ts">
  /** A `0`/`1` flag attribute. */
  interface Props {
    label: string
    value: string | undefined
    onchange: (v: '0' | '1') => void
    name?: string
    /** The firmware's default state, when its source has been cited; an absent attribute shows dimmed in this position. */
    fallback?: '0' | '1'
  }
  let { label, value, onchange, name, fallback }: Props = $props()
  const on = $derived((value ?? fallback) === '1')
</script>

<button
  type="button"
  class="toggle"
  class:on
  class:default={value === undefined}
  data-attr={name}
  aria-pressed={on}
  title={value === undefined && fallback !== undefined ? `default · ${fallback === '1' ? 'on' : 'off'}` : undefined}
  onclick={() => onchange(on ? '0' : '1')}
>
  {label}
</button>
