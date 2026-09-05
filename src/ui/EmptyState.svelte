<script lang="ts">
  /** Nothing loaded: open a file, drop one, connect to the Deluge, follow it, or edit it live. */
  import { follow } from './state/follow.svelte'
  import { live } from './state/live.svelte'
</script>

<div class="empty">
  <p class="lead">Choose <b>New › Synth</b> or <b>New › Kit</b> to start a preset from the Deluge’s own init presets.</p>
  <p class="lead alt">Drop a <b>folder of WAVs</b> anywhere on the page to build a kit from samples.</p>
  <p class="lead alt">Choose <b>Open › From this computer</b> to open a Deluge <b>SYNTHS/</b> or <b>KITS/</b> preset, or drop one anywhere on the page.</p>
  <p class="lead alt">Or <b>Open › From Deluge</b> to browse your Deluge over USB in either Chrome or Edge.</p>
  {#if follow.available}
    <!-- Follow Mode needs no file of its own: it starts one. Worth saying
         here, because the mode is the fastest way in for someone whose sound
         is already on the instrument. -->
    <p class="lead alt">Or click <b>Follow Mode</b> to start a synth and have the Deluge fill it in: open a clip on the instrument and every mapped value arrives, then each knob turn as you make it.</p>
  {/if}
  {#if live.offered && !live.on}
    <!-- Live Edit needs no file either: it opens the one the Deluge has. -->
    <p class="lead alt">Or click <b>Live Edit</b> to open the sound the Deluge has in its clip and edit it there and here at once. Needs a Deluge whose firmware offers it.</p>
  {/if}
</div>

<style>
  .empty { margin: 24px auto 0; max-width: 720px; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge); border-radius: 4px; padding: 18px 20px 20px; }
  .lead { font-family: var(--cond); font-size: 18px; letter-spacing: .03em; color: #e9e2d6; margin: 0; }
  .lead b { color: var(--brass); }
  .lead.alt { margin-top: 10px; }
</style>
