<script lang="ts">
  /**
   * The patch generator: intensity, what it may touch, and the roll.
   *
   * It is a strip under the top bar rather than a panel floating over the
   * page, because rolling is something you do repeatedly while watching the
   * patch change — a docked panel would cover the OLED sentence and the first
   * column of the very thing it is rolling. In the flow it pushes the editor
   * down instead, and everything stays readable while you re-roll.
   *
   * The arpeggiator's own note Randomiser is a different thing entirely and
   * keeps its panel in the grid; this one never uses that word.
   */
  import { INTENSITIES, RANDOM_SECTIONS } from '../core/random'
  import { HELP } from './help'
  import { editor } from './state/editor.svelte'
  import { INTENSITY_LABELS, SECTION_LABELS, randomizer } from './state/randomize.svelte'
</script>

{#if randomizer.open}
  <section class="gen" data-testid="randomize-panel" aria-label="Patch generator">
    <div class="grp">
      <span class="lab" title={HELP['randomize.intensity']}>Intensity</span>
      <div class="levels" data-testid="randomize-intensity">
        {#each INTENSITIES as level (level)}
          <button
            type="button"
            class:on={randomizer.intensity === level}
            data-level={level}
            aria-pressed={randomizer.intensity === level}
            onclick={() => (randomizer.intensity = level)}
          >{INTENSITY_LABELS[level]}</button>
        {/each}
      </div>
    </div>

    <div class="grp scope">
      <span class="lab" title={HELP['randomize.scope']}>Scope</span>
      {#each RANDOM_SECTIONS as id (id)}
        <button
          type="button"
          class="chk"
          class:on={randomizer.sections.includes(id)}
          data-section={id}
          aria-pressed={randomizer.sections.includes(id)}
          onclick={() => randomizer.toggleSection(id)}
        >{SECTION_LABELS[id]}</button>
      {/each}
      <span class="acts">
        <button type="button" onclick={() => randomizer.all()}>all</button>
        <button type="button" onclick={() => randomizer.none()}>none</button>
        <button type="button" data-testid="randomize-scope-reset" onclick={() => randomizer.reset()}>reset</button>
      </span>
    </div>

    <div class="grp go">
      <button
        type="button"
        class="btn roll"
        data-testid="randomize-roll"
        disabled={!randomizer.ready}
        title={HELP['randomize.roll']}
        onclick={() => randomizer.roll()}
      >Roll</button>
      <button
        type="button"
        class="btn"
        data-testid="randomize-again"
        disabled={!randomizer.ready || randomizer.lastSeed === null}
        title={HELP['randomize.again']}
        onclick={() => randomizer.roll(true)}
      >Same seed</button>
      <label class="seed" title={HELP['randomize.seed']}>
        <span class="lab">Seed</span>
        <input
          data-testid="randomize-seed"
          placeholder={randomizer.seedText || 'random'}
          bind:value={randomizer.seedInput}
          spellcheck="false"
          autocomplete="off"
        />
      </label>
      {#if editor.preset && editor.preset.tag !== 'kit'}
        <button
          type="button"
          class="chk"
          class:on={randomizer.nameIt}
          data-testid="randomize-name"
          aria-pressed={randomizer.nameIt}
          title={HELP['randomize.name']}
          onclick={() => (randomizer.nameIt = !randomizer.nameIt)}
        >Name it</button>
      {/if}
    </div>

    {#if randomizer.target}
      <!-- In a kit there is no "the preset" to roll: say which row gets it. -->
      <p class="note" data-testid="randomize-target">Rolls <b>{randomizer.target}</b></p>
    {/if}

    <button type="button" class="x" aria-label="Close" data-testid="randomize-close" onclick={() => (randomizer.open = false)}>×</button>
  </section>
{/if}

<style>
  /*
   * A strip, not a panel: it spans the page the way the top bar does, and the
   * groups wrap onto a second line on a narrow window rather than scrolling.
   */
  /*
   * Groups align at the top, not the middle: Scope may wrap its all/none/reset
   * onto a second line, and centring that taller group would lift its first
   * row above the others. Every control on a first row is 23px tall, so tops
   * in line means rows in line.
   */
  .gen {
    display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 16px; position: relative;
    margin: 8px 0 0; padding: 8px 34px 8px 11px; border: 1px solid var(--edge-hi); border-left: 2px solid var(--brass);
    border-radius: 3px; background: linear-gradient(180deg, var(--panel2), var(--panel));
  }
  .grp { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .grp.scope { flex: 1; min-width: 260px; }
  .lab { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
  /* Not `.seg`: the app-wide one (`theme.css`) carries a top margin for the panels it lives in. */
  .levels { display: flex; gap: 3px; }
  .levels button {
    height: 23px; padding: 0 9px; border: 1px solid var(--edge); background: #1b1815; color: var(--muted);
    border-radius: 3px; font-family: var(--cond); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; cursor: pointer;
  }
  .levels button:hover { color: var(--text); }
  .levels button.on { border-color: var(--brass); color: var(--brass-hi); background: #241d13; }
  .chk {
    height: 23px; padding: 0 8px; border: 1px solid var(--edge); background: #1b1815; color: var(--faint);
    border-radius: 3px; font-family: var(--cond); font-size: 10.5px; letter-spacing: .05em; white-space: nowrap; cursor: pointer;
  }
  .chk:hover { color: var(--muted); }
  .chk.on { border-color: #4a6a44; background: #141a13; color: #a9d9a1; }
  .acts { display: flex; gap: 7px; margin-left: 4px; }
  .acts button { background: none; border: 0; padding: 0; color: var(--faint); font-family: var(--cond); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
  .acts button:hover { color: var(--brass); }
  .go { gap: 6px; }
  .btn {
    height: 23px; padding: 0 14px; border: 1px solid var(--edge-hi); background: #1b1815; color: var(--muted);
    border-radius: 3px; font-family: var(--cond); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer;
  }
  .btn:hover:not(:disabled) { color: var(--text); border-color: var(--brass); }
  .btn:disabled { opacity: .4; cursor: default; }
  .btn.roll { border-color: #8a5a2a; color: #e8b06a; }
  .seed { display: flex; align-items: center; gap: 5px; }
  .seed input {
    width: 82px; height: 23px; padding: 0 7px; border: 1px solid var(--edge); background: #100e0d; color: #ddd4c4;
    border-radius: 3px; font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
  }
  .seed input:focus { outline: none; border-color: var(--brass); }
  .note { flex-basis: 100%; margin: 0; font-family: var(--cond); font-size: 10.5px; line-height: 1.4; color: var(--faint); }
  .note b { color: var(--muted); font-weight: 600; }
  /* On the first row's centre line: the strip's top padding, then a box the height of every first-row control. */
  .x { position: absolute; top: 8px; right: 8px; height: 23px; display: flex; align-items: center; padding: 0 2px; background: none; border: 0; color: var(--faint); font-size: 15px; line-height: 1; cursor: pointer; }
  .x:hover { color: var(--text); }
</style>
