<script lang="ts">
  /**
   * A sample oscillator's ranges as bands across the keyboard — the only view
   * in which `rangeTopNote` says what it means. Each band spans the notes its
   * range sounds (`keySpans`, inclusive at the top), a tick under the keys
   * marks each sample's root note, and the split between two bands drags.
   *
   * Dragging reports the note under the pointer and nothing more: the clamps
   * are the instrument's own and live in `setRangeTopNote`, so the map can
   * never ask for a file the Deluge would refuse.
   */
  import { noteName } from '../../core/preset/notes'
  import { keySpans, rangeIndexAt, rootParts, type SampleRange } from '../../core/preset/ranges'
  import { HIGHEST_NOTE, LOWEST_NOTE, bandLabel, bands, isBlackKey, noteAtX, noteX, octaveTicks } from '../keymap'

  interface Props {
    /** In sounding order (`soundingOrder`), which is the order the writers index by. */
    ranges: readonly SampleRange[]
    selected?: number
    /** A thumbnail: keys and bands only, no labels, splits or octave ruler. */
    compact?: boolean
    onselect?: (index: number) => void
    /** A split was dragged: the new top note for the range at `index`. */
    onmove?: (index: number, note: number) => void
  }
  let { ranges, selected = -1, compact = false, onselect, onmove }: Props = $props()

  /** Zero until the binding measures the container, which is the frame after mount. */
  let width = $state(0)
  let box = $state<HTMLElement | null>(null)

  const spans = $derived(keySpans(ranges))
  const drawn = $derived(width > 0 ? bands(spans, width) : [])
  const keys = $derived(width > 0 ? [...Array(HIGHEST_NOTE - LOWEST_NOTE + 1).keys()].map((i) => i + LOWEST_NOTE) : [])
  const ticks = $derived(width > 0 && !compact ? octaveTicks(width) : [])
  const editable = $derived(!compact && onmove !== undefined)

  const base = (path: string | undefined): string =>
    (path ?? '').split('/').pop()?.replace(/\.wav$/i, '') ?? ''
  const spanText = (low: number, high: number): string =>
    low === high ? noteName(low) : `${noteName(low)}–${noteName(high)}`

  /**
   * The splits: one per band that has a band above it. A split belongs to the
   * range below it — the one whose `rangeTopNote` it is.
   */
  const splits = $derived(
    editable
      ? drawn.slice(0, -1).map((b) => ({ index: b.index, note: b.high, x: b.x + b.width }))
      : [],
  )

  const noteFromEvent = (e: PointerEvent): number =>
    noteAtX(e.clientX - (box?.getBoundingClientRect().left ?? 0), width)

  function grab(e: PointerEvent, index: number) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onselect?.(index)
    e.preventDefault()
  }
  function drag(e: PointerEvent, index: number) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    onmove?.(index, noteFromEvent(e))
  }
  function nudge(e: KeyboardEvent, index: number, note: number) {
    const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 }[e.key]
    if (by === undefined) return
    e.preventDefault()
    onmove?.(index, note + by)
  }
</script>

<div
  class="keymap"
  class:compact
  bind:this={box}
  bind:clientWidth={width}
  data-testid={compact ? 'key-map-mini' : 'key-map'}
