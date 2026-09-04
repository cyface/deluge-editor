<script lang="ts">
  /**
   * "Where is the sample?" — one file, from this computer or from the Deluge.
   * The same question the folder import asks, for the single-sample half of
   * the workflow: a kit row's one file, a synth's one sample, and every add or
   * change in the range editor. A kit row's dialog can also take the whole
   * browsed folder, as new rows.
   */
  import CardBrowser from './controls/CardBrowser.svelte'
  import Dialog from './controls/Dialog.svelte'
  import Status from './controls/Status.svelte'
  import { takeFiles } from './filepick'
  import { card } from './state/card.svelte'
  import { samplePick as pick } from './state/samplepick.svelte'

  let fileInput: HTMLInputElement | undefined = $state()
  const isWav = (name: string) => /\.wav$/i.test(name)

  async function chooseLocal(e: Event) {
    const [file] = takeFiles(e)
    if (file) await pick.useLocalFile(file)
  }
</script>

<Dialog title="Sample for {pick.for}" ariaLabel="Choose a sample" testid="sample-picker" closeLabel="Cancel" onclose={() => pick.cancel()}>
  <p class="lede">
    A sample from this computer is copied to the card when the preset is saved; one already on the Deluge is used
    where it lies.
  </p>

  <input bind:this={fileInput} type="file" accept=".wav,audio/wav" hidden data-testid="sample-file-input" onchange={chooseLocal} />
  <div class="ways">
    <button type="button" class="btn go" data-testid="sample-source-local" disabled={!!pick.busy} onclick={() => fileInput?.click()}>
      On This Computer…
    </button>
    <button
      type="button"
      class="btn"
      data-testid="sample-source-card"
      disabled={!card.supported || !!pick.busy}
      title={card.supported ? 'Browse SAMPLES/ on the Deluge (connects first if needed)' : 'Web MIDI needs Chrome or Edge'}
      onclick={() => pick.browseCard()}
    >On the Deluge…</button>
    <button type="button" class="btn" data-testid="sample-cancel" onclick={() => pick.cancel()}>Cancel</button>
  </div>

  {#if pick.cardPath !== null}
    <div class="browse">
      <CardBrowser
        path={pick.cardPath}
        root="/SAMPLES"
        entries={pick.cardEntries}
        busy={!!pick.busy}
        selected={pick.selected}
        pickable={isWav}
        testid="sample-card-browser"
        boxed
        listHeight="210px"
        onUp={() => pick.cardUp()}
        onOpen={(name) => void pick.chooseCard({ name, dir: true })}
        onPick={(name) => void pick.chooseCard({ name, dir: false })}
        onPickDouble={() => void pick.useSelected()}
      >
        <div class="take">
          <button
            type="button"
            class="btn go"
            data-testid="sample-select"
            disabled={!pick.selected || !!pick.busy}
            title={pick.offersFolder ? 'Select this file for this row' : `Select this file for ${pick.for}`}
            onclick={() => void pick.useSelected()}
          >Select</button>
          {#if pick.offersFolder}
            <button
              type="button"
              class="btn"
              data-testid="sample-select-folder"
              disabled={!pick.folderHasWavs || !!pick.busy}
              title="Select all samples in this folder as new kit rows"
              onclick={() => void pick.useFolder()}
            >All Samples in This Folder</button>
          {/if}
        </div>
      </CardBrowser>
    </div>
  {/if}

  {#if pick.busy}<Status kind="busy" testid="sample-busy">{pick.busy}…</Status>{/if}
  {#if pick.error}<Status kind="err" testid="sample-error">{pick.error}</Status>{/if}
</Dialog>

<style>
  .ways { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
  .browse { margin-top: 10px; }
  .take { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
</style>
