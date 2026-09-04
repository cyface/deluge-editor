<script lang="ts">
  /** An integer attribute. Clamped on change: the browser does not enforce min/max on `.value`. */
  import { clamp } from '../../core/params/scale'
  interface Props {
    label: string
    value: string | number | undefined
    min: number
    max: number
    onchange: (n: number) => void
    name?: string
    format?: (n: number) => string
    /** The firmware's default value, when its source has been cited. */
    fallback?: number
    /** What the field does (issue #20); stacks with the default marker below. */
    title?: string
  }
  let { label, value, min, max, onchange, name, format, fallback, title }: Props = $props()
  const uid = $props.id()
  const id = `num-${uid}`
  const shown = $derived(value === undefined ? '' : String(value))
  const ph = $derived(fallback === undefined ? 'default' : `default · ${format ? format(fallback) : fallback}`)
  // The description and "what happens if you leave it blank" are separate
  // facts, so they stack rather than one replacing the other.
  const tip = $derived([title, value === undefined ? ph : undefined].filter(Boolean).join('\n\n') || undefined)
  function change(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    if (el.value === '') return
    const n = clamp(Math.round(Number(el.value) || 0), min, max)
    el.value = String(n)
    onchange(n)
  }
</script>

<div class="f" title={tip}>
  <label for={id}>{label}{#if format && value !== undefined}<span class="fmt"> · {format(Number(value))}</span>{/if}</label>
  <input {id} type="number" data-attr={name} value={shown} placeholder={ph} {min} {max} step="1" aria-describedby={tip ? `${id}-tip` : undefined} onchange={change} />
  <!-- The tooltip, reachable without a pointer. -->
  {#if tip}<span id="{id}-tip" hidden>{tip}</span>{/if}
</div>

<style>
  .fmt { color: var(--faint); text-transform: none; letter-spacing: 0; }
</style>
