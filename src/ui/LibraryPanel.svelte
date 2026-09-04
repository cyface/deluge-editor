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
  import { audio } from './state/audio.svelte'
  import { card } from './state/card.svelte'
  import { library as lib, type LibraryEntry } from './state/library.svelte'

  const fmtSize = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`
  const fmtDuration = (frames: number, rate: number): string => {
    const s = rate ? frames / rate : 0
    return s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(s < 10 ? 2 : 1)} s`
  }
  /** The scan's status line: what it is doing, or what it covers. */
  const indexLine = $derived.by(() => {
    if (lib.scan) {
      const p = lib.scan
      return p.phase === 'listing' ? `Listing ${xmlPath(p.path)}…` : p.total ? `Reading ${p.done + 1} of ${p.total} changed: ${xmlPath(p.path)}` : 'Nothing changed since last time'
    }
    if (!lib.index) return 'References not read yet'
    const parts = ['SONGS', 'KITS', 'SYNTHS'].map((r) => `${lib.indexed[r] ?? 0} ${r.toLowerCase()}`)
    return `References read from ${parts.join(', ')}`
  })
  const preview = (e: LibraryEntry) => audio.toggle(xmlPath(e.path))
  const mounted = $derived(lib.source === 'mounted')
  const rowActions = (e: LibraryEntry): boolean => !lib.busy && !e.fixed && lib.renaming !== e.name
</script>

