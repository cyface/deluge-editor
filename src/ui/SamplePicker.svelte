<script lang="ts">
  /**
   * "Where is the sample?" — one file, from this computer, from the Deluge, or
   * at a path typed by hand. The same question the folder import asks, for the
   * single-sample half of the workflow: a kit row's one file, a synth's one
   * sample, and every add or change in the range editor.
   */
  import { card } from './state/card.svelte'
  import { samplePick as pick } from './state/samplepick.svelte'

  let fileInput: HTMLInputElement | undefined = $state()

  async function chooseLocal(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) await pick.useLocalFile(file)
  }
</script>

<div class="veil" role="dialog" aria-modal="true" aria-label="Choose a sample" data-testid="sample-picker">
  <div class="ask">
    <div class="ph">
      <h2>Sample for {pick.for}</h2>
      <button type="button" class="x" aria-label="Cancel" onclick={() => pick.cancel()}>×</button>
    </div>
    <p class="lede">
      A sample from this computer is copied to the card when the preset is saved; one already on the Deluge is used
      where it lies.
    </p>

    <input bind:this={fileInput} type="file" accept=".wav,audio/wav" hidden data-testid="sample-file-input" onchange={chooseLocal} />
    <div class="ways">
      <button type="button" class="btn go" data-testid="sample-source-local" disabled={!!pick.busy} onclick={() => fileInput?.click()}>
        On This Computer…
      </button>
      <button
        type="button"
        class="btn"
        data-testid="sample-source-card"
        disabled={!card.supported || !!pick.busy}
        title={card.supported ? 'Browse SAMPLES/ on the Deluge (connects first if needed)' : 'Web MIDI needs Chrome or Edge'}
        onclick={() => pick.browseCard()}
      >On the Deluge…</button>
      <button type="button" class="btn" data-testid="sample-cancel" onclick={() => pick.cancel()}>Cancel</button>
    </div>

    {#if pick.cardPath !== null}
      <div class="browser" data-testid="sample-card-browser">
        <div class="pathbar">
          <button type="button" class="btn small" onclick={() => pick.cardUp()} disabled={pick.cardPath === '/SAMPLES'} aria-label="Up">↑</button>
          <span class="path">{pick.cardPath}</span>
        </div>
        <ul class="list">
          {#each pick.cardEntries as e (e.name)}
            <li>
              {#if e.dir || /\.wav$/i.test(e.name)}
                <button type="button" class="entry" disabled={!!pick.busy} onclick={() => void pick.chooseCard(e)}>
                  {e.dir ? '▸ ' : ''}{e.name}
                </button>
              {:else}
                <span>{e.name}</span>
              {/if}
            </li>
          {:else}
            <li class="none">empty</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="typed">
      <span class="or">or the path on the card</span>
      <input
        type="text"
        data-testid="sample-path-input"
        placeholder="SAMPLES/Folder/sample.wav"
        aria-label="Path on the card"
        bind:value={pick.typed}
        onkeydown={(e) => { if (e.key === 'Enter') pick.useTyped() }}
      />
      <button type="button" class="btn small" data-testid="sample-path-use" disabled={!pick.typed.trim()} onclick={() => pick.useTyped()}>Use</button>
    </div>

    {#if pick.busy}<p class="busy" data-testid="sample-busy">{pick.busy}…</p>{/if}
    {#if pick.error}<p class="err" role="alert" data-testid="sample-error">{pick.error}</p>{/if}
  </div>
</div>

<style>
  .veil { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(6,5,4,.72); }
  .ask {
    width: min(520px, calc(100vw - 40px)); background: linear-gradient(180deg, var(--panel2), var(--panel));
    border: 1px solid var(--edge-hi); border-radius: 5px; padding: 12px 14px 14px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
  }
  .ph { display: flex; align-items: baseline; gap: 8px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
  .ph .x { margin-left: auto; background: none; border: 0; color: var(--faint); font-size: 15px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .ph .x:hover { color: var(--brass-hi); }
  .lede { margin: 7px 0 0; font-family: var(--cond); font-size: 11.5px; line-height: 1.45; color: var(--muted); }
  .ways { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px; }
  .typed { display: flex; align-items: center; gap: 7px; margin-top: 11px; }
  .typed .or { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
  .typed input { flex: 1; min-width: 0; background: #0c0b0a; border: 1px solid var(--edge-hi); border-radius: 3px; color: #ddd4c4; font-family: var(--mono); font-size: 11px; height: 26px; padding: 0 7px; }
  .browser { margin-top: 10px; border: 1px solid var(--edge); border-radius: 3px; padding: 7px 8px; background: #0d0b0a; }
  .pathbar { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .path { flex: 1; min-width: 0; font-family: var(--mono); font-size: 11px; color: #cfe3c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { list-style: none; margin: 0; padding: 0; max-height: 210px; overflow-y: auto; }
  .list li { border-bottom: 1px solid rgba(255,255,255,.04); }
  .list li:last-child { border-bottom: 0; }
  .list button, .list span { display: block; width: 100%; padding: 4px 6px; background: none; border: 0; color: #ddd3c2; font-family: var(--mono); font-size: 11px; text-align: left; box-sizing: border-box; }
  .list button { cursor: pointer; }
  .list button:hover:not(:disabled) { background: rgba(197,160,89,.08); }
  .list span { color: var(--faint); }
  .none { padding: 4px 6px; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .busy { margin: 9px 0 0; font-family: var(--mono); font-size: 10.5px; color: #cfe3c9; }
  .err { margin: 9px 0 0; padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; color: #e8a08f; font-family: var(--mono); font-size: 10.5px; border-radius: 3px; }
</style>
