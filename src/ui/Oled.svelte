<script lang="ts">
  import { summarise, summariseSound } from '../core/preset/summary'
  import { editor } from './state/editor.svelte'
  import Mark from './Mark.svelte'
  const s = $derived.by(() => {
    if (!editor.preset) return null
    // A kit shows its selected row's summary when a sound row is selected, else the kit's.
    if (editor.preset.tag === 'kit' && editor.sound) return summariseSound(editor.sound)
    return summarise(editor.preset)
  })
</script>

{#if s}
  <div class="oled">
    <Mark size={150} class="mark" />
    <div class="sent" data-testid="summary">{s.sentence}</div>
    <div class="chips">
      {#each s.chips as c, i (i)}<span class="chip" class:hl={i === 0}>{c}</span>{/each}
    </div>
  </div>
{/if}

<style>
  .oled { margin: 11px 0 0; background: var(--oled-bg); border: 1px solid #23201c; border-radius: 4px; position: relative; box-shadow: inset 0 0 34px rgba(70,150,100,.07), 0 1px 0 #262119; padding: 11px 14px; overflow: hidden; }
  .oled :global(.mark) { position: absolute; right: -16px; top: -24px; opacity: .05; color: #7fe8b0; pointer-events: none; }
  .sent { font-family: var(--pixel); font-size: 12.5px; line-height: 1.9; color: var(--oled); text-shadow: 0 0 8px rgba(150,240,190,.25); position: relative; }
  .chips { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 5px; position: relative; }
</style>
