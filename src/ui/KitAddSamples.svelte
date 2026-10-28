<script lang="ts">
  /**
   * The builder's ways in once the kit has samples, opened from the rows
   * panel. Closes itself when rows are added; an error stays in it.
   */
  import Dialog from './controls/Dialog.svelte'
  import KitSources from './KitSources.svelte'
  import { editor } from './state/editor.svelte'
  import { kit } from './state/kit.svelte'
</script>

<Dialog title="Add samples" testid="kit-add-samples" width={620} closeDisabled={!!kit.busy} onclose={() => kit.closeAdd()}>
  <p class="lede">
    Each WAV becomes a row after the {editor.rows.length} already here, ordered kick → snare → closed hat → open hat
    by its file name.
  </p>
  <KitSources />
</Dialog>
