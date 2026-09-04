<script lang="ts">
  /**
   * Build-a-kit workflows (issue #10): drop or pick a folder of WAVs and the
   * editor takes a shot at the kit — rows in kick/snare/hats order, zones
   * from the WAV headers. Local samples can be pushed to the card at
   * SAMPLES/<folder>/ and packaged into a share zip; browsing the card's own
   * SAMPLES/ builds rows from files already on the instrument.
   */
  import CardBrowser from './controls/CardBrowser.svelte'
  import Panel from './controls/Panel.svelte'
  import Status from './controls/Status.svelte'
  import { pickedFolder, takeFiles } from './filepick'
  import { card } from './state/card.svelte'
  import { editor } from './state/editor.svelte'
  import { kit } from './state/kit.svelte'
  import { samples } from './state/samples.svelte'

  let folderInput: HTMLInputElement | undefined = $state()
  const isWav = (name: string) => /\.wav$/i.test(name)

  async function pickFolder(e: Event) {
    const picked = pickedFolder(takeFiles(e), 'Kit')
    if (picked) await kit.addLocalSamples(picked.folder, picked.files)
  }

  const pushCount = $derived(samples.pushable.length)
</script>

<Panel title="Build from samples" sub="rows land kick → snare → closed hat → open hat, guessed from file names · {editor.rows.length} of 128 rows used" flow testid="kit-builder">
  <div class="ways">
    <div class="dropzone" role="note">Drop a folder of WAVs anywhere on the page</div>
    <input bind:this={folderInput} type="file" webkitdirectory hidden data-testid="folder-input" onchange={pickFolder} />
    <button type="button" class="btn" data-testid="choose-folder" title="Pick a sample folder on this computer" onclick={() => folderInput?.click()}>Choose Folder…</button>
    <button
      type="button"
      class="btn"
      data-testid="browse-card-samples"
      disabled={!card.supported || !!kit.busy}
      title={card.supported
        ? 'Browse SAMPLES/ on the Deluge (connects first if needed)'
        : 'Web MIDI needs Chrome or Edge'}
      onclick={() => kit.browseCard()}
    >From Deluge…</button>
    {#if pushCount > 0}
      <button
        type="button"
        class="btn"
        data-testid="push-samples"
        disabled={!card.supported || !!kit.busy}
        title={card.supported
          ? `Write ${pushCount} sample file${pushCount === 1 ? '' : 's'} to SAMPLES/${samples.folder ?? ''} on the card (connects first if needed)`
          : 'Web MIDI needs Chrome or Edge'}
        onclick={() => kit.pushToCard()}
      >Send {pushCount} Sample{pushCount === 1 ? '' : 's'} to Card</button>
    {/if}
  </div>

  {#if kit.cardPath !== null}
    <div class="browse">
      <CardBrowser
        path={kit.cardPath}
        root="/SAMPLES"
        entries={kit.cardEntries}
        busy={!!kit.busy}
        pickable={isWav}
        testid="card-sample-browser"
        boxed
        listHeight="180px"
        onUp={() => kit.cardUp()}
        onOpen={(name) => kit.browseCard(`${kit.cardPath}/${name}`)}
      >
        {#snippet actions()}
          <button type="button" class="btn small" onclick={() => kit.closeCardBrowser()} aria-label="Close">×</button>
        {/snippet}
        <button type="button" class="btn" data-testid="add-card-folder" disabled={!!kit.busy || !kit.cardEntries.some((e) => !e.dir && isWav(e.name))} onclick={() => kit.addCardFolder()}>
          Add the WAVs in this folder
        </button>
        <p class="hint">Samples stay on the Deluge.</p>
      </CardBrowser>
    </div>
  {/if}

  {#if card.otherEditor}
    <!-- A second editor on the same Deluge (issue #8): a sample push runs for
         as long as the files are big, and the other one can truncate any of
         them mid-flight. Shown here too — a push from this panel does not
         need the card panel open. -->
    <Status kind="caution" testid="kit-other-editor">
      Another editor is talking to this Deluge. Samples written from both overwrite each other — last one wins.
    </Status>
  {/if}
  {#if kit.busy}<Status kind="busy" testid="kit-busy">{kit.busy}… {Math.round(kit.progress * 100)}%</Status>{/if}
  {#if kit.error}<Status kind="err">{kit.error}</Status>{/if}
  {#if kit.notice}<Status kind="ok" testid="kit-notice">{kit.notice}</Status>{/if}

  <div class="h3">Share</div>
  <div class="fields">
    <div class="f"><label for="kit-author">Author</label><input id="kit-author" bind:value={kit.author} placeholder="your name" spellcheck="false" /></div>
    <div class="f"><label for="kit-license">Sample licensing</label><input id="kit-license" bind:value={kit.license} placeholder="e.g. CC0, own recordings" spellcheck="false" /></div>
    <div class="f"><label for="kit-source">Sample source</label><input id="kit-source" bind:value={kit.source} placeholder="where the samples came from" spellcheck="false" /></div>
  </div>
</Panel>

<style>
  .ways { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 0 4px; }
  .dropzone {
    flex: 1; min-width: 200px; padding: 6px 10px; border: 1px dashed var(--edge-hi); border-radius: var(--r-s);
    font-family: var(--cond); font-size: 11px; letter-spacing: .06em; color: var(--faint); text-align: center;
  }
  .browse { margin: 8px 0 0 4px; max-width: 440px; }
  .hint { margin: 6px 0 0; font-family: var(--cond); font-size: 11px; color: var(--faint); }
</style>
