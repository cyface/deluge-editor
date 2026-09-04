/**
 * Roving focus for a `role="menu"` list, shared by the top bar's menus and
 * the cable picker: the arrows move between the enabled items, Home and End
 * jump, and the caller decides what Escape and Tab do.
 */

/** The enabled menu items in `list`, in order. */
export function menuItems(list: Element | undefined | null): HTMLButtonElement[] {
  return [...(list?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
}

/**
 * Handle one keydown inside a menu list. Arrow, Home and End keys move focus
 * (wrapping) and are consumed; Escape calls `onEscape` and is consumed; Tab
 * calls `onTab` and is left to the browser, so focus leaves the menu.
 */
export function menuListKey(e: KeyboardEvent, list: Element | undefined | null, on: { onEscape: () => void; onTab?: () => void }): void {
  const all = menuItems(list)
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
    // Consumed here: the page's own Escape (`App.svelte`) must not also fire.
    e.preventDefault()
    e.stopPropagation()
    on.onEscape()
  } else if (e.key === 'Tab') on.onTab?.()
}
