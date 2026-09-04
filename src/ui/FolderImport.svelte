<script lang="ts">
  /**
   * "Where are the samples?" — the whole of the multi-sample import's own UI
   * (issue #33). One question, then a folder, and what comes back is ranges on
   * the oscillator and the range editor open on them. Everything after that is
   * range editing, in the one panel, so this asks and gets out of the way.
   */
  import CardBrowser from './controls/CardBrowser.svelte'
  import Dialog from './controls/Dialog.svelte'
  import Status from './controls/Status.svelte'
  import { browseSamplesTip } from './copy'
  import { pickedFolder, takeFiles } from './filepick'
  import { card } from './state/card.svelte'
  import { multisample as ms } from './state/multisample.svelte'

  let folderInput: HTMLInputElement | undefined = $state()
  import { isWav } from './state/wavfiles'

  async function pickFolder(e: Event) {
    const picked = pickedFolder(takeFiles(e), 'Samples')
    if (picked) await ms.addLocalFolder(picked.folder, picked.files)
  }

  const label = $derived(ms.asking === 2 ? 'B' : 'A')
  const hasWavs = $derived(ms.browser.hasWavs)
</script>

<Dialog title="Build Osc {label} from a folder" ariaLabel="Build a multi-sample instrument" testid="folder-import" width={560} closeLabel="Cancel" onclose={() => ms.cancel()}>
  <p class="lede">
    Every WAV in the folder becomes a key range: the root notes come from what the files declare, then from their
    names, and anything that can’t be placed is listed rather than dropped.
  </p>

  <input bind:this={folderInput} type="file" webkitdirectory hidden data-testid="ms-folder-input" onchange={pickFolder} />
  <div class="ways">
    <button type="button" class="btn go" data-testid="ms-source-local" disabled={!!ms.busy} onclick={() => folderInput?.click()}>
      On this computer…
    </button>
    <button
      type="button"
      class="btn"
      data-testid="ms-source-card"
      disabled={!card.supported || !!ms.busy}
      title={browseSamplesTip(card.supported)}
      onclick={() => ms.browser.open()}
    >On the Deluge…</button>
    <button type="button" class="btn" data-testid="ms-cancel" onclick={() => ms.cancel()}>Cancel</button>
  </div>

  {#if ms.browser.path !== null}
    <div class="browse">
      <CardBrowser
        path={ms.browser.path}
        root="/SAMPLES"
        entries={ms.browser.entries}
        busy={!!ms.busy}
        pickable={isWav}
        testid="ms-card-browser"
        boxed
        listHeight="190px"
        onUp={() => ms.browser.up()}
        onOpen={(name) => ms.browser.enter(name)}
      >
        <button type="button" class="btn go" data-testid="ms-take-card-folder" disabled={!!ms.busy || !hasWavs} onclick={() => ms.addCardFolder()}>
          Use this folder
        </button>
        <p class="hint">Samples stay on the card — only their headers are read, for the roots and zones.</p>
      </CardBrowser>
    </div>
  {/if}

  {#if ms.busy}<Status kind="busy" testid="ms-busy">{ms.busy}… {Math.round(ms.progress * 100)}%</Status>{/if}
  {#if ms.error}<Status kind="err" testid="ms-error">{ms.error}</Status>{/if}
</Dialog>

<style>
  .ways { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
  .browse { margin-top: 10px; }
  .hint { margin: 6px 0 0; font-family: var(--cond); font-size: 11px; color: var(--faint); }
</style>
