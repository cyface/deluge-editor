<script lang="ts">
  import { isDirectory } from '../core/sysex'
  import { card } from './state/card.svelte'
  import { editor } from './state/editor.svelte'

  const fmtSize = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(1)}M` : n >= 1024 ? `${(n / 1024).toFixed(1)}K` : `${n}`
</script>

{#if card.open}
  <aside class="card" data-testid="card-panel">
    <header>
      <b>{card.mode === 'open' ? 'Open from Deluge' : 'Save to Deluge'}</b>
      {#if card.status === 'connected'}
        <span class="port" title={card.portName}>{card.portName}{card.identity ? ` · fw ${card.identity}` : ''}</span>
      {:else if card.status === 'connecting'}
        <span class="port">connecting…</span>
      {/if}
      <button type="button" class="x" aria-label="Close" onclick={() => card.close()}>×</button>
    </header>

    {#if card.status === 'error'}
      <p class="err" role="alert">{card.error}</p>
      <button type="button" class="btn" onclick={() => card.connect()}>Retry</button>
    {:else if card.status === 'connected'}
      {#if card.firmwareOk === false}
        <p class="err">This Deluge runs firmware {card.identity}, which predates the card protocol — it needs community 1.3.0 or later.</p>
      {/if}
      <div class="pathbar">
        <button type="button" class="btn" onclick={() => card.up()} disabled={card.path === '/' || !!card.busy} title="Up one folder" aria-label="Up">↑</button>
        <span class="path" data-testid="card-path">{card.path}</span>
        <button
          type="button"
          class="btn refresh"
          onclick={() => card.refresh()}
          disabled={!!card.busy}
          title="Refresh file list from card."
          aria-label="Refresh"
        >
          <!-- Feather "rotate-cw" (MIT): arc plus a bracket arrowhead. -->
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
      <ul class="list">
        {#each card.entries as e (e.name)}
          <li>
            <button
              type="button"
              data-entry={e.name}
              class:target={card.mode === 'save' && !isDirectory(e) && card.saveName === e.name && card.armed}
              onclick={() => (isDirectory(e) ? card.enter(e.name) : card.mode === 'save' ? card.pickSaveTarget(e.name) : card.loadFile(e.name))}
            >
              <span class="n">{isDirectory(e) ? '▸ ' : ''}{e.name}</span>
              {#if card.armedLoad === e.name}<span class="warn">discards your changes?</span>
              {:else if !isDirectory(e)}<span class="s">{fmtSize(e.size)}</span>{/if}
            </button>
          </li>
        {:else}
          <li class="empty">empty</li>
        {/each}
      </ul>
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
          <button type="button" class="btn save" data-testid="card-save" class:armed={card.armed} disabled={!!card.busy || !card.saveName.trim()} onclick={() => card.save()}>
            {card.armed ? 'Overwrite?' : 'Save'}
          </button>
        </div>
      {/if}
      {#if card.busy}<p class="busy" data-testid="card-busy">{card.busy}… {Math.round(card.progress * 100)}%</p>{/if}
      {#if card.error}<p class="err" role="alert">{card.error}</p>{/if}
      {#if card.saved}<p class="okline" data-testid="card-saved">{card.saved}</p>{/if}
    {/if}
  </aside>
{/if}

<style>
  .card {
    position: fixed; top: 56px; right: calc(var(--cheek) + var(--gut) + 8px); z-index: 50; width: 300px;
    max-height: calc(100vh - 76px); display: flex; flex-direction: column;
    background: linear-gradient(180deg, #171412, #100e0d); border: 1px solid var(--edge); border-radius: 5px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .55); padding: 10px 11px;
  }
  header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  header b { font-family: var(--cond); font-size: 12.5px; letter-spacing: .13em; text-transform: uppercase; color: var(--brass); }
  .port { flex: 1; min-width: 0; font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .x { margin-left: auto; background: none; border: 0; color: var(--faint); font-size: 15px; cursor: pointer; line-height: 1; }
  .x:hover { color: #e9e2d6; }
  .pathbar { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; }
  .refresh svg { display: block; }
  .refresh { display: inline-flex; align-items: center; justify-content: center; }
  .path { flex: 1; min-width: 0; font-family: var(--mono); font-size: 11px; color: #cfe3c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { list-style: none; margin: 0 0 8px; padding: 0; overflow-y: auto; min-height: 40px; border: 1px solid var(--edge); border-radius: 3px; background: #0d0b0a; }
  .list li { border-bottom: 1px solid rgba(255, 255, 255, .04); }
  .list li:last-child { border-bottom: 0; }
  .list button { display: flex; width: 100%; align-items: baseline; gap: 8px; padding: 5px 8px; background: none; border: 0; color: #ddd3c2; font-family: var(--mono); font-size: 11px; text-align: left; cursor: pointer; }
  .list button:hover { background: rgba(197, 160, 89, .08); }
  .list button.target { background: rgba(197, 160, 89, .14); box-shadow: inset 2px 0 0 var(--brass); }
  .warn { margin-left: auto; font-family: var(--cond); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #e8b06a; white-space: nowrap; }
  .hint { margin: 0 0 8px; font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s { color: var(--faint); font-size: 10px; }
  .empty { padding: 7px 8px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .saverow { display: flex; gap: 7px; margin-bottom: 6px; }
  .saverow input {
    flex: 1; min-width: 0; background: #0d0b0a; border: 1px solid var(--edge); border-radius: 3px;
    color: #efe6d7; font-family: var(--mono); font-size: 11px; padding: 4px 7px;
  }
  .saverow input:focus { outline: 1px solid var(--brass); }
  .save.armed { border-color: #8a5a2a; color: #e8b06a; }
  .busy, .okline, .err { margin: 3px 0; font-family: var(--mono); font-size: 10px; }
  .busy { color: #cfe3c9; }
  .okline { color: #9ed492; }
  .err { color: #e8a08f; padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; border-radius: 3px; }
</style>
