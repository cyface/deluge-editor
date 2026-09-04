<script lang="ts">
  /**
   * The sample library on the Deluge's card: `SAMPLES/` as a list, each
   * entry with how many songs, kits and synths name it, and the three
   * things you do to a library — rename, move, delete — with the files
   * that name the sample rewritten to follow (`state/library.svelte.ts`).
   *
   * The card can be in the Deluge or in a reader on this computer — the
   * same panel, `lib.source` says which, and only the header and the
   * caveat differ.
   *
   * A modal like the card panel: a place you work for a moment. The
   * confirmation before anything changes on the card is the page's one
   * question dialog, so the files a move will rewrite are named before the
   * yes.
   */
  import { rootOf, xmlPath } from '../core/library'
  import CardBrowser, { type BrowserEntry } from './controls/CardBrowser.svelte'
  import Dialog from './controls/Dialog.svelte'
  import Status from './controls/Status.svelte'
  import { formatBytes, formatDuration } from './format'
  import { UI_HELP } from './help'
  import { audio } from './state/audio.svelte'
  import { card } from './state/card.svelte'
  import { library as lib, type LibraryEntry } from './state/library.svelte'
  /** The scan's status line: what it is doing, or what it covers. */
  const indexLine = $derived.by(() => {
    if (lib.scan) {
      const p = lib.scan
      return p.phase === 'listing' ? `Reading ${xmlPath(p.path)}…` : p.total ? `Reading ${p.done + 1} of ${p.total} changed: ${xmlPath(p.path)}` : 'Nothing changed since last time'
    }
    if (!lib.index) return 'References not read yet'
    const parts = ['SONGS', 'KITS', 'SYNTHS'].map((r) => `${lib.indexed[r] ?? 0} ${r.toLowerCase()}`)
    return `References read from ${parts.join(', ')}`
  })
  const preview = (e: LibraryEntry) => audio.toggle(xmlPath(e.path))
  const mounted = $derived(lib.source === 'mounted')
  const rowActions = (e: LibraryEntry): boolean => !lib.busy && !e.fixed && lib.renaming !== e.name
  const title = $derived(mounted ? 'Samples on the card' : 'Samples on the Deluge')
  /** The move picker's folders, as the browser lists them. */
  const destEntries = $derived<BrowserEntry[]>(lib.destFolders.map((name) => ({ name, dir: true })))
</script>

