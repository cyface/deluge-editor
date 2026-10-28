<script lang="ts">
  /**
   * Build-a-kit workflows (issue #10): drop or pick a folder of WAVs and the
   * editor takes a shot at the kit — rows in kick/snare/hats order, zones
   * from the WAV headers. A panel only while the kit has no samples; after
   * that the same controls are the rows panel's Add samples dialog
   * (`KitAddSamples.svelte`), and the push to the card and the share credits
   * live with the rows and the zip.
   */
  import KitSources from './KitSources.svelte'
  import Panel from './controls/Panel.svelte'
  import { editor } from './state/editor.svelte'
</script>

<Panel title="Build from samples" sub="rows land kick → snare → closed hat → open hat, guessed from file names · {editor.rows.length} of 128 rows used" flow testid="kit-builder">
  <KitSources />
</Panel>
