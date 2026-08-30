<script lang="ts">
  /** A `0`/`1` flag attribute. */
  interface Props {
    label: string
    value: string | undefined
    onchange: (v: '0' | '1') => void
    name?: string
  }
  let { label, value, onchange, name }: Props = $props()
  const on = $derived(value === '1')
</script>

<button type="button" class="toggle" class:on class:default={value === undefined} data-attr={name} aria-pressed={on} onclick={() => onchange(on ? '0' : '1')}>
  <span class="led"></span>{label}
</button>
