<script lang="ts">
  /**
   * The share zip, with its credits: who made it, what the samples' licence
   * is and where they came from, written into the zip's README. Asked here
   * rather than kept on the page, because they matter only to the zip.
   * Blank fields are left out of the README.
   */
  import Dialog from './controls/Dialog.svelte'
  import { kit } from './state/kit.svelte'

  function download() {
    kit.downloadZip()
    kit.shareOpen = false
  }
</script>

<Dialog title="Download zip" testid="share-zip" width={460} closeLabel="Cancel" onclose={() => (kit.shareOpen = false)}>
  <p class="lede">The preset, its samples and a README. Credits go in the README; leave any blank to skip it.</p>
  <div class="credits">
    <div class="f"><label for="kit-author">Author</label><input id="kit-author" bind:value={kit.author} placeholder="your name" spellcheck="false" /></div>
    <div class="f"><label for="kit-license">Sample licensing</label><input id="kit-license" bind:value={kit.license} placeholder="e.g. CC0, own recordings" spellcheck="false" /></div>
    <div class="f"><label for="kit-source">Sample source</label><input id="kit-source" bind:value={kit.sampleSource} placeholder="where the samples came from" spellcheck="false" /></div>
  </div>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (kit.shareOpen = false)}>Cancel</button>
    <button type="button" class="btn go" data-testid="share-zip-download" onclick={download}>Download zip</button>
  {/snippet}
</Dialog>

<style>
  .credits { display: flex; flex-direction: column; gap: 10px; }
</style>
