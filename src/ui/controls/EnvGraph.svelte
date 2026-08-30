<script lang="ts">
  /**
   * ADSR overlay: every present envelope faint, the selected one filled and
   * draggable — the attack peak slides sideways, the decay/sustain corner
   * moves both ways, the release end slides sideways; the knobs follow.
   * Time runs on a fixed scale (330 units = max attack+decay+hold+release),
   * so segment lengths compare across envelopes and every handle can move
   * both directions. Sketch only; the firmware's stages are table lookups.
   */
  import type { SoundElement } from '../../core/preset'
  import { envelope, envelopeMenu, setEnvelopeMenu } from '../../core/preset/sound'
  interface Props { sound: SoundElement; selected: number; available: number[] }
  let { sound, selected, available }: Props = $props()
  const H = 74, pad = 4
  const TOTAL = 80 + 90 + 70 + 90 // max ta + td + hold + tr

  let width = $state(300)
  let box: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (!box) return
    const ro = new ResizeObserver(() => { width = Math.max(200, box!.clientWidth) })
    ro.observe(box)
    return () => ro.disconnect()
  })
  const W = $derived(width)
  const sc = $derived((W - 2 * pad) / TOTAL)

  const y = (v: number) => H - pad - (v / 50) * (H - 2 * pad)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  function geom(n: 1 | 2 | 3 | 4) {
    const A = envelopeMenu(sound, n, 'attack') ?? 0
    const D = envelopeMenu(sound, n, 'decay') ?? 20
    const S = envelopeMenu(sound, n, 'sustain') ?? 25
    const R = envelopeMenu(sound, n, 'release') ?? 20
    const ta = (A / 50) * 80, td = (D / 50) * 90, ts = 70, tr = (R / 50) * 90
    const x1 = pad + ta * sc, x2 = x1 + td * sc, x3 = x2 + ts * sc, x4 = x3 + tr * sc
    return { A, D, S, R, x1, x2, x3, x4 }
  }
  function path(n: 1 | 2 | 3 | 4): string | null {
    if (!envelope(sound, n)) return null
    const g = geom(n)
    return `M${pad} ${y(0)}L${g.x1.toFixed(1)} ${y(50)}L${g.x2.toFixed(1)} ${y(g.S)}L${g.x3.toFixed(1)} ${y(g.S)}L${g.x4.toFixed(1)} ${y(0)}`
  }
  const curves = $derived(
    [4, 3, 2, 1]
      .filter((n) => available.includes(n))
      .map((n) => ({ n, d: path(n as 1 | 2 | 3 | 4) }))
      .filter((c): c is { n: number; d: string } => c.d !== null),
  )
  const sel = $derived(geom(selected as 1 | 2 | 3 | 4))

  let svg: SVGSVGElement | undefined = $state()
  function grab(which: 'attack' | 'decay' | 'release') {
    return (e: PointerEvent) => {
      e.preventDefault()
      const s = svg!
      const n = selected as 1 | 2 | 3 | 4
      s.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const r = s.getBoundingClientRect()
        const x = ((ev.clientX - r.left) / r.width) * W
        const yy = ((ev.clientY - r.top) / r.height) * H
        const g = geom(n)
        if (which === 'attack') setEnvelopeMenu(sound, n, 'attack', Math.round(clamp((x - pad) / sc, 0, 80) / 80 * 50))
        else if (which === 'decay') {
          setEnvelopeMenu(sound, n, 'decay', Math.round(clamp((x - g.x1) / sc, 0, 90) / 90 * 50))
          setEnvelopeMenu(sound, n, 'sustain', Math.round(clamp(((H - pad - yy) / (H - 2 * pad)) * 50, 0, 50)))
        } else setEnvelopeMenu(sound, n, 'release', Math.round(clamp((x - g.x3) / sc, 0, 90) / 90 * 50))
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

<div class="graph" bind:this={box} title="Drag the points: attack peak sideways, decay/sustain corner any way, release end sideways">
  <!-- overflow visible so the edge handles (attack at the top, release on the floor) don't clip -->
  <svg bind:this={svg} viewBox="0 0 {W} {H}" height={H} style="overflow:visible" data-testid="env-graph">
    {#each curves as c (c.n)}
      <path d={c.d} fill={c.n === selected ? 'rgba(147,209,82,.13)' : 'none'} stroke="var(--env)" stroke-width={c.n === selected ? 2 : 1} opacity={c.n === selected ? 1 : 0.28} />
    {/each}
    <g class="handle" onpointerdown={grab('attack')} role="slider" aria-label="Attack" aria-valuenow={sel.A} tabindex="-1">
      <circle cx={sel.x1} cy={y(50)} r="6" fill="#131a10" stroke="var(--env)" stroke-width="2" />
      <circle cx={sel.x1} cy={y(50)} r="1.8" fill="var(--env)" />
    </g>
    <g class="handle" onpointerdown={grab('decay')} role="slider" aria-label="Decay and sustain" aria-valuenow={sel.D} tabindex="-1">
      <circle cx={sel.x2} cy={y(sel.S)} r="6" fill="#131a10" stroke="var(--env)" stroke-width="2" />
      <circle cx={sel.x2} cy={y(sel.S)} r="1.8" fill="var(--env)" />
    </g>
    <g class="handle" onpointerdown={grab('release')} role="slider" aria-label="Release" aria-valuenow={sel.R} tabindex="-1">
      <circle cx={sel.x4} cy={y(0)} r="6" fill="#131a10" stroke="var(--env)" stroke-width="2" />
      <circle cx={sel.x4} cy={y(0)} r="1.8" fill="var(--env)" />
    </g>
    <text x={W - 6} y="12" text-anchor="end" font-family="ui-monospace,monospace" font-size="8.5" fill="var(--faint)">ENV {selected}{selected === 1 ? ' · MASTER VOLUME' : ''}</text>
  </svg>
</div>