>
  <div class="bands" style="--h: {compact ? 14 : 26}px">
    {#each drawn as b (b.index)}
      {@const label = compact ? null : bandLabel(b.width, base(ranges[b.index]?.fileName), spanText(b.low, b.high))}
      <button
        type="button"
        class="band"
        class:on={b.index === selected}
        class:alt={b.index % 2 === 1}
        style="left: {b.x}px; width: {b.width}px"
        data-band={b.index}
        title="{spanText(b.low, b.high)} · {ranges[b.index]?.fileName ?? '(no file)'}"
        onclick={() => onselect?.(b.index)}
      >{#if label}<span>{label}</span>{/if}</button>
    {/each}
    {#each splits as s (s.index)}
      <div
        class="split"
        style="left: {s.x}px"
        role="slider"
        tabindex="0"
        data-split={s.index}
        aria-label="Top note of range {s.index + 1}"
        aria-valuemin={LOWEST_NOTE}
        aria-valuemax={HIGHEST_NOTE}
        aria-valuenow={s.note}
        aria-valuetext={noteName(s.note)}
        title="Split at {noteName(s.note)} — drag or use the arrow keys"
        onpointerdown={(e) => grab(e, s.index)}
        onpointermove={(e) => drag(e, s.index)}
        onkeydown={(e) => nudge(e, s.index, s.note)}
      ></div>
    {/each}
  </div>
  <div class="keys" style="--h: {compact ? 9 : 15}px">
    {#each keys as n (n)}
      <button
        type="button"
        class="key"
        class:black={isBlackKey(n)}
        style="left: {noteX(n, width)}px; width: {noteX(n + 1, width) - noteX(n, width)}px"
        tabindex="-1"
        aria-label={noteName(n)}
        title={noteName(n)}
        onclick={() => onselect?.(rangeIndexAt(ranges, n))}
      ></button>
    {/each}
    {#each ranges as r, i (i)}
      {@const root = rootParts(r.rootCents).note}
      {#if root >= LOWEST_NOTE && root <= HIGHEST_NOTE}
        <i
          class="root"
          class:on={i === selected}
          style="left: {noteX(root + 0.5, width)}px"
          title="Root note of {r.fileName ?? 'this range'}: {noteName(root)}"
        ></i>
      {/if}
    {/each}
  </div>
  {#if ticks.length}
    <div class="ruler">
      {#each ticks as n (n)}<span style="left: {noteX(n, width)}px">{noteName(n)}</span>{/each}
    </div>
  {/if}
</div>

<style>
  .keymap { position: relative; margin: 8px 0 0 4px; user-select: none; touch-action: none; }
  .bands { position: relative; height: var(--h); }
  .band {
    position: absolute; top: 0; height: 100%; padding: 0 4px; margin: 0; cursor: pointer; overflow: hidden;
    background: #221d18; border: 1px solid var(--edge-hi); border-radius: 2px;
    font-family: var(--mono); font-size: 9.5px; color: var(--muted); text-align: left; white-space: nowrap;
  }
  .band.alt { background: #1a1714; }
  .band:hover { border-color: var(--brass-dim); color: var(--brass-hi); }
  .band.on { background: linear-gradient(180deg, #3d2f15, #251c0e); border-color: var(--brass); color: var(--brass-hi); z-index: 1; }
  .compact .band { border-radius: 1px; }
  /* The split straddles the boundary: a hairline to look at, 9px to grab. */
  .split { position: absolute; top: -2px; bottom: -2px; width: 9px; margin-left: -4.5px; cursor: ew-resize; z-index: 2; }
  .split::before { content: ""; position: absolute; left: 4px; top: 0; bottom: 0; width: 1px; background: var(--brass); }
  .split:hover::before, .split:focus-visible::before { width: 3px; left: 3px; background: var(--brass-hi); }
  .keys { position: relative; height: var(--h); margin-top: 2px; }
  .key { position: absolute; top: 0; height: 100%; padding: 0; margin: 0; border: 0; border-right: 1px solid #0b0a09; background: #2f2a24; cursor: pointer; }
  .key.black { background: #14120f; height: 62%; }
  .key:hover { background: var(--brass-dim); }
  .root { position: absolute; top: -1px; width: 0; height: 0; margin-left: -3px; border-left: 3px solid transparent; border-right: 3px solid transparent; border-top: 4px solid var(--brass-dim); }
  .root.on { border-top-color: var(--brass-hi); }
  .ruler { position: relative; height: 11px; }
  .ruler span { position: absolute; top: 0; font-family: var(--mono); font-size: 8px; color: #4a443c; transform: translateX(1px); }
</style>
