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

  const items = (): HTMLButtonElement[] => [...(list?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]

  async function show(): Promise<void> {
    open = true
    await tick()
    items()[0]?.focus()
  }
  function hide(refocus = true): void {
    if (!open) return
    open = false
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

  function onListKey(e: KeyboardEvent): void {
    const all = items()
    if (!all.length) return
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => {
      e.preventDefault()
      all[(i + all.length) % all.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(all.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      hide()
    } else if (e.key === 'Tab') hide(false)
  }

  /** Choosing an item is what closes the menu; a disabled item is not a choice. */
  function onListClick(e: MouseEvent): void {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="menuitem"]')
    if (item && !item.disabled) hide()
  }

  function onWindowPointer(e: PointerEvent): void {
    if (open && root && !root.contains(e.target as Node)) hide(false)
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

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
   * kind of menu. Under the button rather than fixed, since the bar is sticky
   * and the list scrolls away with it.
   */
  .list {
    position: absolute; top: calc(100% + 5px); left: 0; z-index: 60; min-width: 196px;
    background: #1b1815; border: 1px solid var(--edge-hi); border-radius: 4px;
    box-shadow: 0 12px 34px rgba(0,0,0,.6); padding: 4px;
  }
</style>
