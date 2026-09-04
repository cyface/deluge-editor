<script lang="ts">
  /**
   * "Where are the samples?" — the whole of the multi-sample import's own UI
   * (issue #33). One question, then a folder, and what comes back is ranges on
   * the oscillator and the range editor open on them. Everything after that is
   * range editing, in the one panel, so this asks and gets out of the way.
   */
  import { card } from './state/card.svelte'
  import { multisample as ms } from './state/multisample.svelte'

  let folderInput: HTMLInputElement | undefined = $state()

  async function pickFolder(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (files.length === 0) return
    // webkitRelativePath is `<folder>/<sub…>/<file>`; the first segment names the folder
    const folder = files[0].webkitRelativePath.split('/')[0] || 'Samples'
    await ms.addLocalFolder(
      folder,
      files.map((file) => ({ relPath: file.webkitRelativePath.split('/').slice(1).join('/') || file.name, file })),
    )
  }

  const label = $derived(ms.asking === 2 ? 'B' : 'A')
  const hasWavs = $derived(ms.cardEntries.some((e) => !e.dir && /\.wav$/i.test(e.name)))
</script>

<div class="veil" role="dialog" aria-modal="true" aria-label="Build a multi-sample instrument" data-testid="folder-import">
  <div class="ask">
    <div class="ph">
      <h2>Build Osc {label} from a folder</h2>
      <button type="button" class="x" aria-label="Cancel" onclick={() => ms.cancel()}>×</button>
    </div>
    <p class="lede">
      Every WAV in the folder becomes a key range: the root notes come from what the files declare, then from their
      names, and anything that can't be placed is listed rather than dropped.
    </p>

    <input bind:this={folderInput} type="file" webkitdirectory hidden data-testid="ms-folder-input" onchange={pickFolder} />
    <div class="ways">
      <button type="button" class="btn go" data-testid="ms-source-local" disabled={!!ms.busy} onclick={() => folderInput?.click()}>
        On This Computer…
      </button>
      <button
        type="button"
        class="btn"
        data-testid="ms-source-card"
        disabled={!card.supported || !!ms.busy}
        title={card.supported ? 'Browse SAMPLES/ on the Deluge (connects first if needed)' : 'Web MIDI needs Chrome or Edge'}
        onclick={() => ms.browseCard()}
      >On the Deluge…</button>
      <button type="button" class="btn" data-testid="ms-cancel" onclick={() => ms.cancel()}>Cancel</button>
    </div>

    {#if ms.cardPath !== null}
      <div class="browser" data-testid="ms-card-browser">
        <div class="pathbar">
          <button type="button" class="btn small" onclick={() => ms.cardUp()} disabled={ms.cardPath === '/SAMPLES'} aria-label="Up">↑</button>
          <span class="path">{ms.cardPath}</span>
        </div>
        <ul class="list">
          {#each ms.cardEntries as e (e.name)}
            <li>
              {#if e.dir}
                <button type="button" onclick={() => ms.browseCard(`${ms.cardPath}/${e.name}`)}>▸ {e.name}</button>
              {:else}
                <span class:wav={/\.wav$/i.test(e.name)}>{e.name}</span>
              {/if}
            </li>
          {:else}
            <li class="none">empty</li>
          {/each}
        </ul>
        <button type="button" class="btn go" data-testid="ms-take-card-folder" disabled={!!ms.busy || !hasWavs} onclick={() => ms.addCardFolder()}>
          Use This Folder
        </button>
        <p class="hint">Samples stay on the card — only their headers are read, for the roots and zones.</p>
      </div>
    {/if}

    {#if ms.busy}<p class="busy" data-testid="ms-busy">{ms.busy}… {Math.round(ms.progress * 100)}%</p>{/if}
    {#if ms.error}<p class="err" role="alert" data-testid="ms-error">{ms.error}</p>{/if}
  </div>
</div>

<style>
  .veil { position: fixed; inset: 0; z-index: var(--z-modal); display: grid; place-items: center; background: rgba(6,5,4,.72); }
  .ask {
    width: min(560px, calc(100vw - 40px)); background: linear-gradient(180deg, var(--panel2), var(--panel));
    border: 1px solid var(--edge-hi); border-radius: 5px; padding: 12px 14px 14px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
  }
  .ph { display: flex; align-items: baseline; gap: 8px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
  .ph .x { margin-left: auto; background: none; border: 0; color: var(--faint); font-size: 15px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .ph .x:hover { color: var(--brass-hi); }
  .lede { margin: 7px 0 0; font-family: var(--cond); font-size: 11.5px; line-height: 1.45; color: var(--muted); }
  .ways { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px; }
  .browser { margin-top: 10px; border: 1px solid var(--edge); border-radius: 3px; padding: 7px 8px; background: #0d0b0a; }
  .pathbar { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .path { flex: 1; min-width: 0; font-family: var(--mono); font-size: 11px; color: #cfe3c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { list-style: none; margin: 0 0 7px; padding: 0; max-height: 190px; overflow-y: auto; }
  .list li { border-bottom: 1px solid rgba(255,255,255,.04); }
  .list li:last-child { border-bottom: 0; }
  .list button, .list span { display: block; width: 100%; padding: 4px 6px; background: none; border: 0; color: #ddd3c2; font-family: var(--mono); font-size: 11px; text-align: left; box-sizing: border-box; }
  .list button { cursor: pointer; }
  .list button:hover { background: rgba(197,160,89,.08); }
  .list span { color: var(--faint); }
  .list span.wav { color: #ddd3c2; }
  .none { padding: 4px 6px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .hint { margin: 6px 0 0; font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .busy { margin: 9px 0 0; font-family: var(--mono); font-size: 10.5px; color: #cfe3c9; }
  .err { margin: 9px 0 0; padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; color: #e8a08f; font-family: var(--mono); font-size: 10.5px; border-radius: 3px; }
</style>