{#if lib.open}
  <Dialog {title} testid="library-panel" data-source={lib.source} width={720} closeDisabled={!!lib.busy} onclose={() => lib.close()}>
    {#snippet header()}
      {#if mounted}
        <span class="port" data-testid="library-mounted" title={UI_HELP['ui.library.mounted']}>{lib.mountedName ?? ''}</span>
      {:else if card.status === 'connected'}
        <span class="port" title={card.portName}>{card.portName}{card.identity ? ` · fw ${card.identity}` : ''}</span>
      {/if}
    {/snippet}

    <p class="lede">
      Rename, move or delete samples with every song, kit and synth that names them rewritten to follow.
      {#if mounted}
        Put the card back in the Deluge when you are done; a song or preset it still has open keeps the old paths in
        memory until it is loaded again.
      {:else}
        A song or preset the Deluge has open keeps the old paths in memory until it is loaded again — reload it
        there before saving it.
      {/if}
    </p>

    {#if !mounted && card.status === 'error'}
      <Status kind="err">{card.error}</Status>
      <p><button type="button" class="btn" onclick={() => lib.openPanel()}>Retry</button></p>
    {:else if mounted && !lib.ready}
      {#if lib.error}<Status kind="err" testid="library-error">{lib.error}</Status>{/if}
      <p><button type="button" class="btn" onclick={() => lib.openMounted()}>Choose the card’s folder…</button></p>
    {:else}
      <div class="status" data-testid="library-index">
        <span class="n">{indexLine}</span>
        <button type="button" class="btn small" disabled={!!lib.busy || !lib.ready} onclick={() => lib.rescan()} title={UI_HELP['ui.library.rescan']}>Rescan</button>
        <button type="button" class="btn small" disabled={!!lib.busy || !lib.ready} onclick={() => lib.rescan(true)} title={UI_HELP['ui.library.rescanAll']}>Rescan all</button>
      </div>

      <div class="pathbar">
        <button type="button" class="btn small" onclick={() => lib.up()} disabled={lib.path === '/SAMPLES' || !!lib.busy} title={UI_HELP['ui.browser.up']} aria-label="Up">↑</button>
        <span class="path" data-testid="library-path">{lib.path}</span>
        <button type="button" class="btn small" disabled={!!lib.busy || !lib.ready} onclick={() => lib.startNewFolder()} title={UI_HELP['ui.library.newFolder']}>New folder</button>
      </div>

      {#if lib.newFolder !== null}
        <div class="editrow">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            data-testid="library-new-folder"
            bind:value={lib.newFolder}
            placeholder="folder name"
            spellcheck="false"
            autofocus
            onkeydown={(e) => { if (e.key === 'Enter') void lib.commitNewFolder(); if (e.key === 'Escape') { e.stopPropagation(); lib.cancelEdits() } }}
          />
          <button type="button" class="btn small" onclick={() => lib.commitNewFolder()} disabled={!lib.newFolder?.trim()}>Create</button>
          <button type="button" class="btn small" onclick={() => lib.cancelEdits()}>Cancel</button>
        </div>
      {/if}

      <!-- The library's own listing rather than `CardBrowser`: each row
           carries a usage count, a preview and the rename/move/delete
           actions, and renames edit in place. -->
      <ul class="list" data-testid="library-list">
        {#each lib.entries as e (e.name)}
          <li class:selected={lib.selected === e.name} data-entry={e.name}>
            {#if lib.renaming === e.name}
              <div class="editrow">
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  data-testid="library-rename"
                  bind:value={lib.renameTo}
                  spellcheck="false"
                  autofocus
                  onkeydown={(ev) => { if (ev.key === 'Enter') lib.commitRename(); if (ev.key === 'Escape') { ev.stopPropagation(); lib.cancelEdits() } }}
                />
                <button type="button" class="btn small" data-testid="library-rename-go" onclick={() => lib.commitRename()}>Rename</button>
                <button type="button" class="btn small" onclick={() => lib.cancelEdits()}>Cancel</button>
              </div>
            {:else}
              <button type="button" class="entry" disabled={!!lib.busy} onclick={() => void lib.choose(e)} title={UI_HELP[e.dir ? 'ui.library.openFolder' : 'ui.library.usages']}>
                <span class="n">{e.dir ? '▸ ' : ''}{e.name}</span>
                {#if e.fixed}<span class="tag" title={UI_HELP['ui.library.recording']}>recording</span>{/if}
                <span class="used" class:none={e.used === 0} data-testid="library-used" title={e.used ? `Named by ${e.used} file${e.used === 1 ? '' : 's'} on the card` : UI_HELP['ui.library.unused']}>{e.used}</span>
                {#if !e.dir}<span class="s">{formatBytes(e.size)}</span>{/if}
              </button>
              <span class="actions">
                {#if !e.dir}
                  <button
                    type="button"
                    class="act"
                    class:live={audio.playing === xmlPath(e.path)}
                    disabled={!!lib.busy || audio.loading !== null}
                    title={UI_HELP[audio.playing === xmlPath(e.path) ? 'ui.preview.stop' : mounted ? 'ui.library.play' : 'ui.library.playCard']}
                    aria-label="Play"
                    onclick={() => void preview(e)}
                  >{audio.playing === xmlPath(e.path) ? '■' : audio.loading === xmlPath(e.path) ? `${Math.round(audio.progress * 100)}%` : '▶'}</button>
                {/if}
                {#if rowActions(e)}
                  <button type="button" class="act" data-testid="library-rename-start" onclick={() => lib.startRename(e.name)} title={UI_HELP['ui.library.rename']}>Rename</button>
                  <button type="button" class="act" data-testid="library-move-start" onclick={() => lib.startMove(e.name)} title={UI_HELP['ui.library.move']}>Move…</button>
                  {#if e.used === 0}
                    <button type="button" class="act danger" data-testid="library-delete" onclick={() => lib.remove(e.name)} title={UI_HELP['ui.library.delete']}>Delete</button>
                  {/if}
                {/if}
              </span>
            {/if}
          </li>
        {:else}
          <li class="empty">{lib.busy ? '' : '(empty)'}</li>
        {/each}
      </ul>

      {#if lib.moving !== null}
        <div class="picker" data-testid="library-move-picker">
          <CardBrowser
            path={lib.destPath}
            root="/SAMPLES"
            entries={destEntries}
            busy={!!lib.busy}
            disabledEntry={(name) => name === lib.moving}
            listHeight="140px"
            emptyText="(empty)"
            onUp={() => lib.destUp()}
            onOpen={(name) => void lib.browseDest(`${lib.destPath}/${name}`)}
          >
            {#snippet before()}
              <span class="movelbl">Move {lib.moving} to</span>
            {/snippet}
            <div class="editrow">
              <button type="button" class="btn small go" data-testid="library-move-here" disabled={!!lib.busy || lib.destPath === lib.path} onclick={() => lib.commitMove()}>Move here</button>
              <button type="button" class="btn small" onclick={() => lib.cancelEdits()}>Cancel</button>
            </div>
          </CardBrowser>
        </div>
      {/if}

      {#if lib.selectedEntry}
        {@const e = lib.selectedEntry}
        <div class="detail" data-testid="library-detail">
          <div class="dh">
            <b>{xmlPath(e.path)}</b>
            {#if lib.info}
              <span class="facts">{lib.info.sampleRate} Hz · {lib.info.bitsPerSample}-bit · {lib.info.channels === 1 ? 'mono' : lib.info.channels === 2 ? 'stereo' : `${lib.info.channels} ch`} · {formatDuration(lib.info.frames, lib.info.sampleRate)}</span>
            {/if}
          </div>
          {#if lib.usages.length}
            <ul class="uses" data-testid="library-usages">
              {#each lib.usages as u (u)}
                <li><span class="root {rootOf(u).toLowerCase()}">{rootOf(u)}</span>{xmlPath(u).slice(rootOf(u).length + 1)}</li>
              {/each}
            </ul>
          {:else}
            <p class="hint">Nothing on the card names it{lib.index ? '' : ' — references not read yet'}.</p>
          {/if}
        </div>
      {/if}

      {#if lib.busy}<Status kind="busy" testid="library-busy">{lib.busy}… {Math.round(lib.progress * 100)}%</Status>{/if}
      {#if lib.notice}<Status kind="notice" testid="library-notice">{lib.notice}</Status>{/if}
      {#if lib.error}<Status kind="err" testid="library-error">{lib.error}</Status>{/if}
      {#if audio.error}<Status kind="err">{audio.error}</Status>{/if}
    {/if}
  </Dialog>
{/if}

<style>
  p { margin: 6px 0 0; }
  .status { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; font-family: var(--mono); font-size: 10px; color: var(--faint); flex: none; }
  .status .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pathbar { flex: none; }
  .movelbl { font-family: var(--cond); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--brass); white-space: nowrap; }
  .list { list-style: none; margin: 0 0 8px; padding: 0; overflow-y: auto; min-height: 60px; max-height: 40vh; border: 1px solid var(--edge); border-radius: var(--r-s); background: var(--well); flex: none; }
  .list li { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid rgba(255, 255, 255, .04); padding-right: 6px; }
  .list li:last-child { border-bottom: 0; }
  .list li.selected { background: rgba(197, 160, 89, .12); box-shadow: inset 2px 0 0 var(--brass); }
  .entry { display: flex; flex: 1; min-width: 0; align-items: baseline; gap: 8px; padding: 5px 8px; background: none; border: 0; color: var(--text-list); font-family: var(--mono); font-size: 11px; text-align: left; cursor: pointer; }
  .entry:hover:not(:disabled) { background: rgba(197, 160, 89, .08); }
  .entry .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .entry .s { color: var(--faint); font-size: 10px; white-space: nowrap; }
  .used { min-width: 18px; padding: 0 5px; border-radius: 9px; background: var(--ok-edge); color: #a9d9a1; font-size: var(--lbl-s); text-align: center; line-height: 15px; }
  .used.none { background: #1d1a17; color: var(--faint); }
  .tag { font-family: var(--cond); font-size: var(--lbl-s); letter-spacing: .08em; text-transform: uppercase; color: var(--warn-text); }
  .actions { display: flex; gap: 3px; flex: none; }
  .act { height: 20px; padding: 0 7px; border-radius: var(--r-s); border: 1px solid var(--edge); background: var(--raised); color: var(--muted); font-family: var(--cond); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .act:hover:not(:disabled) { color: var(--text); border-color: var(--brass); }
  .act:disabled { opacity: .4; cursor: default; }
  .act.live { color: var(--brass-hi); border-color: var(--brass); }
  .act.danger:hover:not(:disabled) { color: var(--bad-text); border-color: #8a3a2a; }
  .editrow { display: flex; gap: 6px; align-items: center; padding: 4px 8px; flex: 1; }
  .editrow input { flex: 1; min-width: 0; background: var(--well); border: 1px solid var(--edge); border-radius: var(--r-s); color: #efe6d7; font-family: var(--mono); font-size: 11px; padding: 3px 7px; }
  .editrow input:focus { outline: 1px solid var(--brass); }
  .picker { margin: 0 0 8px; padding: 7px 8px; border: 1px solid var(--warn-edge); border-radius: var(--r-s); background: var(--warn-bg); flex: none; }
  .detail { margin: 0 0 8px; padding: 6px 8px; border: 1px solid var(--edge); border-radius: var(--r-s); background: var(--well); max-height: 20vh; overflow-y: auto; flex: none; }
  .dh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .dh b { font-family: var(--mono); font-size: 11px; font-weight: 600; color: #efe6d7; word-break: break-all; }
  .facts { font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; }
  .uses { list-style: none; margin: 5px 0 0; padding: 0; font-family: var(--mono); font-size: 10.5px; color: var(--text-list); }
  .uses li { display: flex; align-items: baseline; gap: 6px; padding: 1px 0; }
  .root { font-family: var(--cond); font-size: 9px; letter-spacing: .08em; padding: 0 5px; border-radius: 2px; background: #2a2419; color: var(--muted); }
  .root.songs { background: #2a3a5a; color: #b9cff0; }
  .root.kits { background: var(--ok-edge); color: #a9d9a1; }
  .root.synths { background: #4a3a2a; color: #e8c79a; }
  .hint { margin: 4px 0 0; font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .empty { padding: 7px 8px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
</style>
