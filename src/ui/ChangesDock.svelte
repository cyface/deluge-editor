<script lang="ts">
  /** The flattened diff of the current output against the loaded file: every value lost, added or changed. */
  import { editor } from './state/editor.svelte'
  const d = $derived(editor.diff)
</script>

<aside class="dock" class:open={editor.showChanges} data-testid="changes" aria-label="Changes against the loaded file">
  <div class="ph"><h2>Changes</h2><span class="sub">{editor.changeCount} against {editor.fileName || 'the file'}</span></div>
  {#if !d}
    <p class="hint">Load a preset first.</p>
  {:else if editor.changeCount === 0}
    <p class="hint" data-testid="identical">{editor.identical ? 'Output is byte-identical to the loaded file.' : 'Every value matches the loaded file; only layout differs.'}</p>
  {:else}
    {#each d.changed as c (c.path)}
      <div class="row changed" data-change={c.path}><span class="path">{c.path}</span><span class="v"><s>{c.expected}</s> → <b>{c.actual}</b></span></div>
    {/each}
    {#each d.added as p (p)}
      <div class="row added" data-change={p}><span class="path">{p}</span><span class="v">+ <b>{editor.flatOutput?.get(p)}</b></span></div>
    {/each}
    {#each d.missing as p (p)}
      <div class="row missing" data-change={p}><span class="path">{p}</span><span class="v">− <s>{editor.flatSource?.get(p)}</s></span></div>
    {/each}
  {/if}
</aside>

<style>
  .dock { position: fixed; right: var(--cheek); top: 48px; bottom: 0; width: 360px; max-width: 88vw; background: #141210; border-left: 1px solid var(--edge); padding: 12px; overflow: auto; z-index: 60; transform: translateX(102%); transition: transform .18s ease; }
  .dock.open { transform: none; box-shadow: -20px 0 44px rgba(0,0,0,.55); }
  .ph { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
  .row { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 3px; background: #1b1815; border: 1px solid var(--edge); margin-bottom: 5px; border-left-width: 3px; }
  .row.changed { border-left-color: var(--brass); }
  .row.added { border-left-color: var(--ok); }
  .row.missing { border-left-color: var(--bad); }
  .path { font-family: var(--mono); font-size: 10px; color: var(--muted); word-break: break-all; }
  .v { font-family: var(--mono); font-size: 10.5px; color: #ddd4c4; }
  .v s { color: var(--faint); }
  .v b { color: var(--brass-hi); font-weight: 500; }
</style>
