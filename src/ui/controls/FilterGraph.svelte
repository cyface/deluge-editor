<script lang="ts">
  /**
   * The filter response as a sketch: cutoff on a log axis, resonance as a
   * peak, the HPF dashed. Series routing draws one curve in two colours;
   * parallel draws both and their sum. The maths is illustrative (menu value
   * → 20 Hz…20 kHz), not the firmware's filter model. Drag a point sideways
   * for cutoff and up for resonance; the knobs follow.
   */
  import type { SoundElement } from '../../core/preset'
  import { paramMenu, setParamMenu } from '../../core/preset/sound'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()

  const H = 150
  let width = $state(420)
  let box: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (!box) return
    const ro = new ResizeObserver(() => { width = Math.max(200, box!.clientWidth) })
    ro.observe(box)
    return () => ro.disconnect()
  })

  const lpfMode = $derived(sound.attrs.lpfMode ?? '24dB')
  const hpfMode = $derived(sound.attrs.hpfMode ?? 'HPLadder')
  const route = $derived(sound.attrs.filterRoute ?? 'H2L')
  const lpfFreq = $derived(paramMenu(sound, 'lpfFrequency') ?? 50)
  const lpfRes = $derived(paramMenu(sound, 'lpfResonance') ?? 0)
  const hpfFreq = $derived(paramMenu(sound, 'hpfFrequency') ?? 0)
  const hpfRes = $derived(paramMenu(sound, 'hpfResonance') ?? 0)
  const lpfOn = $derived(lpfMode !== 'Off')
  const hpfOn = $derived(hpfMode !== 'Off')
  const para = $derived(route === 'PARA')

  const fc = (menu: number) => 20 * Math.pow(1000, menu / 50)
  function lpfMag(fr: number): number {
    if (!lpfOn) return 1
    const q = 1 + (lpfRes / 50) * 11
    const r = fr / fc(lpfFreq)
    if (lpfMode.startsWith('SVF')) {
      const den = Math.sqrt(Math.pow((r - 1 / r) * q, 2) + 1)
      return lpfMode === 'SVF_Notch' ? Math.abs((r - 1 / r) * q) / den : 1 / den
    }
    const order = lpfMode === '12dB' ? 2 : 4
    return (1 / Math.sqrt(1 + Math.pow(r, 2 * order))) * (1 + (q - 1) * Math.exp(-Math.pow(Math.log(r) * 3.2, 2)))
  }
  function hpfMag(fr: number): number {
    if (!hpfOn) return 1
    const q = 1 + (hpfRes / 50) * 8
    const r = fr / fc(hpfFreq)
    if (hpfMode.startsWith('SVF')) {
      const den = Math.sqrt(Math.pow((r - 1 / r) * q, 2) + 1)
      return hpfMode === 'SVF_Notch' ? Math.abs((r - 1 / r) * q) / den : 1 / den
    }
    return (Math.pow(r, 2) / Math.sqrt(1 + Math.pow(r, 4))) * (1 + (q - 1) * 0.4 * Math.exp(-Math.pow(Math.log(r) * 3.2, 2)))
  }
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
  const W = $derived(width)
  const xLpf = $derived((lpfFreq / 50) * W)
  const xHpf = $derived((hpfFreq / 50) * W)
  const cross = $derived(hpfOn && lpfOn ? (xLpf + xHpf) / 2 : hpfOn ? W : 0)
  const dl = $derived(pathFor(lpfMag, W))
  const dh = $derived(pathFor(hpfMag, W))
  const dc = $derived(pathFor(combined, W))
  const yRes = (v: number) => H * 0.86 - (v / 50) * (H * 0.72)
  const caption = $derived.by(() => {
    const f = fc(lpfFreq)
    const lp = lpfOn ? `LPF ${f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(1)} kHz`} · Q ${(1 + (lpfRes / 50) * 11).toFixed(1)}` : 'LPF bypassed'
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
        setParamMenu(sound, which === 'lpf' ? 'lpfFrequency' : 'hpfFrequency', Math.round(x * 50))
        setParamMenu(sound, which === 'lpf' ? 'lpfResonance' : 'hpfResonance', Math.round(Math.max(0, Math.min(50, ((H * 0.86 - y) / (H * 0.72)) * 50))))
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
</script>

<div class="wrap">
  <div class="graph" bind:this={box} title="Drag a dot: sideways for cutoff, up and down for resonance">
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
        <g class="handle" onpointerdown={grab('lpf')} role="slider" aria-label="LPF cutoff and resonance" aria-valuenow={lpfFreq} tabindex="-1">
          <circle cx={xLpf} cy={yRes(lpfRes)} r="6" fill="#1a1610" stroke="var(--flt)" stroke-width="2" />
          <circle cx={xLpf} cy={yRes(lpfRes)} r="1.8" fill="var(--flt)" />
        </g>
      {/if}
      {#if hpfOn}
        <g class="handle" onpointerdown={grab('hpf')} role="slider" aria-label="HPF cutoff and resonance" aria-valuenow={hpfFreq} tabindex="-1">
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
