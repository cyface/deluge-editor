<script lang="ts">
  /**
   * Nothing loaded: the ways to start, as tiles (issue #38). The page's job is
   * the first action, so it offers the actions rather than describing where
   * the bar keeps them. Laid out like the bar's New and Open menus, in their
   * words, and each tile calls what its menu item calls — so the page teaches
   * the bar by being the same thing.
   */
  import { card } from './state/card.svelte'
  import { follow } from './state/follow.svelte'
  import { live } from './state/live.svelte'
  import { midiTip } from './copy'
  import { UI_HELP } from './help'
  import { openFile, openRecent, startNew } from './start'
  import { recent } from './state/recent.svelte'
</script>

<div class="land" data-testid="landing">
  <div class="groups">
    <section aria-labelledby="land-new">
      <h2 id="land-new">New</h2>
      <!-- Randomize is New's third item but not a tile: it is a way to vary a
           preset more than a way to start one, and the page offers no more
           ways in than the menu. -->
      <button type="button" class="tile" data-testid="empty-new-synth" title={UI_HELP['ui.new.synth']} onclick={() => startNew('synth')}>
        <span class="t">Synth</span><span class="d">from the Deluge’s own init preset</span>
      </button>
      <button type="button" class="tile" data-testid="empty-new-kit" title={UI_HELP['ui.new.kit']} onclick={() => startNew('kit')}>
        <span class="t">Kit</span><span class="d">from its blank kit, then drop in a folder of WAVs</span>
      </button>
    </section>
    <section aria-labelledby="land-open">
      <h2 id="land-open">Open</h2>
      <button type="button" class="tile" data-testid="empty-file-open-button" title={UI_HELP['ui.open.file']} onclick={openFile}>
        <span class="t">From this computer</span><span class="d">a preset XML from SYNTHS/ or KITS/</span>
      </button>
      <button
        type="button"
        class="tile"
        data-testid="empty-card-open-button"
        title={midiTip(UI_HELP['ui.open.card'], card.supported)}
        onclick={() => card.openPanel('open')}
      >
        <span class="t">From Deluge</span><span class="d">browse its card over USB, in Chrome or Edge</span>
      </button>
      <!-- Open › Recent, as a list under the tiles: the same entries and the
           same action as the menu's. Rows, not tiles — they are many and
           alike, and a returning user scans them by name. Absent until there
           is something in it; the menu is where an empty list is shown. -->
      {#if recent.entries.length}
        <h3>Recent</h3>
        <ul class="recent" data-testid="landing-recent">
          {#each recent.entries as r, i (r.at + ':' + i)}
            <li>
              <button
                type="button"
                data-testid="landing-recent-{i}"
                disabled={(r.kind === 'deluge' && !card.supported) || !!card.busy}
                title={r.kind === 'deluge' ? midiTip(`Open ${r.path} from the Deluge`, card.supported) : `Open ${r.name} from this computer`}
                onclick={() => void openRecent(r)}
              >
                <span class="n">{r.name}</span>
                <span class="w">{r.kind === 'deluge' ? (r.path.slice(1, r.path.lastIndexOf('/')) || 'card root') : 'this computer'}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
  <!-- Drop is the one way in that isn't a click, so it is a sentence, not a tile. -->
  <p class="aside">Or drop a preset, or a folder of WAVs, anywhere on the page.</p>
  <!-- The modes are sentences too: each is a way of working with the Deluge
       rather than a way to start, and each already has its button on the bar.
       Both need no file of their own — Follow starts one, Live Edit opens the
       Deluge's — so they are worth a line here. -->
  {#if follow.available}
    <p class="aside"><b>Follow Mode</b> starts a synth and lets the Deluge fill it in, knob by knob.</p>
  {/if}
  {#if live.offered && !live.on}
    <p class="aside"><b>Live Edit</b> opens the sound in the Deluge’s clip, to edit it there and here at once.</p>
  {/if}
</div>

<style>
  .land { margin: 36px auto 0; width: 100%; max-width: 720px; }
  /* Whitespace does the grouping: the gap between New and Open is three times the gap between tiles. */
  .groups { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
  section { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  h2 { margin: 0 0 -2px 2px; font-family: var(--cond); font-size: var(--lbl-l); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  /* A tile is a big button, not a card with a button in it: the whole face is the target. */
  .tile {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-height: 78px; padding: 14px 16px; text-align: left; cursor: pointer;
    background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge-hi); border-radius: var(--r-l);
  }
  .tile:hover { border-color: var(--brass-dim); background: linear-gradient(180deg, #221d17, #161310); }
  .tile:active { background: var(--raised); }
  .t { font-family: var(--cond); font-size: 21px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--brass); }
  .tile:hover .t { color: var(--brass-hi); }
  .d { font-size: 12.5px; color: var(--muted); }
  h3 { margin: 6px 0 -4px 2px; font-family: var(--cond); font-size: 10.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
  .recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .recent button {
    display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 5px 8px; text-align: left; cursor: pointer;
    background: transparent; border: 0; border-radius: var(--r-s);
  }
  .recent button:hover:not(:disabled), .recent button:focus-visible { background: #221d17; outline: none; }
  .recent button:disabled { opacity: .45; cursor: default; }
  .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--cond); font-size: 13.5px; letter-spacing: .04em; color: var(--text-hi); }
  .recent button:hover:not(:disabled) .n { color: var(--brass-hi); }
  .w { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: 10px; color: var(--faint); }
  .aside { margin: 26px 0 0; text-align: center; font-family: var(--cond); font-size: 14px; letter-spacing: .03em; color: var(--muted); }
  .aside + .aside { margin-top: 8px; }
  .aside b { color: var(--text-hi); font-weight: 600; }
  @media (max-width: 640px) {
    .land { margin-top: 22px; }
    .groups { grid-template-columns: 1fr; gap: 22px; }
  }
</style>
