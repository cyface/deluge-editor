<script lang="ts">
  /**
   * The flattened diff of the current output against the loaded file, worded
   * the way the controls are: "Env 1 Attack: 21 → 34". The raw path and
   * values stay in the row's tooltip. Each row's × puts that one value back
   * the way the file had it. An element that is new or gone in its entirety
   * — a kit row built from a sample, say — collapses to a single entry
   * instead of one line per value (`src/core/xml/group.ts`).
   */
  import { describeChangePath, describeChangeValue, describeElementPath } from '../core/preset'
  import { editor } from './state/editor.svelte'
  const d = $derived(editor.grouped)
  const label = (path: string) => describeChangePath(path, editor.flatOutput, editor.flatSource)
  const elabel = (prefix: string) => describeElementPath(prefix, editor.flatOutput, editor.flatSource)
  /** A group shows its element's own name when it has one — a kit row's, usually. */
  const nameOf = (prefix: string) => editor.flatOutput?.get(`${prefix}@name`) ?? editor.flatSource?.get(`${prefix}@name`)
  const val = describeChangeValue
</script>

<aside class="dock" class:open={editor.showChanges} data-testid="changes" aria-label="Changes against the loaded file">
  <div class="ph"><h2>Changes</h2><span class="sub">{editor.changeCount} against {editor.fileName || 'the file'}</span></div>
  {#if !d}
    <p class="hint">Load a preset first.</p>
  {:else if editor.changeCount === 0}
    <p class="hint" data-testid="identical">{editor.identical ? 'Output is byte-identical to the loaded file.' : 'Every value matches the loaded file; only layout differs.'}</p>
  {:else}
    {#each d.changed as c (c.path)}
      <div class="row changed" data-change={c.path} title="{c.path}&#10;{c.expected} → {c.actual}">
        <div class="what">
          <span class="lbl">{label(c.path)}</span>
          <span class="v"><s>{val(c.path, c.expected)}</s> → <b>{val(c.path, c.actual)}</b></span>
        </div>
        <button type="button" class="x" title="Revert to the file's value" aria-label="Revert {label(c.path)}" onclick={() => editor.revert(c.path)}>×</button>
      </div>
    {/each}
    {#each d.addedGroups as g (g.prefix)}
      <div class="row added" data-change={g.prefix} title="{g.prefix}&#10;+ {g.paths.length} values">
        <div class="what">
          <span class="lbl">{elabel(g.prefix)}</span>
          <span class="v">+ {#if nameOf(g.prefix)}<b>{nameOf(g.prefix)}</b> {/if}<em>added · {g.paths.length} values</em></span>
        </div>
        <button type="button" class="x" title="Remove it again, as the file had it" aria-label="Remove {elabel(g.prefix)}" onclick={() => editor.revertGroup(g.prefix, 'added')}>×</button>
      </div>
    {/each}
    {#each d.added as p (p)}
      <div class="row added" data-change={p} title="{p}&#10;+ {editor.flatOutput?.get(p)}">
        <div class="what">
          <span class="lbl">{label(p)}</span>
          <span class="v">+ <b>{val(p, editor.flatOutput?.get(p) ?? '')}</b> <em>added</em></span>
        </div>
        <button type="button" class="x" title="Remove again, as the file had it" aria-label="Revert {label(p)}" onclick={() => editor.revert(p)}>×</button>
      </div>
    {/each}
    {#each d.missingGroups as g (g.prefix)}
      <div class="row missing" data-change={g.prefix} title="{g.prefix}&#10;− {g.paths.length} values">
        <div class="what">
          <span class="lbl">{elabel(g.prefix)}</span>
          <span class="v">− {#if nameOf(g.prefix)}<s>{nameOf(g.prefix)}</s> {/if}<em>removed · {g.paths.length} values</em></span>
        </div>
        {#if editor.canRestoreGroup(g.prefix)}
          <button type="button" class="x" title="Restore the file's element" aria-label="Restore {elabel(g.prefix)}" onclick={() => editor.revertGroup(g.prefix, 'missing')}>×</button>
        {/if}
      </div>
    {/each}
    {#each d.missing as p (p)}
      <div class="row missing" data-change={p} title="{p}&#10;− {editor.flatSource?.get(p)}">
        <div class="what">
          <span class="lbl">{label(p)}</span>
          <span class="v">− <s>{val(p, editor.flatSource?.get(p) ?? '')}</s> <em>removed</em></span>
        </div>
        <button type="button" class="x" title="Restore the file's value" aria-label="Revert {label(p)}" onclick={() => editor.revert(p)}>×</button>
      </div>
    {/each}
  {/if}
</aside>

<style>
  .dock { position: fixed; right: var(--cheek); top: 48px; bottom: 0; width: 360px; max-width: 88vw; background: #141210; border-left: 1px solid var(--edge); padding: 12px; overflow: auto; z-index: 60; transform: translateX(102%); transition: transform .18s ease; }
  .dock.open { transform: none; box-shadow: -20px 0 44px rgba(0,0,0,.55); }
  .ph { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
  .row { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 8px; border-radius: 3px; background: #1b1815; border: 1px solid var(--edge); margin-bottom: 5px; border-left-width: 3px; }
  .row.changed { border-left-color: var(--brass); }
  .row.added { border-left-color: var(--ok); }
  .row.missing { border-left-color: var(--bad); }
  .what { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .lbl { font-family: var(--cond); font-size: 12px; font-weight: 600; letter-spacing: .05em; color: #ddd4c4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .v { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .v s { color: var(--faint); }
  .v b { color: var(--brass-hi); font-weight: 500; }
  .v em { font-style: normal; font-family: var(--cond); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); margin-left: 3px; }
  .x { flex: none; width: 20px; height: 20px; border-radius: 3px; border: 1px solid var(--edge-hi); background: transparent; color: var(--muted); font-size: 13px; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
  .x:hover { border-color: var(--bad); color: var(--bad); }
</style>
