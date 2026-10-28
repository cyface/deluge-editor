<script lang="ts">
  /**
   * Where a kit's samples come from (issue #10): a folder of WAVs from this
   * computer — picked or dropped on the page — or a folder already in the
   * card's SAMPLES/. The same controls in the builder panel on a new kit and
   * in the Add samples dialog after.
   */
  import CardBrowser from './controls/CardBrowser.svelte'
  import KitStatus from './KitStatus.svelte'
  import { browseSamplesTip } from './copy'
  import { pickedFolder, takeFiles } from './filepick'
  import { UI_HELP } from './help'
  import { card } from './state/card.svelte'
  import { kit } from './state/kit.svelte'
  import { isWav } from './state/wavfiles'

  let folderInput: HTMLInputElement | undefined = $state()

  async function pickFolder(e: Event) {
    const picked = pickedFolder(takeFiles(e), 'Kit')
    if (picked) await kit.addLocalSamples(picked.folder, picked.files)
  }
</script>

<div class="ways">
  <div class="dropzone" role="note">Drop a folder of WAVs anywhere on the page</div>
  <input bind:this={folderInput} type="file" webkitdirectory hidden data-testid="folder-input" onchange={pickFolder} />
  <button type="button" class="btn" data-testid="choose-folder" title={UI_HELP['ui.kit.chooseFolder']} disabled={!!kit.busy} onclick={() => folderInput?.click()}>Choose folder…</button>
  <button
    type="button"
    class="btn"
    data-testid="browse-card-samples"
    disabled={!card.supported || !!kit.busy}
    title={browseSamplesTip(card.supported)}
    onclick={() => kit.browser.open()}
  >From Deluge…</button>
</div>

{#if kit.browser.path !== null}
  <div class="browse">
    <CardBrowser
      path={kit.browser.path}
      root="/SAMPLES"
      entries={kit.browser.entries}
      busy={!!kit.busy}
      pickable={isWav}
      testid="card-sample-browser"
      boxed
      listHeight="180px"
      onUp={() => kit.browser.up()}
      onOpen={(name) => kit.browser.enter(name)}
    >
      {#snippet actions()}
        <button type="button" class="btn small" onclick={() => kit.browser.close()} aria-label="Close">×</button>
      {/snippet}
      <button type="button" class="btn" data-testid="add-card-folder" disabled={!!kit.busy || !kit.browser.hasWavs} onclick={() => kit.addCardFolder()}>
        Add the WAVs in this folder
      </button>
      <p class="hint">Samples stay on the Deluge.</p>
    </CardBrowser>
  </div>
{/if}

<KitStatus />

<style>
  .ways { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 0 4px; }
  .dropzone {
    flex: 1; min-width: 200px; padding: 6px 10px; border: 1px dashed var(--edge-hi); border-radius: var(--r-s);
    font-family: var(--cond); font-size: 11px; letter-spacing: .06em; color: var(--faint); text-align: center;
  }
  .browse { margin: 8px 0 0 4px; max-width: 440px; }
  .hint { margin: 6px 0 0; font-family: var(--cond); font-size: 11px; color: var(--faint); }
</style>
