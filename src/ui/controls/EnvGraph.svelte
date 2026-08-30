<script lang="ts">
  /** ADSR overlay: every present envelope faint, the selected one filled. Sketch only; the firmware's stages are table lookups. */
  import type { SoundElement } from '../../core/preset'
  import { envelope, envelopeMenu } from '../../core/preset/sound'
  interface Props { sound: SoundElement; selected: number; available: number[] }
  let { sound, selected, available }: Props = $props()
  const W = 300, H = 74, pad = 4
  const y = (v: number) => H - pad - (v / 50) * (H - 2 * pad)
  function path(n: 1 | 2 | 3 | 4): string | null {
    if (!envelope(sound, n)) return null
    const A = envelopeMenu(sound, n, 'attack') ?? 0
    const D = envelopeMenu(sound, n, 'decay') ?? 20
    const S = envelopeMenu(sound, n, 'sustain') ?? 25
    const R = envelopeMenu(sound, n, 'release') ?? 20
    const ta = (A / 50) * 80, td = (D / 50) * 90, ts = 70, tr = (R / 50) * 90
    const sc = (W - 2 * pad) / (ta + td + ts + tr || 1)
    const x1 = pad + ta * sc, x2 = x1 + td * sc, x3 = x2 + ts * sc, x4 = x3 + tr * sc
    return `M${pad} ${y(0)}L${x1.toFixed(1)} ${y(50)}L${x2.toFixed(1)} ${y(S)}L${x3.toFixed(1)} ${y(S)}L${x4.toFixed(1)} ${y(0)}`
  }
  const curves = $derived(
    [4, 3, 2, 1]
      .filter((n) => available.includes(n))
      .map((n) => ({ n, d: path(n as 1 | 2 | 3 | 4) }))
      .filter((c): c is { n: number; d: string } => c.d !== null),
  )
</script>

<div class="graph">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" height="74">
    {#each curves as c (c.n)}
      <path d={c.d} fill={c.n === selected ? 'rgba(147,209,82,.13)' : 'none'} stroke="var(--env)" stroke-width={c.n === selected ? 2 : 1} opacity={c.n === selected ? 1 : 0.28} />
    {/each}
    <text x={W - 6} y="12" text-anchor="end" font-family="ui-monospace,monospace" font-size="8" fill="#5d564d">ENV {selected}</text>
  </svg>
</div>
