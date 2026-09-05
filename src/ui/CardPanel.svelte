<script lang="ts">
  /**
   * The Deluge's SD card, as one browser with two intents (open or save,
   * chosen by the top-bar button that opened it).
   *
   * It is a modal, not a panel hanging off its button: it is a file browser
   * with a path bar, a listing and a save name — a place you work for a
   * moment, not a menu you glance at — and as a popover it sat over the
   * editor it was about while the page behind it stayed live. Dismissed the
   * way the other dialogs here are: the ×, or Escape (`Dialog.svelte`).
   */
  import CardBrowser, { type BrowserEntry } from './controls/CardBrowser.svelte'
  import Dialog from './controls/Dialog.svelte'
  import Status from './controls/Status.svelte'
  import { OTHER_EDITOR_WARNING } from './copy'
  import { formatBytes } from './format'
  import { UI_HELP } from './help'
  import { card } from './state/card.svelte'
  import { editor } from './state/editor.svelte'

  const title = $derived(card.mode === 'open' ? 'Open from Deluge' : 'Save to Deluge')
  const entries = $derived<BrowserEntry[]>(card.entries.map((e) => ({ name: e.name, dir: e.dir, size: e.size })))
  /** In save mode the armed target reads as the selected entry. */
  const selected = $derived(card.mode === 'save' && card.armed ? card.saveName : null)
</script>

{#if card.open}
  <Dialog {title} testid="card-panel" onclose={() => card.close()}>
    {#snippet header()}
      {#if card.status === 'connected'}
        <span class="port" title={card.portName}>{card.portName}{card.identity ? ` · fw ${card.identity}` : ''}</span>
      {:else if card.status === 'connecting'}
        <span class="port">connecting…</span>
      {/if}
    {/snippet}

    {#if card.status === 'error'}
      <Status kind="err">{card.error}</Status>
      <p><button type="button" class="btn" onclick={() => card.connect()}>Retry</button></p>
    {:else if card.status === 'connected'}
      {#if card.firmwareOk === false}
        <Status kind="err">This Deluge runs firmware {card.identity}, which predates the card protocol — it needs community 1.3.0 or later.</Status>
      {:else if card.firmwareOk === 'unknown'}
        <!-- The identity inquiry went unanswered (or answered unreadably), so
             the top-bar selector never locked to the device: the controls are
             still gated by the file's firmware attribute, and that is worth
             saying rather than letting the connection look fully read. -->
        <Status kind="caution" testid="card-firmware-unknown">
          Could not read this Deluge’s firmware version — the controls follow the version in the file.
        </Status>
      {/if}
      {#if card.otherEditor}
        <!--
          Web MIDI is not exclusive: another tab, browser or app can be on
          this Deluge, and the client has just heard its traffic (issue #8).
          Nothing is blocked — a client cannot stop the other one writing —
          but a save that was verified can still be overwritten a second
          later, and that is worth saying out loud.
        -->
        <Status kind="caution" testid="card-other-editor">{OTHER_EDITOR_WARNING}</Status>
      {/if}
      <CardBrowser
        path={card.path}
        {entries}
        busy={!!card.busy}
        {selected}
        pathTestid="card-path"
        onUp={() => card.up()}
        onOpen={(name) => card.enter(name)}
        onPick={(name) => (card.mode === 'save' ? card.pickSaveTarget(name) : card.loadFile(name))}
      >
        {#snippet actions()}
          <button
            type="button"
            class="btn small refresh"
            onclick={() => card.refresh()}
            disabled={!!card.busy}
            title={UI_HELP['ui.card.refresh']}
            aria-label="Refresh"
          >
            <!-- Feather "rotate-cw" (MIT): arc plus a bracket arrowhead. -->
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        {/snippet}
        {#snippet trailing(e)}
          {#if card.armedLoad === e.name}<span class="warn">discards your changes?</span>
          {:else if !e.dir}<span class="s">{formatBytes(e.size ?? 0)}</span>{/if}
        {/snippet}
      </CardBrowser>
      {#if card.mode === 'save' && !editor.preset}
        <p class="hint">Nothing to save — load or build a preset first.</p>
      {/if}
      {#if card.mode === 'save' && editor.preset}
        <div class="saverow">
          <input
            data-testid="card-save-name"
            bind:value={card.saveName}
            placeholder="NAME.XML"
            spellcheck="false"
            onkeydown={(e) => { if (e.key === 'Enter' && !card.busy && card.saveName.trim()) void card.save() }}
          />
          <button type="button" class="btn" class:go={card.armed} data-testid="card-save" disabled={!!card.busy || !card.saveName.trim()} onclick={() => card.save()}>
            {card.armed ? 'Overwrite?' : 'Save'}
          </button>
        </div>
      {/if}
      {#if card.busy}<Status kind="busy" testid="card-busy">{card.busy}… {Math.round(card.progress * 100)}%</Status>{/if}
      {#if card.error}<Status kind="err">{card.error}</Status>{/if}
      <!-- A verified save closes this dialog, so its confirmation is shown by
           the page instead (`App.svelte`) — there is nothing left here to
           carry it. -->
    {/if}
  </Dialog>
{/if}

<style>
  .refresh { display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
  .refresh svg { display: block; }
  .warn { margin-left: auto; font-family: var(--cond); font-size: var(--lbl-s); letter-spacing: .08em; text-transform: uppercase; color: var(--warn-text); white-space: nowrap; }
  .s { color: var(--faint); font-size: 10px; }
  .hint { margin: 0 0 8px; font-family: var(--cond); font-size: 11px; color: var(--faint); }
  p { margin: 6px 0 0; }
  .saverow { display: flex; gap: 7px; margin-bottom: 6px; flex: none; }
  .saverow input {
    flex: 1; min-width: 0; background: var(--well); border: 1px solid var(--edge); border-radius: var(--r-s);
    color: #efe6d7; font-family: var(--mono); font-size: 11px; padding: 4px 7px;
  }
  .saverow input:focus { outline: 1px solid var(--brass); }
</style>
