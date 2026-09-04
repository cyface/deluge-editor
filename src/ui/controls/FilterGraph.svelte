<script lang="ts" module>
  /**
   * Where the graph's values live. A synth (or kit row) keeps them flat in
   * `<defaultParams>`; the kit bus keeps them in `<defaultParams><lpf>/<hpf>`
   * children — so the graph binds through these accessors instead of a
   * SoundElement. Values are menu numbers (0–50), the Deluge's own.
   */
  export type FilterParam = 'lpfFrequency' | 'lpfResonance' | 'hpfFrequency' | 'hpfResonance'
  export interface FilterBinding {
    attr: (name: 'lpfMode' | 'hpfMode' | 'filterRoute') => string | undefined
    read: (param: FilterParam) => number | undefined
    write: (param: FilterParam, menu: number) => void
  }
</script>

<script lang="ts">
  /**
   * The filter response as a sketch: cutoff on a log axis, resonance as a
   * peak, the HPF dashed. Series routing draws one curve in two colours;
   * parallel draws both and their sum. The maths is illustrative (menu value
   * → 20 Hz…20 kHz), not the firmware's filter model. Drag a point sideways
   * for cutoff and up for resonance; the knobs follow.
   */
  import { filterCutoffHz, hpfMagnitude, lpfMagnitude, lpfQ } from '../../core/params/filter'

  interface Props { filters: FilterBinding }
  let { filters }: Props = $props()

  const H = 150
  /** The box's rendered width; 420 until the binding measures it. */
  let width = $state(420)
  const W = $derived(Math.max(200, width))

  const lpfMode = $derived(filters.attr('lpfMode') ?? '24dB')
  const hpfMode = $derived(filters.attr('hpfMode') ?? 'HPLadder')
  const route = $derived(filters.attr('filterRoute') ?? 'H2L')
  const lpfFreq = $derived(filters.read('lpfFrequency') ?? 50)
  const lpfRes = $derived(filters.read('lpfResonance') ?? 0)
  const hpfFreq = $derived(filters.read('hpfFrequency') ?? 0)
  const hpfRes = $derived(filters.read('hpfResonance') ?? 0)
  const lpfOn = $derived(lpfMode !== 'Off')
  const hpfOn = $derived(hpfMode !== 'Off')
  const para = $derived(route === 'PARA')

  // The curves are `src/core/params/filter.ts`; `Off` draws flat there.
  const fc = filterCutoffHz
  const lpfMag = (fr: number) => lpfMagnitude(fr, lpfMode, lpfFreq, lpfRes)
  const hpfMag = (fr: number) => hpfMagnitude(fr, hpfMode, hpfFreq, hpfRes)
  // Vertical scale −70…+24 dB: a full-resonance ladder peak is ≈ +19 dB, so
  // it must fit inside the box — clamping it flat would misread as saturation.
  const DB_MIN = -70
  const DB_MAX = 24
  const yFor = (mag: number) => {
    const db = 20 * Math.log10(Math.max(mag, 1e-4))
    return Math.max(3, Math.min(H - 2, H - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * H))
  }
  function pathFor(fn: (fr: number) => number, W: number): string {
    let d = ''
    const N = 160
    for (let i = 0; i <= N; i++) {
      const x = i / N
      d += `${i ? 'L' : 'M'}${(x * W).toFixed(1)} ${yFor(fn(20 * Math.pow(1000, x))).toFixed(1)} `
    }
    return d
  }
  const combined = (fr: number) => (para ? Math.min(2, lpfMag(fr) + hpfMag(fr)) : lpfMag(fr) * hpfMag(fr))
  const xLpf = $derived((lpfFreq / 50) * W)
  const xHpf = $derived((hpfFreq / 50) * W)
  const cross = $derived(hpfOn && lpfOn ? (xLpf + xHpf) / 2 : hpfOn ? W : 0)
  const dl = $derived(pathFor(lpfMag, W))
  const dh = $derived(pathFor(hpfMag, W))
  const dc = $derived(pathFor(combined, W))
  const yRes = (v: number) => H * 0.86 - (v / 50) * (H * 0.72)
  const caption = $derived.by(() => {
    const f = fc(lpfFreq)
    const lp = lpfOn ? `LPF ${f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(1)} kHz`} · Q ${lpfQ(lpfRes).toFixed(1)}` : 'LPF bypassed'
    return hpfOn ? `${lp}   HPF ${Math.round(fc(hpfFreq))} Hz` : lp
  })

  let svg: SVGSVGElement | undefined = $state()
  function grab(which: 'lpf' | 'hpf') {
    return (e: PointerEvent) => {
      e.preventDefault()
      const s = svg!
      s.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const r = s.getBoundingClientRect()
        const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
        const y = ((ev.clientY - r.top) / r.height) * H
        filters.write(which === 'lpf' ? 'lpfFrequency' : 'hpfFrequency', Math.round(x * 50))
        filters.write(which === 'lpf' ? 'lpfResonance' : 'hpfResonance', Math.round(Math.max(0, Math.min(50, ((H * 0.86 - y) / (H * 0.72)) * 50))))
      }
      const up = (ev: PointerEvent) => {
        s.releasePointerCapture(ev.pointerId)
        s.removeEventListener('pointermove', move)
        s.removeEventListener('pointerup', up)
      }
      s.addEventListener('pointermove', move)
      s.addEventListener('pointerup', up)
    }
  }

  /** The keyboard's way to the same dots: left and right for cutoff, up and down for resonance (shift, ×5). */
  function nudge(which: 'lpf' | 'hpf') {
    return (e: KeyboardEvent) => {
      const dx = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
      const dy = { ArrowUp: 1, ArrowDown: -1 }[e.key]
      if (dx === undefined && dy === undefined) return
      e.preventDefault()
      const step = e.shiftKey ? 5 : 1
      const clamp = (v: number) => Math.max(0, Math.min(50, v))
      if (dx !== undefined) filters.write(which === 'lpf' ? 'lpfFrequency' : 'hpfFrequency', clamp((which === 'lpf' ? lpfFreq : hpfFreq) + dx * step))
      if (dy !== undefined) filters.write(which === 'lpf' ? 'lpfResonance' : 'hpfResonance', clamp((which === 'lpf' ? lpfRes : hpfRes) + dy * step))
    }
  }
</script>

<div class="wrap">
  <div class="graph" bind:clientWidth={width} title="Drag a dot: sideways for cutoff, up and down for resonance">
    <!-- overflow visible so a handle at full cutoff or zero resonance isn't clipped at the edge -->
    <svg bind:this={svg} viewBox="0 0 {W} {H}" height={H} style="overflow:visible" data-testid="filter-graph">
      {#each [0, 0.25, 0.5, 0.75, 1] as x (x)}<line x1={x * W} y1="0" x2={x * W} y2={H} stroke="#161311" />{/each}
      {#each [0.25, 0.5, 0.75] as y (y)}<line x1="0" y1={y * H} x2={W} y2={y * H} stroke="#131110" />{/each}
      {#if para && lpfOn && hpfOn}
        <path d="{dh}L{W} {H} L0 {H} Z" fill="rgba(79,200,232,.10)" />
        <path d="{dl}L{W} {H} L0 {H} Z" fill="rgba(238,125,51,.10)" />
        <path d={dh} fill="none" stroke="var(--hpf)" stroke-width="1.6" stroke-dasharray="4 3" opacity=".9" />
        <path d={dl} fill="none" stroke="var(--flt)" stroke-width="1.6" opacity=".9" />
        <path d={dc} fill="none" stroke="#efe6d4" stroke-width="2" opacity=".85" />
      {:else}
        <clipPath id="fclipL"><rect x="0" y="0" width={cross.toFixed(1)} height={H} /></clipPath>
        <clipPath id="fclipR"><rect x={cross.toFixed(1)} y="0" width={(W - cross).toFixed(1)} height={H} /></clipPath>
        <path d="{dc}L{W} {H} L0 {H} Z" fill="rgba(238,125,51,.09)" />
        <path d={dc} clip-path="url(#fclipL)" fill="none" stroke={hpfOn ? 'var(--hpf)' : 'var(--flt)'} stroke-width="2.2" stroke-dasharray={hpfOn ? '5 3' : undefined} />
        <path d={dc} clip-path="url(#fclipR)" fill="none" stroke="var(--flt)" stroke-width="2.2" />
      {/if}
      {#if lpfOn}<line x1={xLpf} y1="0" x2={xLpf} y2={H} stroke="var(--flt)" stroke-width="1" opacity=".35" />{/if}
      {#if hpfOn}<line x1={xHpf} y1="0" x2={xHpf} y2={H} stroke="var(--hpf)" stroke-width="1" opacity=".3" />{/if}
      {#if lpfOn}
        <g class="handle" onpointerdown={grab('lpf')} onkeydown={nudge('lpf')} role="slider" aria-label="LPF cutoff and resonance" aria-valuemin="0" aria-valuemax="50" aria-valuenow={lpfFreq} aria-valuetext="cutoff {lpfFreq}, resonance {lpfRes}" tabindex="0">
          <circle cx={xLpf} cy={yRes(lpfRes)} r="6" fill="#1a1610" stroke="var(--flt)" stroke-width="2" />
          <circle cx={xLpf} cy={yRes(lpfRes)} r="1.8" fill="var(--flt)" />
        </g>
      {/if}
      {#if hpfOn}
        <g class="handle" onpointerdown={grab('hpf')} onkeydown={nudge('hpf')} role="slider" aria-label="HPF cutoff and resonance" aria-valuemin="0" aria-valuemax="50" aria-valuenow={hpfFreq} aria-valuetext="cutoff {hpfFreq}, resonance {hpfRes}" tabindex="0">
          <circle cx={xHpf} cy={yRes(hpfRes)} r="6" fill="#0f1618" stroke="var(--hpf)" stroke-width="2" />
          <circle cx={xHpf} cy={yRes(hpfRes)} r="1.8" fill="var(--hpf)" />
        </g>
      {/if}
    </svg>
    <div class="gaxis"><span>20</span><span>100</span><span>1k</span><span>10k</span><span>20k</span></div>
  </div>
  <div class="glegend">
    <span><i style="border-top-style:dashed;border-top-color:var(--hpf)"></i>HPF</span>
    <span><i style="border-top-color:var(--flt)"></i>LPF</span>
    <span>{para ? 'parallel · sum in white' : route === 'L2H' ? 'series · LPF then HPF' : 'series · HPF then LPF'}</span>
    <span class="cap">{caption}</span>
  </div>
</div>

<style>
  .wrap { min-width: 0; }
  .cap { margin-left: auto; color: var(--muted); }
</style>
