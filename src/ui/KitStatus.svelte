<script lang="ts">
  /**
   * The kit builder's status lines — reading headers, pushing samples, what
   * was added, what went wrong. Shown wherever the builder is: its panel on a
   * new kit, the Add samples dialog, or the rows panel once neither is up.
   */
  import Status from './controls/Status.svelte'
  import { OTHER_EDITOR_WARNING } from './copy'
  import { card } from './state/card.svelte'
  import { kit } from './state/kit.svelte'
</script>

{#if card.otherEditor}
  <!-- A second editor on the same Deluge (issue #8): a sample push runs for
       as long as the files are big, and the other one can truncate any of
       them mid-flight. Shown here too — a push from this panel does not
       need the card panel open. -->
  <Status kind="caution" testid="kit-other-editor">{OTHER_EDITOR_WARNING}</Status>
{/if}
{#if kit.busy}<Status kind="busy" testid="kit-busy">{kit.busy}… {Math.round(kit.progress * 100)}%</Status>{/if}
{#if kit.error}<Status kind="err">{kit.error}</Status>{/if}
{#if kit.notice}<Status kind="ok" testid="kit-notice">{kit.notice}</Status>{/if}
