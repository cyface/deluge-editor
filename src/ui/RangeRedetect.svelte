<script lang="ts">
  /**
   * A re-detect the user hasn't accepted (issue #33): the roots the samples
   * were read again for, and what applying them would move. Nothing has been
   * written yet. Roots only — the boundaries between them are decisions, and
   * the instrument's own version of this deletes every range first.
   */
  import { rootName } from '../core/preset/ranges'
  import Status from './controls/Status.svelte'
  import { ROOT_SOURCE } from './rangesource'
  import { multisample, type RedetectPlan } from './state/multisample.svelte'

  interface Props { plan: RedetectPlan }
  let { plan }: Props = $props()

  /** The rows worth showing: the ones that would move, and the ones nothing placed. */
  const moves = $derived(plan.rows.filter((r) => r.root === undefined || r.root !== r.was))
  const agreed = $derived(plan.rows.length - moves.length)
  const readable = $derived(plan.rows.length - plan.unreadable.length)
</script>

<div class="import propose" data-testid="range-redetect">
  <div class="line">
    <span class="lead">Re-detected</span>
    <span class="mono who">
      {plan.changed === 0
        ? 'nothing would move'
        : `${plan.changed} of ${plan.rows.length} root${plan.rows.length === 1 ? '' : 's'} would move`}
    </span>
    <span class="why">
      {#if plan.folders.length > 1}
        {plan.folders.length} folders, each calibrated on its own
      {:else if plan.folders[0]?.offsetFrom === 'anchors'}
        calibrated against the files that declare a root
      {:else}
        read from the file names — nothing declares a root to calibrate against
      {/if}
      {#if agreed}· {agreed} already agree{/if}
    </span>
    <span class="shift">
      <button type="button" class="btn small go" data-testid="range-redetect-apply" onclick={() => multisample.applyRedetect()}>Apply</button>
      <button type="button" class="btn small" data-testid="range-redetect-cancel" onclick={() => multisample.cancelRedetect()}>Cancel</button>
    </span>
  </div>

  {#if plan.disordered}
    <Status kind="caution" testid="range-redetect-disordered">
      These roots don’t climb with the keyboard — a sample would be rooted below the one beneath it. That is what a
      misread name or an assumed offset looks like, so read the list before applying.
    </Status>
  {/if}
  {#if plan.unreadable.length}
    <Status kind="caution" testid="range-redetect-unread">
      {readable === 0
        ? 'No WAV header could be read, so this comes from the file names alone.'
        : `${plan.unreadable.length} of ${plan.rows.length} WAV headers could not be read; those files were placed by name alone.`}
      Connect the Deluge, or import the folder from this computer, to use the notes the files themselves declare.
    </Status>
  {/if}

  {#if moves.length}
    <div class="leftout">
      <span class="lead">What this would do</span>
      <ul class="props">
        {#each moves as m (m.index)}
          <li>
            <span class="fname" title={m.fileName}>{m.base}</span>
            <span class="mono move">{rootName(m.was)} → {m.root === undefined ? 'kept' : rootName(m.root)}</span>
            <span class="why">{ROOT_SOURCE[m.from].why}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .import { margin: 10px 0 0 4px; border: 1px solid var(--brass); border-radius: var(--r-s); padding: 8px 9px; background: #100e0c; }
  .line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .who { color: var(--text-hi); }
  .why { font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .shift { display: flex; align-items: center; gap: 5px; margin-left: auto; }
  .lead { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .mono { font-family: var(--mono); font-size: 10.5px; color: #cfc6b6; white-space: nowrap; }
  .fname { font-family: var(--mono); font-size: 10.5px; }
  .leftout { margin-top: 9px; }
  .leftout ul { list-style: none; margin: 5px 0 0; padding: 0; }
  .leftout li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .leftout .why { flex: 1; min-width: 120px; }
  .props { max-height: 30vh; overflow-y: auto; }
  .props .move { min-width: 130px; }
  .import :global(.msg) { margin: 8px 0 0; }
</style>
