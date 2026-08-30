<script lang="ts">
  /** Nothing loaded: open a file, drop one, or try a Deluge-authored fixture. */
  import { editor } from './state/editor.svelte'
  const examples = import.meta.glob<string>('../../tests/fixtures/**/*.XML', { query: '?raw', import: 'default' })
  const names = Object.keys(examples).sort()
  const label = (k: string) => k.replace(/^.*fixtures\//, '').replace(/\.XML$/, '')
  async function open(k: string) {
    editor.load(await examples[k](), k.split('/').pop() ?? k)
  }
</script>

<div class="empty">
  <p class="lead">Open a Deluge <b>SYNTHS/</b> or <b>KITS/</b> preset, or drop one anywhere on the page.</p>
  <p class="hint">The whole preset is shown at once. The flow strip is the table of contents: click a block to focus it, shift-click to pin several, click the strip's background to expand everything. Everything the editor doesn't show is kept and written back unchanged.</p>
  <div class="h3">Try a fixture <span class="sub">files the Deluge wrote</span></div>
  <div class="list">
    {#each names as k (k)}
      <button type="button" class="btn small" data-example={label(k)} onclick={() => open(k)}>{label(k)}</button>
    {/each}
  </div>
</div>

<style>
  .empty { margin: 24px auto 0; max-width: 720px; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge); border-radius: 4px; padding: 18px 20px 20px; }
  .lead { font-family: var(--cond); font-size: 18px; letter-spacing: .03em; color: #e9e2d6; margin: 0; }
  .lead b { color: var(--brass); }
  .list { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0 4px; }
</style>
