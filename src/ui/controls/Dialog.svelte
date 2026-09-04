<script lang="ts">
  /**
   * The one modal sheet: a veil over the page, a header with the title and a
   * ×, the body, and an optional footer. It owns what every dialog here used
   * to reimplement — `role="dialog"` with `aria-modal`, Escape closing *this*
   * dialog and nothing else, focus moved in on open and put back on close,
   * Tab kept inside — so the card panel, the library, the sample picker, the
   * folder import and the Follow help differ only in what they put in it.
   *
   * Escape is handled on the veil, not the window: the veil is focusable and
   * takes focus on open, so a keypress from anywhere inside the dialog reaches
   * it, and it stops there. The page's own Escape (`App.svelte`) sees only
   * keys from outside any dialog — the confirm question above everything, or
   * the randomizer strip.
   */
  import { tick, type Snippet } from 'svelte'

  interface Props {
    title: string
    onclose: () => void
    /** On the dialog element, for tests. */
    testid?: string
    /** Defaults to the title. */
    ariaLabel?: string
    /** Sheet width in px; the sheet never exceeds the viewport less a margin. */
    width?: number
    /** Extra header content between the title and the ×: a port name, a status. */
    header?: Snippet
    children: Snippet
    footer?: Snippet
    /** The × is disabled while something must not be interrupted (a card write). */
    closeDisabled?: boolean
    /** The ×'s name: "Close" for a place you work in, "Cancel" for a question. */
    closeLabel?: string
    [key: `data-${string}`]: string | undefined
  }
  let { title, onclose, testid, ariaLabel, width = 520, header, children, footer, closeDisabled = false, closeLabel = 'Close', ...rest }: Props = $props()

  let veil: HTMLDivElement | undefined = $state()

  const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

  function key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (!closeDisabled) onclose()
      return
    }
    // Tab stays inside: the page behind is inert while a modal is up.
    if (e.key === 'Tab' && veil) {
      const all = [...veil.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!all.length) return
      const first = all[0]
      const last = all[all.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || at === veil)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // Focus in on open, back where it was on close — a menu item or a button
  // that may since have gone; focusing a detached element is a no-op.
  $effect(() => {
    const before = document.activeElement as HTMLElement | null
    void tick().then(() => veil?.focus())
    return () => before?.focus?.()
  })
</script>

<div
  class="veil"
  role="dialog"
  aria-modal="true"
  aria-label={ariaLabel ?? title}
  tabindex="-1"
  data-testid={testid}
  bind:this={veil}
  onkeydown={key}
  {...rest}
>
  <aside class="sheet" style="--w: {width}px">
    <header>
      <h2>{title}</h2>
      {@render header?.()}
      <button type="button" class="x" aria-label={closeLabel} disabled={closeDisabled} onclick={onclose}>×</button>
    </header>
    <div class="body">
      {@render children()}
    </div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </aside>
</div>

<style>
  /* Above the sticky bar, the changes dock and the menus: a modal covers the
     page it is about, and the dock is part of that page. */
  .veil { position: fixed; inset: 0; z-index: var(--z-modal); display: grid; place-items: center; background: rgba(6, 5, 4, .72); outline: none; }
  .sheet {
    width: min(var(--w), calc(100vw - 40px)); max-height: min(84vh, calc(100vh - 60px));
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, #171412, #100e0d); border: 1px solid var(--edge-hi); border-radius: var(--r-l);
    box-shadow: 0 18px 50px rgba(0, 0, 0, .5); padding: 12px 14px 14px;
  }
  header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; flex: none; }
  h2 { margin: 0; font-family: var(--cond); font-size: 12.5px; font-weight: 600; letter-spacing: .13em; text-transform: uppercase; color: var(--brass); white-space: nowrap; }
  header .x { margin-left: auto; }
  /* The sheet's own text, so a header snippet can carry a port or a status. */
  header :global(.port) { flex: 1; min-width: 0; font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .body { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; padding-right: 2px; }
  .body :global(.msg) { margin: 6px 0 0; }
  .body :global(.lede) { margin: 0 0 8px; font-family: var(--cond); font-size: 11.5px; line-height: 1.45; color: var(--muted); }
  footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; flex: none; }
</style>
