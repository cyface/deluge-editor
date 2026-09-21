<script lang="ts">
  /**
   * A dropdown of commands under one verb — New, Open, Save — for the top bar
   * (issue #37). It is a menu button in the WAI-ARIA sense and nothing more:
   * click or Enter/Space opens it and focus lands on the first item, the
   * arrows move between items, Escape or a click outside closes it and puts
   * focus back on the button, and choosing an item closes it. Items are
   * `MenuItem`s rendered by the caller, so the menu knows nothing about what
   * they do.
   */
  import { tick, type Snippet } from 'svelte'
  import { menuItems, menuListKey } from '../menukeys'

  interface Props {
    label: string
    /** Test id of the button; the list is `${testid}-list`. */
    testid: string
    title?: string
    children: Snippet
  }
  let { label, testid, title, children }: Props = $props()

  let open = $state(false)
  let root: HTMLDivElement | undefined = $state()
  let button: HTMLButtonElement | undefined = $state()
  let list: HTMLDivElement | undefined = $state()
  /** Where the open list sits, in viewport pixels (see `.list`). */
  let at = $state<{ top: number; left: number } | null>(null)

  async function show(): Promise<void> {
    open = true
    await tick()
    place()
    menuItems(list)[0]?.focus({ preventScroll: true })
  }

  /** Under the button, kept inside the window: a button near the right edge of a phone would push the list off it. */
  function place(): void {
    if (!open || !button || !list) return
    const r = button.getBoundingClientRect()
    at = { top: r.bottom + 5, left: Math.max(8, Math.min(r.left, window.innerWidth - list.offsetWidth - 8)) }
  }
  function hide(refocus = true): void {
    if (!open) return
    open = false
    at = null
    if (refocus) button?.focus()
  }

  function onButtonKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      void show()
    }
    // Focus stays on the button when every item is disabled (Save with
    // nothing loaded), so Escape has to work from here too.
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      hide()
    }
  }

  const onListKey = (e: KeyboardEvent): void => menuListKey(e, list, { onEscape: () => hide(), onTab: () => hide(false) })

  /** Choosing an item is what closes the menu; a disabled item is not a choice. */
  function onListClick(e: MouseEvent): void {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="menuitem"]')
    if (item && !item.disabled) hide()
  }

  function onWindowPointer(e: PointerEvent): void {
    if (open && root && !root.contains(e.target as Node)) hide(false)
  }
</script>

<!-- Scroll does not bubble, so the capture phase is what hears the bar's own row scrolling. -->
<svelte:window onpointerdown={onWindowPointer} onscrollcapture={place} onresize={place} />

<div class="wrap" bind:this={root}>
  <button
    type="button"
    class="btn"
    class:on={open}
    bind:this={button}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="{testid}-list"
    data-testid={testid}
    {title}
    onclick={() => (open ? hide() : void show())}
    onkeydown={onButtonKey}
  >{label}<span class="caret" aria-hidden="true">▾</span></button>
  {#if open}
    <div
      class="list"
      role="menu"
      tabindex="-1"
      id="{testid}-list"
      aria-label={label}
      data-testid="{testid}-list"
      style:top={at ? `${at.top}px` : null}
      style:left={at ? `${at.left}px` : null}
      bind:this={list}
      onkeydown={onListKey}
      onclick={onListClick}
    >
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; flex: none; }
  .caret { margin-left: 6px; font-size: 10px; opacity: .7; }
  /*
   * The same face as the cable picker (`CablePicker.svelte`): the app has one
   * kind of menu. Fixed, and placed under its button by `place`, because on a
   * phone the bar's second row scrolls sideways (issue #45), and a scrolling
   * row clips anything absolutely positioned inside it. The bar is sticky,
   * so the button only moves when that row scrolls or the window resizes,
   * and both re-place the list.
   */
  .list {
    position: fixed; z-index: 60; min-width: 196px;
    background: var(--raised-hi); border: 1px solid var(--edge-hi); border-radius: 4px;
    box-shadow: 0 12px 34px rgba(0,0,0,.6); padding: 4px;
  }
</style>
