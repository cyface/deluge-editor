<script lang="ts">
  /**
   * A brass encoder. The arc is always the stored value; modulation is a
   * separate outer ring in the source's colour (never added into the arc).
   * Drag vertically, or focus and use the arrow keys (shift for ×5).
   */
  import { clamp } from '../../core/params/scale'

  export interface ModRing {
    color: string
    /** In knob units: the cable's full swing from the stored value. */
    amount: number
    title?: string
  }

  interface Props {
    label: string
    /** undefined = the file omits it; the firmware's default applies. */
    value: number | undefined
    min?: number
    max?: number
    onchange: (n: number) => void
    format?: (n: number) => string
    mod?: ModRing[]
    /** A gold encoder controls this parameter directly. */
    gold?: boolean
    /** For tests and tooling: which parameter this is. */
    param?: string
    title?: string
  }
  let { label, value, min = 0, max = 50, onchange, format, mod = [], gold = false, param, title }: Props = $props()

  const A_MIN = -135
  const A_SPAN = 270
  const pt = (r: number, deg: number): [number, number] => {
    const t = (deg * Math.PI) / 180
    return [24 + r * Math.sin(t), 24 - r * Math.cos(t)]
  }
  function arc(r: number, d0: number, d1: number): string {
    if (Math.abs(d1 - d0) < 0.4) return ''
    const [x0, y0] = pt(r, d0)
    const [x1, y1] = pt(r, d1)
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${Math.abs(d1 - d0) > 180 ? 1 : 0} ${d1 > d0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  const angleOf = (n: number) => A_MIN + (A_SPAN * (clamp(n, min, max) - min)) / (max - min)
  const angle = $derived(value === undefined ? A_MIN : angleOf(value))
  const rings = $derived(
    value === undefined
      ? []
      : mod.slice(0, 3).map((m, i) => ({
          color: m.color,
          title: m.title,
          d: arc(21.5 + i * 2.2, angle, angleOf(value + m.amount)),
        })),
  )
  const shown = $derived(value === undefined ? '—' : format ? format(value) : String(value))

  let y0 = 0
  let v0 = 0
  function down(e: PointerEvent) {
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    y0 = e.clientY
    v0 = value ?? min
  }
  function move(e: PointerEvent) {
    if (!(e.currentTarget as SVGElement).hasPointerCapture(e.pointerId)) return
    const n = clamp(Math.round(v0 + ((y0 - e.clientY) * (max - min)) / 150), min, max)
    if (n !== value) onchange(n)
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 5 : 1
    const cur = value ?? min
    let n: number | undefined
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') n = cur + step
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') n = cur - step
    else if (e.key === 'Home') n = min
    else if (e.key === 'End') n = max
    if (n === undefined) return
    e.preventDefault()
    onchange(clamp(n, min, max))
  }
</script>

<div class="k" class:gold class:unset={value === undefined} title={title ?? (value === undefined ? 'Not in the file: the firmware default applies. Adjust to set it.' : undefined)}>
  <svg
    class="dial"
    viewBox="0 0 48 48"
    width="44"
    height="44"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={shown}
    data-param={param}
    onpointerdown={down}
    onpointermove={move}
    onkeydown={key}
  >
    <circle cx="24" cy="24" r="17.5" fill="none" stroke="#282219" stroke-width="4" />
    {#each rings as r (r.d)}
      <path d={r.d} fill="none" stroke={r.color} stroke-width="2.2" stroke-linecap="round" opacity=".95"><title>{r.title}</title></path>
    {/each}
    <path d={arc(17.5, A_MIN, angle)} fill="none" stroke="#d4a34d" stroke-width="4" stroke-linecap="round" />
    <circle cx="24" cy="24" r="12.6" fill={gold ? '#2b2317' : '#181511'} stroke={gold ? '#5c4a24' : '#332c22'} />
    <line x1="24" y1="14" x2="24" y2="24" stroke={gold ? '#f2c67b' : '#e6d6b4'} stroke-width="2" stroke-linecap="round" transform="rotate({angle.toFixed(2)} 24 24)" />
  </svg>
  <div class="lbl">{label}</div>
  <div class="val">{shown}</div>
</div>

<style>
  .k { width: 56px; display: flex; flex-direction: column; align-items: center; gap: 2px; flex: none; }
  .dial { display: block; cursor: ns-resize; touch-action: none; }
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); text-align: center; line-height: 1.15; margin-top: 1px; }
  .val { font-family: var(--mono); font-size: 10px; font-weight: 500; color: #ded4c2; font-variant-numeric: tabular-nums; }
  .gold .lbl { color: #c4b294; }
  .unset .val { color: var(--faint); }
</style>
