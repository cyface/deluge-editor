<script lang="ts">
  /**
   * Follow Mode's header: whether it is listening and on what, the Send
   * switch and its channel, the kit target, the last message heard, and the
   * way to the help sheet. The grid of what the CCs reach is `FollowView`'s.
   */
  import { paramLabel } from '../core/preset'
  import Seg from './controls/Seg.svelte'
  import Status from './controls/Status.svelte'
  import { HELP, UI_HELP } from './help'
  import { follow } from './state/follow.svelte'

  interface Props {
    /** A kit is loaded, so the CCs can go to the bus or the selected row. */
    kit: boolean
    onhelp: () => void
  }
  let { kit, onhelp }: Props = $props()

  const onBus = $derived(follow.onBus)
  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  const sendChannels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  const lastLine = $derived.by(() => {
    const l = follow.last
    if (!l) return 'nothing heard yet'
    return `ch ${l.channel} · CC ${l.cc} = ${l.value} → ${l.param ? paramLabel(l.param) : 'unmapped'}`
  })
</script>

<section class="hdr" data-testid="follow-header">
  <div class="row">
    <span class="tag" class:live={follow.status === 'listening'}>
      {#if follow.status === 'listening'}<span class="dot pulse" aria-hidden="true"></span>{/if}
      {follow.status === 'listening' ? 'Following' : follow.status === 'error' ? 'Not listening' : 'Off'}
    </span>
    <label class="pick" title={HELP['follow.channel']}>
      Listen on
      <select data-testid="follow-channel" bind:value={follow.channel}>
        {#each channels as c (c)}<option value={c}>{c === 0 ? 'Any' : c}</option>{/each}
      </select>
    </label>
    <span class="rule" aria-hidden="true"></span>
    <!-- The other direction, and the one that can do harm: this writes into
         the sound the instrument has live (docs/decisions.md). It sits beside
         the listening channel because the two channels are the thing to get
         right, and a CC that misses Midi-Follow is still a CC the instrument
         acts on. -->
    <button
      type="button"
      class="btn small"
      class:send={follow.sending}
      data-testid="follow-send"
      aria-pressed={follow.sending}
      disabled={follow.sendPort === null}
      title={follow.sendPort === null ? UI_HELP['ui.follow.noOutput'] : HELP['follow.send']}
      onclick={() => (follow.sending = !follow.sending)}
    >Send</button>
    <label class="pick" title={HELP['follow.sendChannel']}>
      Send on
      <!-- Heard is the default and the only setting that is right whatever the
           instrument's follow channel is set to, an MPE zone included. -->
      <select data-testid="follow-send-channel" disabled={!follow.sending} bind:value={follow.sendChannel}>
        <option value="auto">Heard{follow.heardChannel === null ? '' : ` · ${follow.heardChannel}`}</option>
        {#each sendChannels as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
    {#if kit}
      <span class="rule" aria-hidden="true"></span>
      <!-- The instrument routes a kit clip's follow CCs by AFFECT ENTIRE: on,
           they reach the kit bus; off, the selected row's sound
           (`MidiFollow::getModelStackWithParamForKitClip`). Nothing on the wire
           says which, so it is set here to match the instrument. -->
      <Seg
        items={[
          { id: 'row', label: 'Selected row', attrs: { 'data-testid': 'follow-target-row' } },
          { id: 'bus', label: 'Kit bus', attrs: { 'data-testid': 'follow-target-bus' } },
        ]}
        selected={onBus ? 'bus' : 'row'}
        onselect={(t) => (follow.target = t)}
        label="Follow target"
        title={HELP['follow.target']}
        flush
      />
    {/if}
    <span class="last" data-testid="follow-last">{lastLine}</span>
    <button type="button" class="btn small" data-testid="follow-help-button" onclick={onhelp}>Help</button>
  </div>
  {#if follow.error}
    <Status kind="err" testid="follow-error">{follow.error}</Status>
  {:else if follow.sending}
    <!-- One line, only while the hazard is live. The rest of the explanation
         is behind the help button, where it is not in the way. -->
    <p class="sendwarn" data-testid="follow-send-warning">
      {#if follow.outChannel === null}
        Waiting to hear the Deluge before sending. Open a clip or turn a knob on the Deluge, and the
        channel its feedback arrives on becomes the channel sends go out on.
      {:else}
        Sending on {follow.sendPort} channel {follow.outChannel} — this changes the sound the Deluge has
        live.{#if !follow.deviceChecked} Read the Deluge’s settings from the help sheet if it does not
        respond: which of its USB ports a CC goes out on decides whether Midi-Follow accepts it.{/if}
      {/if}
    </p>
  {/if}
</section>

<style>
  .hdr { margin: 12px 0 0; border: 1px solid var(--edge); border-radius: 4px; background: linear-gradient(180deg, var(--panel2), var(--panel)); padding: 9px 12px 10px; }
  .row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .tag { display: inline-flex; align-items: center; gap: 7px; font-family: var(--cond); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
  .tag.live { color: var(--ok-text); }
  .pick { font-family: var(--cond); font-size: var(--lbl-m); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
  .pick select { background: var(--raised); border: 1px solid var(--edge-hi); border-radius: var(--r-s); color: var(--text); font-family: var(--mono); font-size: 10.5px; padding: 2px 4px; }
  .last { font-family: var(--mono); font-size: 10.5px; color: var(--muted); margin-left: auto; }
  .rule { width: 1px; height: 17px; background: var(--edge-hi); }
  /* Sending writes to the instrument, so it wears the warning colour the card
     panel uses for "this may not stay as you left it", not the calm green. */
  .btn.send { background: var(--warn-bg); border-color: var(--warn-edge); color: var(--warn-text); }
  .hdr :global(.msg) { margin: 8px 0 0; }
  /* The one line of prose the header keeps, and only while sending is on. */
  .sendwarn { margin: 8px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--warn-text); }
</style>
