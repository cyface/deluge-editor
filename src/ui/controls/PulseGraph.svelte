<script lang="ts">
  /**
   * What pulse width is doing to this oscillator, drawn a cycle at a time.
   *
   * Worth a picture because the control's name is wrong twice: on the Deluge
   * it is offered for nearly every waveform, and for the ones that are not
   * squares it is a phase distortion rather than a duty cycle. The arithmetic
   * behind both is `src/core/params/pulse.ts`, taken from
   * `Oscillator::renderOsc`; the drawing is a sketch of it, as `FilterGraph`
   * is a sketch of the filter — band limiting, the analog tables' own shapes
   * and the wavetable's loaded frames are all left out.
   *
   * Two things the picture is here to say. Zero is *off*, not a 50% square:
   * `doPulseWave` is false at zero, so the oscillator plays its plain wave.
   * And Osc Sync, which only Osc B has, takes the control away from every
   * shape but the mathematical square — the wave stops moving as the knob
   * turns, and the graph says why rather than leaving it a mystery.
   */
  import { pulseBaseWave, pulseDuty, pulseFamily, pulseSyncRatio, pulseWidthHeard } from '../../core/params/pulse'
  import { menuToHalf } from '../../core/params/scale'
  import { OSC_TYPE_NAMES, type SoundElement, type SoundParamAttr } from '../../core/preset'
  import { osc, paramMenu, setParamMenu } from '../../core/preset/sound'

  interface Props { sound: SoundElement; n: 1 | 2; type: string }
  let { sound, n, type }: Props = $props()

  /*
   * A strip along the bottom is the control, the rest is the drawing: the
   * graph's x axis is time, so the pulse width cannot also live on it. The
   * handle is grabbed rather than the surface clicked, as the filter and
   * envelope graphs work, and the travel is inset so the handle at either end
   * is fully inside the box instead of hanging half out of it.
   */
  const H = 88
  const PLOT = H - 22
  const MID = PLOT / 2
  const AMP = MID - 7
  const TRACK_Y = H - 9
  const PAD = 10
  const N = 480

  /** The box's rendered width; 300 until the binding measures it. */
  let width = $state(300)
  const W = $derived(Math.max(200, width))

  const attr = $derived(`osc${n === 1 ? 'A' : 'B'}PulseWidth` as SoundParamAttr)
  const menu = $derived(paramMenu(sound, attr) ?? 0)
  const stored = $derived(menuToHalf(menu))
  // Osc sync is Osc B's, and reaches renderOsc as `doOscSync` for source 1
  // only (`Voice::render` passes `(s == 1) && doingOscSync`).
  const oscSync = $derived(n === 2 && osc(sound, 2)?.attrs.oscillatorSync === '1')
  const heard = $derived(pulseWidthHeard(type, { oscSync }))
  const family = $derived(pulseFamily(type))
  const duty = $derived(heard ? pulseDuty(stored) : 0.5)
  const ratio = $derived(heard ? pulseSyncRatio(stored) : 1)
  const hx = $derived(PAD + (menu / 50) * (W - 2 * PAD))

  /** One cycle of the base wave, phase 0..1, before any pulse shaping (`pulseBaseWave`). */
  const base = (p: number): number => pulseBaseWave(type, p)

  /**
   * Two cycles of the note, so the shaping reads as a repeating wave rather
   * than a one-off. The square family becomes a pulse of `duty`; everything
   * else runs its wave `ratio` times faster and is hard-reset each cycle.
   */
  const path = $derived.by(() => {
    let d = ''
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2
      const q = t - Math.floor(t)
      const y = family === 'square' ? (q < duty ? 1 : -1) : base(q * ratio)
      d += `${i ? 'L' : 'M'}${((i / N) * W).toFixed(1)} ${(MID - y * AMP).toFixed(1)} `
    }
    return d
  })

  /** The plain wave behind it, so what the control changed is visible. */
  const plain = $derived.by(() => {
    let d = ''
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2
      const q = t - Math.floor(t)
      const y = family === 'square' ? (q < 0.5 ? 1 : -1) : base(q)
      d += `${i ? 'L' : 'M'}${((i / N) * W).toFixed(1)} ${(MID - y * AMP).toFixed(1)} `
    }
    return d
  })

  const shaped = $derived(heard && menu > 0)
  const caption = $derived.by(() => {
    if (!heard) return 'Osc Sync is on — this shape ignores pulse width'
    if (menu === 0) return 'off — the plain waveform'
    return family === 'square'
      ? `duty ${Math.round(duty * 100)}%${duty > 0.985 ? ' — near silent' : ''}`
      : `${ratio.toFixed(2)}× the note’s rate, hard-synced back to it`
  })

  /** Grab the handle and the width follows it, as the filter curve's dots work. */
  let svg: SVGSVGElement | undefined = $state()
  function grab(e: PointerEvent) {
    e.preventDefault()
    const s = svg!
    s.setPointerCapture(e.pointerId)
    const at = (ev: PointerEvent) => {
      const r = s.getBoundingClientRect()
      const x = ((ev.clientX - r.left) / r.width) * W
      setParamMenu(sound, attr, Math.round(Math.max(0, Math.min(1, (x - PAD) / (W - 2 * PAD))) * 50))
    }
    const up = (ev: PointerEvent) => {
      s.releasePointerCapture(ev.pointerId)
      s.removeEventListener('pointermove', at)
      s.removeEventListener('pointerup', up)
    }
    s.addEventListener('pointermove', at)
    s.addEventListener('pointerup', up)
  }
  /** The keyboard's way to the same handle: arrows step the width (shift, ×5). */
  function nudge(e: KeyboardEvent) {
    const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
    if (by === undefined) return
    e.preventDefault()
    setParamMenu(sound, attr, Math.max(0, Math.min(50, menu + by * (e.shiftKey ? 5 : 1))))
  }
