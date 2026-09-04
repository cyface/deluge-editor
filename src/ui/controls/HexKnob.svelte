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
  import type { XmlElement } from '../../core/xml'
  import { writeAttr } from '../attrs'
  import { paramHelp } from '../help'
  import { isPatchableDestination } from '../options'
  import { sourceColor, sourceName } from '../sources'
  import { editor } from '../state/editor.svelte'
  import { picker } from '../state/picker.svelte'
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
    /** Overrides the description `help.ts` holds for this parameter. */
    title?: string
    /** The firmware is not reading this value right now; see `Knob`. */
    disabled?: boolean
    /** Why it is disabled; joined onto the tooltip. */
    disabledNote?: string
    /** The firmware's default, in menu units, when its source has been cited. */
    fallback?: number
  }
  let { el, ensure, attr, label, scale = 'standard', order, sound, dest, extraDest, title, disabled = false, disabledNote, fallback }: Props = $props()

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
  // What the parameter does, looked up by the same name a cable or gold knob
  // uses for it, so one entry serves every panel that shows it (issue #20).
  const tip = $derived(title ?? paramHelp(destination))
  const format = $derived(scale === 'pan' ? (n: number) => (n === 0 ? 'CTR' : `${n < 0 ? 'L' : 'R'}${Math.abs(n)}`) : undefined)

  const set = (n: number) => writeAttr(el, ensure, attr, menuToHex(n, scale) as HexParam, order)

  // Right-click starts a cable into this param (issue #13). Only params the
  // firmware can patch get the menu — an unpatchable one gets nothing, not a
  // disabled stub (docs/decisions.md). Long-press fires contextmenu on touch.
  // A disabled knob is one the firmware is not reading, and the firmware
  // won't take a cable to it either — `Sound::maySourcePatchToParam` returns
  // DISALLOWED for an LFO rate under sync — so the menu goes with it.
  const patchable = $derived(!disabled && sound !== undefined && isPatchableDestination(destination, editor.supports))
  function context(e: MouseEvent) {
    if (!patchable) return
    e.preventDefault()
    picker.show(destination, label, e.clientX, e.clientY)
  }
</script>

<span style="display: contents" role="presentation" oncontextmenu={context}>
  <Knob {label} {value} min={range.min} max={range.max} onchange={set} {format} {mod} {gold} param={attr} title={tip} {disabled} {disabledNote} {fallback} />
</span>