{#if lib.open}
  <div class="veil" role="dialog" aria-modal="true" aria-label={mounted ? 'Samples on the card' : 'Samples on the Deluge'}>
  <aside class="card" data-testid="library-panel" data-source={lib.source}>
    <header>
      <b>{mounted ? 'Samples on the card' : 'Samples on the Deluge'}</b>
      {#if mounted}
        <span class="port" data-testid="library-mounted" title="The card's root folder, open in this browser">{lib.mountedName ?? ''}</span>
      {:else if card.status === 'connected'}
        <span class="port" title={card.portName}>{card.portName}{card.identity ? ` · fw ${card.identity}` : ''}</span>
      {/if}
      <button type="button" class="x" aria-label="Close" disabled={!!lib.busy} onclick={() => lib.close()}>×</button>
    </header>
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
      <p class="err" role="alert">{card.error}</p>
      <button type="button" class="btn" onclick={() => lib.openPanel()}>Retry</button>
    {:else if mounted && !lib.ready}
      {#if lib.error}<p class="err" role="alert" data-testid="library-error">{lib.error}</p>{/if}
      <button type="button" class="btn" onclick={() => lib.openMounted()}>Choose the card’s folder…</button>
    {:else}
      <div class="status" data-testid="library-index">
        <span class="n">{indexLine}</span>
        <button type="button" class="btn small" disabled={!!lib.busy || !lib.ready} onclick={() => lib.rescan()} title="Re-read the files that changed since the references were read">Rescan</button>
        <button type="button" class="btn small" disabled={!!lib.busy || !lib.ready} onclick={() => lib.rescan(true)} title="Forget the cache and read every song, kit and synth again">Rescan all</button>
      </div>

      <div class="pathbar">
        <button type="button" class="btn small" onclick={() => lib.up()} disabled={lib.path === '/SAMPLES' || !!lib.busy} title="Up one folder" aria-label="Up">↑</button>
        <span class="path" data-testid="library-path">{lib.path}</span>
        <button type="button" class="btn small" disabled={!!lib.busy || !lib.ready} onclick={() => lib.startNewFolder()} title="A new folder here">New folder</button>
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
              <button type="button" class="entry" disabled={!!lib.busy} onclick={() => void lib.choose(e)} title={e.dir ? 'Open this folder' : 'Show which files use this sample'}>
                <span class="n">{e.dir ? '▸ ' : ''}{e.name}</span>
                {#if e.fixed}<span class="tag" title="The Deluge records into this folder; it stays where it is">recording</span>{/if}
                <span class="used" class:none={e.used === 0} data-testid="library-used" title={e.used ? `Named by ${e.used} file${e.used === 1 ? '' : 's'} on the card` : 'Nothing on the card names it'}>{e.used}</span>
                {#if !e.dir}<span class="s">{fmtSize(e.size)}</span>{/if}
              </button>
              <span class="actions">
                {#if !e.dir}
                  <button
                    type="button"
                    class="act"
                    class:live={audio.playing === xmlPath(e.path)}
                    disabled={!!lib.busy || audio.loading !== null}
                    title={audio.playing === xmlPath(e.path) ? 'Stop' : mounted ? 'Play' : 'Play (reads the sample from the card)'}
                    aria-label="Play"
                    onclick={() => void preview(e)}
                  >{audio.playing === xmlPath(e.path) ? '■' : audio.loading === xmlPath(e.path) ? `${Math.round(audio.progress * 100)}%` : '▶'}</button>
                {/if}
                {#if rowActions(e)}
                  <button type="button" class="act" data-testid="library-rename-start" onclick={() => lib.startRename(e.name)} title="Rename, and rewrite every file that names it">Rename</button>
                  <button type="button" class="act" data-testid="library-move-start" onclick={() => lib.startMove(e.name)} title="Move to another folder, and rewrite every file that names it">Move…</button>
                  {#if e.used === 0}
                    <button type="button" class="act danger" data-testid="library-delete" onclick={() => lib.remove(e.name)} title="Delete — nothing on the card names it">Delete</button>
                  {/if}
                {/if}
              </span>
            {/if}
          </li>
        {:else}
          <li class="empty">{lib.busy ? '' : 'empty'}</li>
        {/each}
      </ul>

      {#if lib.moving !== null}
        <div class="picker" data-testid="library-move-picker">
          <div class="pathbar">
            <span class="lbl">Move {lib.moving} to</span>
            <button type="button" class="btn small" onclick={() => lib.destUp()} disabled={lib.destPath === '/SAMPLES' || !!lib.busy} aria-label="Up">↑</button>
            <span class="path">{lib.destPath}</span>
          </div>
          <ul class="folders">
            {#each lib.destFolders as name (name)}
              <li><button type="button" disabled={!!lib.busy || name === lib.moving} onclick={() => void lib.browseDest(`${lib.destPath}/${name}`)}>▸ {name}</button></li>
            {:else}
              <li class="empty">no folders here</li>
            {/each}
          </ul>
          <div class="editrow">
            <button type="button" class="btn small go" data-testid="library-move-here" disabled={!!lib.busy || lib.destPath === lib.path} onclick={() => lib.commitMove()}>Move here</button>
            <button type="button" class="btn small" onclick={() => lib.cancelEdits()}>Cancel</button>
          </div>
        </div>
      {/if}

      {#if lib.selectedEntry}
        {@const e = lib.selectedEntry}
        <div class="detail" data-testid="library-detail">
          <div class="dh">
            <b>{xmlPath(e.path)}</b>
            {#if lib.info}
              <span class="facts">{lib.info.sampleRate} Hz · {lib.info.bitsPerSample}-bit · {lib.info.channels === 1 ? 'mono' : lib.info.channels === 2 ? 'stereo' : `${lib.info.channels} ch`} · {fmtDuration(lib.info.frames, lib.info.sampleRate)}</span>
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

      {#if lib.busy}<p class="busy" data-testid="library-busy">{lib.busy}… {Math.round(lib.progress * 100)}%</p>{/if}
      {#if lib.notice}<p class="notice" data-testid="library-notice">{lib.notice}</p>{/if}
      {#if lib.error}<p class="err" role="alert" data-testid="library-error">{lib.error}</p>{/if}
      {#if audio.error}<p class="err" role="alert">{audio.error}</p>{/if}
    {/if}
  </aside>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(6, 5, 4, .72); }
  .card {
    width: min(720px, calc(100vw - 40px)); max-height: min(84vh, calc(100vh - 60px));
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, #171412, #100e0d); border: 1px solid var(--edge-hi); border-radius: 5px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .5); padding: 12px 14px 14px;
  }
  header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  header b { font-family: var(--cond); font-size: 12.5px; letter-spacing: .13em; text-transform: uppercase; color: var(--brass); }
  .port { flex: 1; min-width: 0; font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .x { margin-left: auto; background: none; border: 0; color: var(--faint); font-size: 15px; cursor: pointer; line-height: 1; }
  .x:hover:not(:disabled) { color: #e9e2d6; }
  .x:disabled { opacity: .4; cursor: default; }
  .lede { margin: 0 0 8px; font-family: var(--cond); font-size: 11.5px; line-height: 1.45; color: var(--muted); }
  .status { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; font-family: var(--mono); font-size: 10px; color: var(--faint); }
  .status .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pathbar { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; }
  .path { flex: 1; min-width: 0; font-family: var(--mono); font-size: 11px; color: #cfe3c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lbl { font-family: var(--cond); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--brass); white-space: nowrap; }
  .btn.small { height: 22px; padding: 0 8px; font-size: 10px; }
  .btn.go { border-color: #8a5a2a; color: #e8b06a; }
  .list { list-style: none; margin: 0 0 8px; padding: 0; overflow-y: auto; min-height: 60px; max-height: 40vh; border: 1px solid var(--edge); border-radius: 3px; background: #0d0b0a; flex: 1; }
  .list li { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid rgba(255, 255, 255, .04); padding-right: 6px; }
  .list li:last-child { border-bottom: 0; }
  .list li.selected { background: rgba(197, 160, 89, .12); box-shadow: inset 2px 0 0 var(--brass); }
  .entry { display: flex; flex: 1; min-width: 0; align-items: baseline; gap: 8px; padding: 5px 8px; background: none; border: 0; color: #ddd3c2; font-family: var(--mono); font-size: 11px; text-align: left; cursor: pointer; }
  .entry:hover:not(:disabled) { background: rgba(197, 160, 89, .08); }
  .entry .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .entry .s { color: var(--faint); font-size: 10px; white-space: nowrap; }
  .used { min-width: 18px; padding: 0 5px; border-radius: 9px; background: #2f4a2c; color: #a9d9a1; font-size: 9.5px; text-align: center; line-height: 15px; }
  .used.none { background: #1d1a17; color: var(--faint); }
  .tag { font-family: var(--cond); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #e8b06a; }
  .actions { display: flex; gap: 3px; flex: none; }
  .act { height: 20px; padding: 0 7px; border-radius: 3px; border: 1px solid var(--edge); background: #141210; color: var(--muted); font-family: var(--cond); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .act:hover:not(:disabled) { color: var(--text); border-color: var(--brass); }
  .act:disabled { opacity: .4; cursor: default; }
  .act.live { color: var(--brass-hi); border-color: var(--brass); }
  .act.danger:hover:not(:disabled) { color: #e8a08f; border-color: #8a3a2a; }
  .editrow { display: flex; gap: 6px; align-items: center; padding: 4px 8px; flex: 1; }
  .editrow input { flex: 1; min-width: 0; background: #0d0b0a; border: 1px solid var(--edge); border-radius: 3px; color: #efe6d7; font-family: var(--mono); font-size: 11px; padding: 3px 7px; }
  .editrow input:focus { outline: 1px solid var(--brass); }
  .picker { margin: 0 0 8px; padding: 7px 8px; border: 1px solid #6b4a1c; border-radius: 3px; background: #1d1710; }
  .folders { list-style: none; margin: 0; padding: 0; max-height: 140px; overflow-y: auto; }
  .folders button { display: block; width: 100%; padding: 3px 6px; background: none; border: 0; color: #ddd3c2; font-family: var(--mono); font-size: 11px; text-align: left; cursor: pointer; }
  .folders button:hover:not(:disabled) { background: rgba(197, 160, 89, .08); }
  .folders button:disabled { opacity: .4; cursor: default; }
  .detail { margin: 0 0 8px; padding: 6px 8px; border: 1px solid var(--edge); border-radius: 3px; background: #0d0b0a; max-height: 20vh; overflow-y: auto; }
  .dh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .dh b { font-family: var(--mono); font-size: 11px; font-weight: 600; color: #efe6d7; word-break: break-all; }
  .facts { font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; }
  .uses { list-style: none; margin: 5px 0 0; padding: 0; font-family: var(--mono); font-size: 10.5px; color: #ddd3c2; }
  .uses li { display: flex; align-items: baseline; gap: 6px; padding: 1px 0; }
  .root { font-family: var(--cond); font-size: 9px; letter-spacing: .08em; padding: 0 5px; border-radius: 2px; background: #2a2419; color: var(--muted); }
  .root.songs { background: #2a3a5a; color: #b9cff0; }
  .root.kits { background: #2f4a2c; color: #a9d9a1; }
  .root.synths { background: #4a3a2a; color: #e8c79a; }
  .hint { margin: 4px 0 0; font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .empty { padding: 7px 8px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .busy, .err, .notice { margin: 3px 0; font-family: var(--mono); font-size: 10px; }
  .busy { color: #cfe3c9; }
  .notice { color: #9ed492; padding: 5px 7px; border: 1px solid #2f4a2c; background: #101710; border-radius: 3px; word-break: break-word; }
  .err { color: #e8a08f; padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; border-radius: 3px; }
</style>
