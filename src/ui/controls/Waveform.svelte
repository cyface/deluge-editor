<script lang="ts">
  /**
   * A row's waveform thumbnail: peak buckets from the audio-preview cache,
   * drawn as one filled max/min outline. Renders nothing until the sample's
   * audio is available (local bytes decode in the background; a card-only
   * sample appears after it has been previewed).
   */
  import { audio } from '../state/audio.svelte'

  interface Props { fileName: string }
  let { fileName }: Props = $props()

  const W = 84
  const H = 22
  const N = 42
  const peaks = $derived(audio.peaksFor(fileName, N))
  const path = $derived.by(() => {
    if (!peaks) return ''
    const x = (i: number) => ((i + 0.5) * W) / N
    const y = (v: number) => (0.5 - v * 0.48) * H
    let d = ''
    for (let i = 0; i < N; i++) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(peaks.max[i]).toFixed(1)} `
    for (let i = N - 1; i >= 0; i--) d += `L${x(i).toFixed(1)} ${y(peaks.min[i]).toFixed(1)} `
    return `${d}Z`
  })
</script>

{#if path}
  <svg data-testid="row-wave" width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true">
    <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--edge-hi)" stroke-width="0.5" />
    <path d={path} fill="var(--brass-dim)" stroke="var(--brass-dim)" stroke-width="0.6" opacity="0.75" />
  </svg>
{/if}
