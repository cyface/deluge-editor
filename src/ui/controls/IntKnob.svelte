<script lang="ts">
  /** A knob over an integer attribute, optionally through a display transform (sidechain rate tables, compressor q31). */
  import type { XmlElement } from '../../core/xml'
  import { writeAttr } from '../attrs'
  import Knob from './Knob.svelte'
  interface Props {
    el: XmlElement | undefined
    /** Creates the element on first write when `el` is undefined. */
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
    /** The firmware's default, in knob units, when its source has been cited. */
    fallback?: number
    /** The firmware is not reading this value right now; see `Knob`. */
    disabled?: boolean
    /** Why it is disabled; joined onto the tooltip. */
    disabledNote?: string
  }
  let { el, ensure, attr, label, min = 0, max = 50, order, read, write, format, title, fallback, disabled = false, disabledNote }: Props = $props()
  const stored = $derived(el?.attrs[attr])
  const value = $derived.by(() => {
    if (stored === undefined) return undefined
    const n = Number(stored)
    if (!Number.isFinite(n)) return undefined
    return read ? read(n) : n
  })
  const set = (n: number) => writeAttr(el, ensure, attr, String(write ? write(n) : n), order)
</script>

<Knob {label} {value} {min} {max} onchange={set} {format} param={attr} {title} {fallback} {disabled} {disabledNote} />
