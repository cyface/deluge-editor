<script lang="ts">
  /** The 16 gold-encoder assignments: 8 mod-button pages × 2 knobs, bottom knob first in the file. Shown, not edited. */
  import { paramLabel, type SoundElement } from '../../core/preset'
  import { modKnobs } from '../../core/preset/sound'
  import { sourceName } from '../sources'
  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const knobs = $derived(modKnobs(sound))
  const pages = $derived(Array.from({ length: Math.ceil(knobs.length / 2) }, (_, i) => knobs.slice(i * 2, i * 2 + 2)))
  const describe = (k: (typeof knobs)[number]) =>
    `${paramLabel(k.attrs.controlsParam ?? '?')}${k.attrs.patchAmountFromSource ? ` ← ${sourceName(k.attrs.patchAmountFromSource)}` : ''}`
</script>

{#if knobs.length}
  <div class="gold">
    {#each pages as page, i (i)}
      <div class="gpage">
        <div class="n">Page {i + 1}</div>
        {#each [...page].reverse() as k, j (j)}
          <div class="p">{describe(k)}</div>
        {/each}
      </div>
    {/each}
  </div>
  <p class="hint">A parameter on a gold encoder is drawn with a brass face. The assignments are positional in the file and are kept exactly as loaded.</p>
{:else}
  <p class="empty">No assignments in the file: the firmware's defaults apply.</p>
{/if}

<style>
  .gold { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0 0 4px; }
  .gpage { border: 1px solid var(--edge); border-radius: 3px; padding: 6px 7px; background: #1a1714; }
  .n { font-family: var(--cond); font-size: 9.5px; letter-spacing: .11em; text-transform: uppercase; color: var(--faint); margin-bottom: 3px; }
  .p { font-family: var(--mono); font-size: 10px; color: #cfc5b3; }
</style>
