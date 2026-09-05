<script lang="ts">
  /**
   * Live Edit's header: whether the link holds, which sound the page is a
   * view of (its folder and name, a kit's selected row and AFFECT ENTIRE),
   * what is on its way, and what went wrong. The editor under it is the
   * ordinary one — every control reaches the device, by the fast path or the
   * whole document — so unlike Follow's header this one gates nothing.
   */
  import Status from './controls/Status.svelte'
  import { LIVE_OTHER_EDITOR_WARNING } from './copy'
  import { card } from './state/card.svelte'
  import { live } from './state/live.svelte'

  const label = $derived(
    live.status === 'live'
      ? 'Live'
      : live.status === 'starting'
        ? 'Starting'
        : live.status === 'waiting'
          ? 'Waiting'
          : live.status === 'error'
            ? 'Link down'
            : 'Off',
  )
  /** The sound the page is a view of, as the device names it: `SYNTHS/Tim`, and for a kit which half. */
  const instLine = $derived.by(() => {
    const i = live.inst
    if (!i) return ''
    if (i.type !== 'synth' && i.type !== 'kit') return i.type === 'none' ? 'no clip open on the Deluge' : `the Deluge’s clip is ${i.type}, not a synth or kit`
    const parts = [`${i.dir ?? ''}/${i.name ?? ''}`]
    if (i.type === 'kit') parts.push(i.entire ? 'kit bus (AFFECT ENTIRE)' : i.drum !== undefined && i.drum >= 0 ? `row ${i.drum + 1}` : 'no row selected')
    if (i.edited) parts.push('unsaved on the Deluge')
    return parts.join(' · ')
  })
  const counters = $derived(`${live.received} from Deluge · ${live.sent} to Deluge · ${live.pushed} preset push${live.pushed === 1 ? '' : 'es'} · ${live.resynced} resync${live.resynced === 1 ? '' : 's'}`)
</script>

<section class="hdr" data-testid="live-header">
  <div class="row">
    <span class="tag" class:live={live.status === 'live'} class:down={live.status === 'error'} data-testid="live-status">
      {#if live.status === 'live'}<span class="dot pulse" aria-hidden="true"></span>{/if}
      {label}
    </span>
    <span class="inst" data-testid="live-inst">{instLine}</span>
    {#if live.busy}
      <span class="rule" aria-hidden="true"></span>
      <span class="busy" data-testid="live-busy">{live.busy}…</span>
    {/if}
    <span class="counters" data-testid="live-counters">{counters}</span>
  </div>
  {#if live.status === 'waiting'}
    <!-- Parked, not broken: the lease holds and the next `^inst` that names a
         synth or kit opens it. The editor keeps whatever it had meanwhile. -->
    <p class="hint" data-testid="live-waiting">Open a synth or kit clip on the Deluge and it opens here.</p>
  {/if}
  {#if live.linkError}
    <Status kind="err" testid="live-link-error">{live.linkError}</Status>
  {/if}
  {#if live.error}
    <Status kind="err" testid="live-error">{live.error}</Status>
  {:else if live.notice}
    <Status kind="notice" testid="live-notice">{live.notice}</Status>
  {/if}
  {#if card.otherEditor}
    <!-- The card panel's warning, and it matters more here: the lease is per
         cable and the last subscriber wins, so the other editor can take the
         device's pushes away from this page without either noticing. -->
    <Status kind="caution" testid="live-other-editor">{LIVE_OTHER_EDITOR_WARNING}</Status>
  {/if}
</section>

<style>
  .hdr { margin: 12px 0 0; border: 1px solid var(--edge); border-radius: 4px; background: linear-gradient(180deg, var(--panel2), var(--panel)); padding: 9px 12px 10px; }
  .row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .tag { display: inline-flex; align-items: center; gap: 7px; font-family: var(--cond); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
  .tag.live { color: var(--ok-text); }
  .tag.down { color: var(--bad-text); }
  .inst { font-family: var(--cond); font-size: 13px; letter-spacing: .05em; color: var(--text-hi); }
  .busy { font-family: var(--mono); font-size: 10.5px; color: var(--warn-text); }
  .counters { font-family: var(--mono); font-size: 10.5px; color: var(--muted); margin-left: auto; }
  .rule { width: 1px; height: 17px; background: var(--edge-hi); }
  .hint { margin: 8px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--muted); }
  .hdr :global(.msg) { margin: 8px 0 0; }
</style>
