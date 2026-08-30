<script lang="ts">
  /**
   * An enum attribute. `undefined` (the file omits it) shows as an italic
   * "default" entry; a value the file has that isn't in `options` (hidden by
   * the firmware gate, or unknown) is still shown so the control tells the truth.
   */
  interface Option { value: string; label: string }
  interface Props {
    label: string
    value: string | undefined
    options: readonly Option[]
    onchange: (v: string) => void
    name?: string
  }
  let { label, value, options, onchange, name }: Props = $props()
  const id = `sel-${Math.random().toString(36).slice(2, 8)}`
  const known = $derived(value === undefined || options.some((o) => o.value === value))
</script>

<div class="f">
  <label for={id}>{label}</label>
  <select {id} data-attr={name} class:default={value === undefined} value={value ?? ''} onchange={(e) => onchange((e.currentTarget as HTMLSelectElement).value)}>
    {#if value === undefined}
      <option value="" disabled>default</option>
    {/if}
    {#if !known}
      <option value={value}>{value}</option>
    {/if}
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</div>
