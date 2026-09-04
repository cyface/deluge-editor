<script lang="ts">
  /**
   * A folder on the card: the path bar with its Up button, and the listing.
   * Folders open; files are a choice (`onPick`), or inert text when the
   * browser is only there to pick a folder. The store that lists the card is
   * the caller's — this renders what it is handed and reports clicks — so the
   * card panel, the sample picker, the folder import, the kit builder and the
   * library's move picker all read the same way.
   */
  import type { Snippet } from 'svelte'
  import { UI_HELP } from '../help'

  export interface BrowserEntry { name: string; dir: boolean; size?: number }

  interface Props {
    path: string
    /** Up is disabled here. */
    root?: string
    entries: readonly BrowserEntry[]
    /** Every control is disabled while the card is busy. */
    busy?: boolean
    onUp: () => void
    /** A folder was clicked. */
    onOpen: (name: string) => void
    /** A file was clicked; without it, files are text. */
    onPick?: (name: string) => void
    onPickDouble?: (name: string) => void
    /** Which files are choices (or, without `onPick`, which read as the ones that matter); the rest are dimmed. */
    pickable?: (name: string) => boolean
    /** A folder that cannot be opened here — the one being moved, say. */
    disabledEntry?: (name: string) => boolean
    /** The picked (or armed) file's name. */
    selected?: string | null
    pathTestid?: string
    testid?: string
    /** In a box of its own, for a browser inside a dialog or panel body. */
    boxed?: boolean
    /** The listing's scroll height; unset, it fills what the sheet allows. */
    listHeight?: string
    emptyText?: string
    /** Path bar content before Up. */
    before?: Snippet
    /** Path bar content after the path: a refresh, a New folder, a ×. */
    actions?: Snippet
    /** Inside each entry after its name: a size, a warning. */
    trailing?: Snippet<[BrowserEntry]>
    /** Under the listing: the take buttons, a hint. */
    children?: Snippet
  }
  let {
    path, root = '/', entries, busy = false, onUp, onOpen, onPick, onPickDouble, pickable, disabledEntry, selected = null,
    pathTestid, testid, boxed = false, listHeight, emptyText = '(empty)', before, actions, trailing, children,
  }: Props = $props()

  const picks = (name: string): boolean => onPick !== undefined && (pickable?.(name) ?? true)
</script>

<div class="browser" class:boxed data-testid={testid}>
  <div class="pathbar">
    {@render before?.()}
    <button type="button" class="btn small" onclick={onUp} disabled={path === root || busy} title={UI_HELP['ui.browser.up']} aria-label="Up">↑</button>
    <span class="path" data-testid={pathTestid}>{path}</span>
    {@render actions?.()}
  </div>
  <ul class="list" style:max-height={listHeight}>
    {#each entries as e (e.name)}
      <li>
        {#if e.dir}
          <button type="button" class="entry" data-entry={e.name} disabled={busy || disabledEntry?.(e.name)} onclick={() => onOpen(e.name)}>
            <span class="n">▸ {e.name}</span>
            {@render trailing?.(e)}
          </button>
        {:else if picks(e.name)}
          <button
            type="button"
            class="entry"
            class:selected={selected === e.name}
            aria-pressed={selected === e.name}
            data-entry={e.name}
            disabled={busy}
            onclick={() => onPick?.(e.name)}
            ondblclick={() => onPickDouble?.(e.name)}
          >
            <span class="n">{e.name}</span>
            {@render trailing?.(e)}
          </button>
        {:else}
          <span class="entry inert" class:dim={onPick !== undefined || !(pickable?.(e.name) ?? true)} data-entry={e.name}>
            <span class="n">{e.name}</span>
            {@render trailing?.(e)}
          </span>
        {/if}
      </li>
    {:else}
      <li class="none">{emptyText}</li>
    {/each}
  </ul>
  {@render children?.()}
</div>

<style>
  .browser { display: flex; flex-direction: column; min-height: 0; }
  .boxed { border: 1px solid var(--edge); border-radius: var(--r-s); padding: 7px 8px; background: var(--well); }
  .list { list-style: none; margin: 0 0 7px; padding: 0; overflow-y: auto; min-height: 40px; }
  .browser:not(.boxed) .list { border: 1px solid var(--edge); border-radius: var(--r-s); background: var(--well); flex: 1; }
  .list li { border-bottom: 1px solid rgba(255, 255, 255, .04); }
  .list li:last-child { border-bottom: 0; }
  .entry {
    display: flex; width: 100%; align-items: baseline; gap: 8px; padding: 4px 6px; box-sizing: border-box;
    background: none; border: 0; color: var(--text-list); font-family: var(--mono); font-size: 11px; text-align: left;
  }
  button.entry { cursor: pointer; }
  button.entry:hover:not(:disabled) { background: rgba(197, 160, 89, .08); }
  button.entry:disabled { opacity: .4; cursor: default; }
  .entry.selected { background: rgba(197, 160, 89, .16); color: var(--brass-hi); box-shadow: inset 2px 0 0 var(--brass); }
  .entry.dim { color: var(--faint); }
  .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { padding: 5px 6px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
</style>
