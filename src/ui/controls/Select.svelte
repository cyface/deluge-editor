<script lang="ts">
  /**
   * An enum attribute. `undefined` (the file omits it) shows as an italic
   * "default" entry — naming the firmware's default when the caller cites one
   * via `fallback` — and a value the file has that isn't in `options` (hidden
   * by the firmware gate, or unknown) is still shown so the control tells the truth.
   */
  interface Option { value: string; label: string }
  interface Props {
    label: string
    value: string | undefined
    options: readonly Option[]
    onchange: (v: string) => void
    name?: string
    /** The firmware's default value, when its source has been cited. */
    fallback?: string
    /** What the control does; sits on the field so the label carries it too (issue #20). */
    title?: string
    /** On the select, for tests. */
    testid?: string
    /** In a table cell: the label names the select for assistive tech but is not drawn. */
    compact?: boolean
  }
  let { label, value, options, onchange, name, fallback, title, testid, compact = false }: Props = $props()
  const uid = $props.id()
  const id = `sel-${uid}`
  const known = $derived(value === undefined || options.some((o) => o.value === value))
  const fallbackLabel = $derived(fallback === undefined ? undefined : (options.find((o) => o.value === fallback)?.label ?? fallback))
</script>

<div class="f" class:compact {title}>
  <label for={id} hidden={compact}>{label}</label>
  <select
    {id}
    data-attr={name}
    data-testid={testid}
    class:default={value === undefined}
    value={value ?? ''}
    aria-label={compact ? label : undefined}
    aria-describedby={title ? `${id}-tip` : undefined}
    onchange={(e) => onchange((e.currentTarget as HTMLSelectElement).value)}
  >
    {#if value === undefined}
      <option value="" disabled>{fallbackLabel === undefined ? 'default' : `default · ${fallbackLabel}`}</option>
    {/if}
    {#if !known}
      <option value={value}>{value}</option>
    {/if}
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
  <!-- The tooltip, reachable without a pointer. -->
  {#if title}<span id="{id}-tip" hidden>{title}</span>{/if}
</div>

<style>
  .compact { display: inline-block; width: auto; }
  .compact select { height: auto; width: auto; line-height: normal; padding: 2px 3px; font-size: 10.5px; border-color: var(--edge); }
</style>
