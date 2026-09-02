<script lang="ts">
  /** Nothing loaded: open a file, drop one, connect to the Deluge, or follow it. */
  import { follow } from './state/follow.svelte'
</script>

<div class="empty">
  <p class="lead">Click <b>New Synth</b> or <b>New Kit</b> to start a preset from the Deluge's own init presets.</p>
  <p class="lead alt">Drop a <b>folder of WAVs</b> anywhere on the page to build a kit from samples.</p>
  <p class="lead alt">Click <b>Open File</b> to open a Deluge <b>SYNTHS/</b> or <b>KITS/</b> preset, or drop one anywhere on the page.</p>
  <p class="lead alt">Or click <b>Open from Deluge</b> to browse your Deluge over USB in either Chrome or Edge.</p>
  {#if follow.available}
    <!-- Follow Mode needs no file of its own: it starts one. Worth saying
         here, because the mode is the fastest way in for someone whose sound
         is already on the instrument. -->
    <p class="lead alt">Or click <b>Follow Mode</b> to start a synth and have the Deluge's own knob moves fill it in as you turn them.</p>
  {/if}
</div>

<style>
  .empty { margin: 24px auto 0; max-width: 720px; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge); border-radius: 4px; padding: 18px 20px 20px; }
  .lead { font-family: var(--cond); font-size: 18px; letter-spacing: .03em; color: #e9e2d6; margin: 0; }
  .lead b { color: var(--brass); }
  .lead.alt { margin-top: 10px; }
</style>