</script>

<div class="wrap">
  <div class="graph" bind:clientWidth={width} title={heard ? 'Drag the handle to set pulse width' : 'Osc Sync takes this control away from every shape but the mathematical square'}>
    <svg bind:this={svg} viewBox="0 0 {W} {H}" height={H} data-testid="pulse-graph-{n}">
      <line x1="0" y1={MID} x2={W} y2={MID} stroke="#241f1a" />
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} stroke="#161311" />
      {#if shaped}
        <path d={plain} fill="none" stroke="var(--osc)" stroke-width="1" opacity=".22" />
      {/if}
      <path d={path} fill="none" stroke="var(--osc)" stroke-width="1.8" stroke-linejoin="miter" opacity={heard ? 1 : 0.4} />
      {#if heard}
        <line x1={PAD} y1={TRACK_Y} x2={W - PAD} y2={TRACK_Y} stroke="#2b2420" stroke-width="3" stroke-linecap="round" />
        <line x1={PAD} y1={TRACK_Y} x2={hx.toFixed(1)} y2={TRACK_Y} stroke="var(--osc)" stroke-width="3" stroke-linecap="round" opacity=".5" />
        <g class="handle" onpointerdown={grab} onkeydown={nudge} role="slider" aria-label="Osc {n === 1 ? 'A' : 'B'} pulse width" aria-valuemin="0" aria-valuemax="50" aria-valuenow={menu} tabindex="0">
          <!-- A transparent disc wider than the drawn one: the thing you aim at
               is bigger than the thing you see, which is the point of it. -->
          <circle cx={hx.toFixed(1)} cy={TRACK_Y} r="15" fill="rgba(0,0,0,0)" />
          <circle cx={hx.toFixed(1)} cy={TRACK_Y} r="8" fill="#1a1210" stroke="var(--osc)" stroke-width="2.5" />
          <circle cx={hx.toFixed(1)} cy={TRACK_Y} r="2.4" fill="var(--osc)" />
        </g>
      {/if}
    </svg>
  </div>
  <div class="glegend">
    <span>{OSC_TYPE_NAMES[type as keyof typeof OSC_TYPE_NAMES] ?? type}{#if family !== 'square'} · phase distortion, not a duty cycle{/if}</span>
    <span class="cap">{caption}</span>
  </div>
</div>

<style>
  .wrap { min-width: 0; }
  .cap { margin-left: auto; color: var(--muted); }
</style>
