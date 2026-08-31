<script lang="ts">
  /**
   * Build-a-kit workflows (issue #10): drop or pick a folder of WAVs and the
   * editor takes a shot at the kit — rows in kick/snare/hats order, zones
   * from the WAV headers. Local samples can be pushed to the card at
   * SAMPLES/<folder>/ and packaged into a share zip; browsing the card's own
   * SAMPLES/ builds rows from files already on the instrument.
   */
  import { card } from './state/card.svelte'
  import { editor } from './state/editor.svelte'
  import { kit } from './state/kit.svelte'

  let folderInput: HTMLInputElement | undefined = $state()

  async function pickFolder(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (files.length === 0) return
    // webkitRelativePath is `<folder>/<sub…>/<file>`; the first segment names the folder
    const folder = files[0].webkitRelativePath.split('/')[0] || 'Kit'
    await kit.addLocalSamples(
      folder,
      files.map((file) => ({ relPath: file.webkitRelativePath.split('/').slice(1).join('/') || file.name, file })),
    )
  }

  const pushCount = $derived(kit.pushable.length)
</script>

<section class="panel" data-testid="kit-builder">
  <div class="ph">
    <h2>Build from samples</h2>
    <span class="sub">rows land kick → snare → closed hat → open hat, guessed from file names · {editor.rows.length} of 128 rows used</span>
  </div>

  <div class="ways">
    <div class="dropzone" role="note">Drop a folder of WAVs anywhere on the page</div>
    <input bind:this={folderInput} type="file" webkitdirectory hidden data-testid="folder-input" onchange={pickFolder} />
    <button type="button" class="btn" data-testid="choose-folder" title="Pick a sample folder on this computer" onclick={() => folderInput?.click()}>Choose Folder…</button>
    <button
      type="button"
      class="btn"
      data-testid="browse-card-samples"
      disabled={!card.connected}
      title={card.connected ? 'Browse SAMPLES/ on the connected Deluge' : 'Connect to the Deluge first'}
      onclick={() => kit.browseCard()}
    >From Card…</button>
    {#if pushCount > 0}
      <button
        type="button"
        class="btn"
        data-testid="push-samples"
        disabled={!card.connected || !!kit.busy}
        title={card.connected
          ? `Write ${pushCount} sample file${pushCount === 1 ? '' : 's'} to SAMPLES/${kit.folder ?? ''} on the card`
          : 'Connect to the Deluge first'}
        onclick={() => kit.pushToCard()}
      >Send {pushCount} Sample{pushCount === 1 ? '' : 's'} to Card</button>
    {/if}
  </div>

  {#if kit.cardPath !== null}
    <div class="browser" data-testid="card-sample-browser">
      <div class="pathbar">
        <button type="button" class="btn small" onclick={() => kit.cardUp()} disabled={kit.cardPath === '/SAMPLES'} aria-label="Up">↑</button>
        <span class="path">{kit.cardPath}</span>
        <button type="button" class="btn small" onclick={() => kit.closeCardBrowser()} aria-label="Close">×</button>
      </div>
      <ul class="list">
        {#each kit.cardEntries as e (e.name)}
          <li>
            {#if e.dir}
              <button type="button" onclick={() => kit.browseCard(`${kit.cardPath}/${e.name}`)}>▸ {e.name}</button>
            {:else}
              <span class:wav={/\.wav$/i.test(e.name)}>{e.name}</span>
            {/if}
          </li>
        {:else}
          <li class="none">empty</li>
        {/each}
      </ul>
      <button type="button" class="btn" data-testid="add-card-folder" disabled={!!kit.busy || !kit.cardEntries.some((e) => !e.dir && /\.wav$/i.test(e.name))} onclick={() => kit.addCardFolder()}>
        Add the WAVs in this folder
      </button>
      <p class="hint">Samples stay on the card — only their headers are read, for the zone lengths.</p>
    </div>
  {/if}

  {#if kit.busy}<p class="busy" data-testid="kit-busy">{kit.busy}… {Math.round(kit.progress * 100)}%</p>{/if}
  {#if kit.error}<p class="err" role="alert">{kit.error}</p>{/if}
  {#if kit.notice}<p class="okline" data-testid="kit-notice">{kit.notice}</p>{/if}

  <div class="h3">Share</div>
  <div class="fields">
    <div class="f"><label for="kit-author">Author</label><input id="kit-author" bind:value={kit.author} placeholder="your name" spellcheck="false" /></div>
    <div class="f"><label for="kit-license">Sample licensing</label><input id="kit-license" bind:value={kit.license} placeholder="e.g. CC0, own recordings" spellcheck="false" /></div>
    <div class="f"><label for="kit-source">Sample source</label><input id="kit-source" bind:value={kit.source} placeholder="where the samples came from" spellcheck="false" /></div>
  </div>
</section>

<style>
  .panel { margin: 10px 0 0; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge); border-radius: 4px; padding: 9px 11px 12px; }
  .ph { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 4px 4px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
  .ways { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 0 4px; }
  .dropzone {
    flex: 1; min-width: 200px; padding: 6px 10px; border: 1px dashed var(--edge-hi); border-radius: 3px;
    font-family: var(--cond); font-size: 11px; letter-spacing: .06em; color: var(--faint); text-align: center;
  }
  .browser { margin: 8px 0 0 4px; border: 1px solid var(--edge); border-radius: 3px; padding: 7px 8px; background: #0d0b0a; max-width: 440px; }
  .pathbar { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .path { flex: 1; min-width: 0; font-family: var(--mono); font-size: 11px; color: #cfe3c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { list-style: none; margin: 0 0 7px; padding: 0; max-height: 180px; overflow-y: auto; }
  .list li { border-bottom: 1px solid rgba(255,255,255,.04); }
  .list li:last-child { border-bottom: 0; }
  .list button, .list span { display: block; width: 100%; padding: 4px 6px; background: none; border: 0; color: #ddd3c2; font-family: var(--mono); font-size: 11px; text-align: left; box-sizing: border-box; }
  .list button { cursor: pointer; }
  .list button:hover { background: rgba(197,160,89,.08); }
  .list span { color: var(--faint); }
  .list span.wav { color: #ddd3c2; }
  .none { padding: 4px 6px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .busy, .okline, .err { margin: 8px 0 0 4px; font-family: var(--mono); font-size: 10.5px; }
  .busy { color: #cfe3c9; }
  .okline { color: #9ed492; }
  .err { color: #e8a08f; padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; border-radius: 3px; }
</style>
