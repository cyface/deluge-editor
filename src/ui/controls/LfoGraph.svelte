<script lang="ts">
  /**
   * The LFOs as a picture: every one that the file has, faint, with the
   * selected one drawn over them — the ADSR overlay's arrangement, for the
   * same reason. Four LFOs at four rates are only comparable side by side.
   *
   * The time axis is the firmware's own arithmetic, not a guess —
   * `src/core/params/lfo.ts` runs the rate parameter through the patcher and
   * `getExp` to the phase increment `LFO::render` advances by, so "1.25 Hz" is
   * what the instrument would run at. The window is a power of two seconds
   * holding a few cycles of the selected LFO, so turning the rate visibly
   * packs the wave in rather than only changing a label.
   *
   * A *synced* LFO gets no frequency at all: its increment comes from the
   * song's tempo (`Sound::getSyncedLFOPhaseIncrement`), which a preset file
   * does not carry. Its axis is drawn in cycles instead, and since a sync
   * level is an absolute note length the other synced LFOs still have a known
   * ratio to it and are drawn alongside. Seconds and note lengths cannot share
   * an axis, so a synced LFO is never ghosted behind an unsynced one.
   *
   * The wave shapes are the firmware's (`util/waves.h`, `modulation/lfo.h`)
   * and the cycle starts where the firmware starts it (`lfo.cpp`), but the
   * three random shapes can only be one run of many, and are drawn as such.
   */
  import { LFO_SCOPE } from '../../core/firmware/features'
  import { formatLfoRate, lfoPhaseIncrement, lfoStartPhase, SAMPLE_RATE } from '../../core/params/lfo'
  import { menuToStandard } from '../../core/params/scale'
  import { syncLevelName, SYNC_TYPES } from '../../core/params/sync'
  import { LFO_TYPE_NAMES, type SoundElement, type SoundParamAttr } from '../../core/preset'
  import { lfo as lfoElement, paramMenu, setParamMenu } from '../../core/preset/sound'

  interface Props { sound: SoundElement; selected: 1 | 2 | 3 | 4; available: number[] }
  let { sound, selected, available }: Props = $props()

  type N = 1 | 2 | 3 | 4
  /*
   * A strip along the bottom is the rate control, the rest is the drawing: the
   * graph's x axis is time, so the rate cannot also live on it. The handle is
   * grabbed rather than the surface clicked, as the filter and envelope graphs
   * work, and the travel is inset so the handle at either end is fully inside
   * the box. The time labels sit above the strip rather than on the floor,
   * which is the one place this graph's furniture differs from `FilterGraph`'s.
   */
  const H = 104
  const PLOT = H - 22
  const MID = PLOT / 2
  const AMP = MID - 7
  const TRACK_Y = H - 9
  const PAD = 10
  const N_POINTS = 480

  let width = $state(420)
  let box: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (!box) return
    const ro = new ResizeObserver(() => { width = Math.max(200, box!.clientWidth) })
    ro.observe(box)
    return () => ro.disconnect()
  })
  const W = $derived(width)

  const scopeOf = (n: N) => LFO_SCOPE[`lfo${n}` as keyof typeof LFO_SCOPE]
  const colourOf = (n: N) => (scopeOf(n) === 'global' ? 'var(--lfo1)' : 'var(--lfo2)')
  const rateAttrOf = (n: N) => `lfo${n}Rate` as SoundParamAttr

  /**
   * One LFO as the file has it. The absent-attribute defaults are the
   * firmware's: `LFOConfig()` leaves the shape TRIANGLE (`modulation/lfo.h`),
   * and the `<lfoN>` readers preset SYNC_LEVEL_NONE / SYNC_TYPE_EVEN before
   * reading (`sound.cpp`) — the same fallbacks the selects use.
   */
  function shapeOf(n: N) {
    const el = lfoElement(sound, n)
    return {
      present: el !== undefined,
      type: el?.attrs.type ?? 'triangle',
      syncLevel: el?.attrs.syncLevel ?? '0',
      syncType: el?.attrs.syncType ?? '0',
      rate: paramMenu(sound, rateAttrOf(n)) ?? 0,
    }
  }

  const sel = $derived(shapeOf(selected))
  const synced = $derived(sel.syncLevel !== '0')
  const random = $derived(sel.type === 'sah' || sel.type === 'rwalk' || sel.type === 'warbler')
  const hzOf = (menu: number) => SAMPLE_RATE * (lfoPhaseIncrement(menuToStandard(menu)) / 4294967296)
  const hz = $derived(hzOf(sel.rate))

  /**
   * A synced LFO's cycle as a multiple of a bar: the file's sync level is an
   * absolute note length (`sync.ts`), 2^(3 − level) bars, and the sync type
   * scales the phase increment by 3/2 for triplets and 2/3 for dotted
   * (`Sound::getSyncedLFOPhaseIncrement`), so the cycle goes the other way.
   */
  function syncedBars(syncLevel: string, syncType: string): number | null {
    const level = Number(syncLevel)
    if (!Number.isInteger(level) || level <= 0) return null
    const bars = 2 ** (3 - level)
    return bars * (syncType === '10' ? 2 / 3 : syncType === '19' ? 3 / 2 : 1)
  }

  /*
   * The window: a power of two seconds holding at least `least` cycles, so
   * turning the rate visibly packs the wave in and only occasionally jumps the
   * axis. Two cycles is enough to read a wave, but the random shapes need a
   * longer run before they look like anything — a random walk moves by at most
   * a fortieth of its range per cycle (`LFO::render`), so four cycles of it is
   * a flat line that misrepresents the shape.
   */
  const least = $derived(sel.type === 'rwalk' ? 32 : random ? 8 : 2)
  const win = $derived(2 ** Math.ceil(Math.log2(least / hz)))
  /** Cycles of the selected LFO across the width. Synced, the window *is* `least`. */
  const cycles = $derived(synced ? least : hz * win)

  /**
   * How many cycles of LFO `n` fit the same window — `null` when it cannot
   * share the axis, which is any LFO on the other side of the sync divide.
   */
  function cyclesFor(n: N): number | null {
    const s = shapeOf(n)
    const bars = syncedBars(s.syncLevel, s.syncType)
    if (synced) {
      const selBars = syncedBars(sel.syncLevel, sel.syncType)!
      return bars === null ? null : (cycles * selBars) / bars
    }
    return bars === null ? hzOf(s.rate) * win : null
  }

  /**
   * A stable per-cycle random source: the run redraws the same way every time,
   * so the graph doesn't flicker on every keystroke. The offset only picks a
   * stretch of it whose first few draws are spread across the range — one run
   * of a random shape can honestly be six similar levels in a row, but that is
   * the one run that says least about what the shape does.
   */
  function noise(step: number, n: N): number {
    // Each LFO gets its own stretch, so two ghosts don't trace the same run.
    const i = step + 205 + n * 977
    let x = Math.imul(i + 0x9e3779b9, 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296
  }

  /** The periodic shapes over one cycle of phase, as the firmware renders them. */
  function wave(type: string, p: number): number {
    const q = p - Math.floor(p)
    if (type === 'sine') return Math.sin(2 * Math.PI * q)
    // getSquare: high for the first half of the phase.
    if (type === 'square') return q < 0.5 ? 1 : -1
    // getTriangle: the negative extreme at phase 0, the positive one at the half.
    if (type === 'triangle') return q < 0.5 ? -1 + 4 * q : 3 - 4 * q
    // SAW reads the raw uint32 phase as an int32: a ramp that wraps at the half.
    if (type === 'saw') return q < 0.5 ? 2 * q : 2 * q - 2
    return 0
  }

  /**
   * The three shapes that are not waves. Sample & hold jumps to a new level
   * each cycle; random walk steps on from where it is, pulled back towards
   * zero by a sixteenth of how far it has gone; the warbler runs the
   * firmware's second-order glide towards each new target (`LFO::warble`),
   * which needs the real phase increment and so is drawn at the rate this LFO
   * is actually set to.
   */
  function randomRun(n: N, type: string, runCycles: number, rate: number, start: number): number[] {
    const ys: number[] = []
    if (type === 'sah') {
      for (let i = 0; i <= N_POINTS; i++) ys.push(noise(Math.floor((i / N_POINTS) * runCycles + start), n) * 2 - 1)
      return ys
    }
    if (type === 'rwalk') {
      // range = 2^32/20, so one step spans at most a fortieth of the swing.
      const step = 1 / 20
      let hold = step / 2 - noise(0, n) * step
      let cyc = -1
      for (let i = 0; i <= N_POINTS; i++) {
        const c = Math.floor((i / N_POINTS) * runCycles + start)
        if (c !== cyc) {
          if (cyc >= 0) hold = Math.max(-1, Math.min(1, hold - hold / 16 + step / 2 - noise(c, n) * step))
          cyc = c
        }
        ys.push(hold)
      }
      return ys
    }
    // Warbler: phaseIncrement is doubled inside warble(), so a target arrives
    // twice per drawn cycle, and speed is zeroed at each one.
    const inc = Math.max(1, lfoPhaseIncrement(menuToStandard(rate))) * 2
    const perStep = (runCycles / N_POINTS) * (4294967296 / Math.max(1, lfoPhaseIncrement(menuToStandard(rate))))
    let hold = 0
    let speed = 0
    let target = noise(0, n) * 2 - 1
    let phase = 0
    for (let i = 0; i <= N_POINTS; i++) {
      const next = phase + (inc / 4294967296) * perStep
      if (Math.floor(next) !== Math.floor(phase)) {
        target = noise(Math.floor(next) + 1, n) * 2 - 1
        speed = 0
      }
      phase = next
      speed += perStep * (target - hold) * (inc / 4294967296 / 256)
      hold = Math.max(-1, Math.min(1, hold + speed * perStep))
      ys.push(hold)
    }
    return ys
  }

  function pathFor(n: N): string | null {
    const runCycles = cyclesFor(n)
    if (runCycles === null || !(runCycles > 0)) return null
    const s = shapeOf(n)
    const start = lfoStartPhase(s.type, scopeOf(n))
    const isRandom = s.type === 'sah' || s.type === 'rwalk' || s.type === 'warbler'
    const ys = isRandom ? randomRun(n, s.type, runCycles, s.rate, start) : null
    let d = ''
    for (let i = 0; i <= N_POINTS; i++) {
      const y = ys ? ys[i] : wave(s.type, (i / N_POINTS) * runCycles + start)
      d += `${i ? 'L' : 'M'}${((i / N_POINTS) * W).toFixed(1)} ${(MID - y * AMP).toFixed(1)} `
    }
    return d
  }

  /**
   * Every LFO the file has, the selected one last so it draws on top. A ghost
   * that would be packed too tight to read is left out instead: at a random
   * walk's thirty-two-cycle window a periodic LFO at the same rate is a solid
   * band across the graph, which hides the shape being edited and says nothing.
   */
  const GHOST_MAX_CYCLES = 24
  const curves = $derived(
    ([4, 3, 2, 1] as N[])
      .filter((n) => available.includes(n) && (n === selected || shapeOf(n).present))
      .sort((a, b) => Number(a === selected) - Number(b === selected))
      .map((n) => ({ n, cycles: cyclesFor(n), d: pathFor(n) }))
      .filter((c): c is { n: N; cycles: number; d: string } =>
        c.d !== null && c.cycles !== null && (c.n === selected || c.cycles <= GHOST_MAX_CYCLES),
      ),
  )

  /** Where one cycle ends, marked so "how long is a cycle" reads off the picture. */
  const cycleX = $derived(W / cycles)
  const hx = $derived(PAD + (sel.rate / 50) * (W - 2 * PAD))

  const timeLabel = (s: number): string => {
    if (s >= 1) return `${s >= 10 ? Math.round(s) : s.toFixed(s < 2 ? 2 : 1)} s`
    if (s >= 0.001) return `${Math.round(s * 1000)} ms`
    return `${Math.round(s * 1e6)} µs`
  }
  /**
   * Seconds when there are seconds to give, cycles when the tempo decides the
   * speed. The time labels carry their unit because it changes across the
   * range; the cycle labels only need it once, at the end.
   */
  const AXIS_AT = [0, 0.25, 0.5, 0.75, 1]
  const axis = $derived(
    synced
      ? AXIS_AT.map((f) => {
          const v = cycles * f
          return `${v % 1 === 0 ? v : v.toFixed(1)}${f === 1 ? ' cycles' : ''}`
        })
      : AXIS_AT.map((f) => (f === 0 ? '0' : timeLabel(win * f))),
  )

  const syncName = $derived(
    `${syncLevelName(sel.syncLevel)}${sel.syncType === '0' ? '' : ` ${(SYNC_TYPES.find((t) => t.value === sel.syncType)?.label ?? sel.syncType).toLowerCase()}`}`,
  )
  const caption = $derived(
    synced
      ? `1 cycle = ${syncName}`
      : `${formatLfoRate(sel.rate)} · rate ${sel.rate}`,
  )
  const ghosts = $derived(curves.filter((c) => c.n !== selected).length)

  /** Grab the handle and the rate follows it, as the filter curve's dots work. */
  let svg: SVGSVGElement | undefined = $state()
  function grab(e: PointerEvent) {
    e.preventDefault()
    const s = svg!
    s.setPointerCapture(e.pointerId)
    const at = (ev: PointerEvent) => {
      const r = s.getBoundingClientRect()
      const x = ((ev.clientX - r.left) / r.width) * W
      setParamMenu(sound, rateAttrOf(selected), Math.round(Math.max(0, Math.min(1, (x - PAD) / (W - 2 * PAD))) * 50))
    }
    const up = (ev: PointerEvent) => {
      s.releasePointerCapture(ev.pointerId)
      s.removeEventListener('pointermove', at)
      s.removeEventListener('pointerup', up)
    }
    s.addEventListener('pointermove', at)
    s.addEventListener('pointerup', up)
  }
</script>

<div class="wrap">
  <div class="graph" bind:this={box} title={synced ? 'Sync sets the speed; the Rate knob is ignored' : 'Drag the handle to set the rate'}>
    <svg bind:this={svg} viewBox="0 0 {W} {H}" height={H} data-testid="lfo-graph">
      {#each [0, 0.25, 0.5, 0.75, 1] as x (x)}<line x1={x * W} y1="0" x2={x * W} y2={PLOT} stroke="#161311" />{/each}
      <line x1="0" y1={MID} x2={W} y2={MID} stroke="#241f1a" />
      {#if cycleX < W}
        <rect x="0" y="0" width={cycleX.toFixed(1)} height={PLOT} fill="rgba(63,201,194,.05)" />
        <line x1={cycleX.toFixed(1)} y1="0" x2={cycleX.toFixed(1)} y2={PLOT} stroke={colourOf(selected)} stroke-width="1" opacity=".45" stroke-dasharray="3 3" />
      {/if}
      {#each curves as c (c.n)}
        <path d={c.d} fill="none" stroke={colourOf(c.n)} stroke-width={c.n === selected ? 1.8 : 1} opacity={c.n === selected ? 1 : 0.28} stroke-linejoin="round" />
      {/each}
      {#if !synced}
        <line x1={PAD} y1={TRACK_Y} x2={W - PAD} y2={TRACK_Y} stroke="#20262a" stroke-width="3" stroke-linecap="round" />
        <line x1={PAD} y1={TRACK_Y} x2={hx.toFixed(1)} y2={TRACK_Y} stroke={colourOf(selected)} stroke-width="3" stroke-linecap="round" opacity=".5" />
        <g class="handle" onpointerdown={grab} role="slider" aria-label="LFO {selected} rate" aria-valuemin="0" aria-valuemax="50" aria-valuenow={sel.rate} tabindex="-1">
          <!-- A transparent disc wider than the drawn one: the thing you aim at
               is bigger than the thing you see, which is the point of it. -->
          <circle cx={hx.toFixed(1)} cy={TRACK_Y} r="15" fill="rgba(0,0,0,0)" />
          <circle cx={hx.toFixed(1)} cy={TRACK_Y} r="8" fill="#0d1616" stroke={colourOf(selected)} stroke-width="2.5" />
          <circle cx={hx.toFixed(1)} cy={TRACK_Y} r="2.4" fill={colourOf(selected)} />
        </g>
      {/if}
      <text x={W - 6} y="12" text-anchor="end" font-family="ui-monospace,monospace" font-size="8.5" fill="var(--faint)">
        LFO {selected} · {LFO_TYPE_NAMES[sel.type as keyof typeof LFO_TYPE_NAMES] ?? sel.type}
      </text>
    </svg>
    <div class="gaxis axis">{#each axis as t, i (i)}<span>{t}</span>{/each}</div>
  </div>
  <div class="glegend">
    <span><i style="border-top-color:{colourOf(selected)}"></i>{scopeOf(selected) === 'global' ? 'one per sound' : 'one per voice'}</span>
    {#if random}<span>one run — this shape is random every time</span>{/if}
    {#if ghosts}<span>{ghosts} other {ghosts === 1 ? 'LFO' : 'LFOs'} behind</span>{/if}
    <span class="cap">{caption}</span>
  </div>
</div>

<style>
  .wrap { min-width: 0; }
  .cap { margin-left: auto; color: var(--muted); }
  /* Above the rate strip, not on the floor: the strip owns the bottom edge. */
  .axis { bottom: 20px; }
</style>
