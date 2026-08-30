<script lang="ts">
  /**
   * A knob over one hex attribute of any element (`<defaultParams>`,
   * `<envelope1>`, `<equalizer>`, a kit's `<lpf>`…). Reads and writes through
   * the firmware's own scaling; draws the mod ring from the cables into the
   * parameter and a brass face when a gold encoder owns it.
   */
  import type { HexParam } from '../../core/params/hex'
  import { paramNameOfAttr, type SoundElement } from '../../core/preset'
  import { cableMenu, cablesTo, goldParams, hexToMenu, menuToHex, type ParamScale } from '../../core/preset/sound'
  import { setAttr, type XmlElement } from '../../core/xml'
  import { sourceColor, sourceName } from '../sources'
  import Knob, { type ModRing } from './Knob.svelte'

  interface Props {
    el: XmlElement | undefined
    /** Creates the element on first write when `el` is undefined. */
    ensure?: () => XmlElement
    attr: string
    label: string
    scale?: ParamScale
    /** Attribute order for a value the file lacks. */
    order?: readonly string[]
    /** The sound whose cables and gold knobs apply; omit for kit-level params. */
    sound?: SoundElement
    /** Cable destination name when it differs from `attr` (defaults to the firmware's mapping). */
    dest?: string
    /** A second destination whose cables also swing this knob (`volume`: LOCAL_VOLUME has no knob of its own). */
    extraDest?: string
    title?: string
  }
  let { el, ensure, attr, label, scale = 'standard', order, sound, dest, extraDest, title }: Props = $props()

  const range = $derived(scale === 'pan' ? { min: -25, max: 25 } : { min: 0, max: 50 })
  const hex = $derived(el?.attrs[attr])
  const value = $derived(hex === undefined ? undefined : hexToMenu(hex, scale))
  const destination = $derived(dest ?? paramNameOfAttr(attr))
  const mod = $derived<ModRing[]>(
    sound
      ? [...cablesTo(sound, destination), ...(extraDest ? cablesTo(sound, extraDest) : [])].map((c) => ({
          color: sourceColor(c.attrs.source),
          amount: (cableMenu(c) / 5000) * (range.max - range.min),
          title: `${sourceName(c.attrs.source)} → ${label}`,
        }))
      : [],
  )
  const gold = $derived(sound ? goldParams(sound).has(destination) : false)
  const format = $derived(scale === 'pan' ? (n: number) => (n === 0 ? 'CTR' : `${n < 0 ? 'L' : 'R'}${Math.abs(n)}`) : undefined)

  function set(n: number) {
    const target = el ?? ensure?.()
    if (!target) return
    setAttr(target, attr, menuToHex(n, scale) as HexParam, order)
  }
</script>

<Knob {label} {value} min={range.min} max={range.max} onchange={set} {format} {mod} {gold} param={attr} {title} />
