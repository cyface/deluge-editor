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
  }
  let { label, value, min, max, onchange, name, format, fallback }: Props = $props()
  const id = `num-${Math.random().toString(36).slice(2, 8)}`
  const shown = $derived(value === undefined ? '' : String(value))
  function change(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    if (el.value === '') return
    const n = clamp(Math.round(Number(el.value) || 0), min, max)
    el.value = String(n)
    onchange(n)
  }
</script>

<div class="f">
  <label for={id}>{label}{#if format && value !== undefined}<span class="fmt"> · {format(Number(value))}</span>{/if}</label>
  <input {id} type="number" data-attr={name} value={shown} placeholder={fallback === undefined ? 'default' : `default · ${fallback}`} {min} {max} step="1" onchange={change} />
</div>

<style>
  .fmt { color: var(--faint); text-transform: none; letter-spacing: 0; }
</style>
