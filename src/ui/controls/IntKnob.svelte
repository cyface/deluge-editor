<script lang="ts">
  /** A knob over an integer attribute, optionally through a display transform (sidechain rate tables, compressor q31). */
  import { setAttr, type XmlElement } from '../../core/xml'
  import Knob from './Knob.svelte'
  interface Props {
    el: XmlElement | undefined
    ensure?: () => XmlElement
    attr: string
    label: string
    min?: number
    max?: number
    order?: readonly string[]
    read?: (stored: number) => number
    write?: (shown: number) => number
    format?: (n: number) => string
    title?: string
  }
  let { el, ensure, attr, label, min = 0, max = 50, order, read, write, format, title }: Props = $props()
  const stored = $derived(el?.attrs[attr])
  const value = $derived.by(() => {
    if (stored === undefined) return undefined
    const n = Number(stored)
    if (!Number.isFinite(n)) return undefined
    return read ? read(n) : n
  })
  function set(n: number) {
    const target = el ?? ensure?.()
    if (!target) return
    setAttr(target, attr, String(write ? write(n) : n), order)
  }
</script>

<Knob {label} {value} {min} {max} onchange={set} {format} param={attr} {title} />
