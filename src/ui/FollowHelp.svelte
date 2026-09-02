<script lang="ts">
  /**
   * What Follow Mode is doing, at a size you can read.
   *
   * This used to be a paragraph wedged into the mode's header, where on a wide
   * screen it ran to a single long line nobody read and on a narrow one it
   * pushed the controls down. It is the same text; it is only no longer in the
   * way. Dismissed the way the other dialogs here are: the ×, or Escape
   * (`App.svelte`).
   */
  import { editor } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'

  interface Props { onclose: () => void }
  let { onclose }: Props = $props()
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose() }} />

<div class="veil" role="dialog" aria-modal="true" aria-label="MIDI Follow help" data-testid="follow-help">
  <aside class="sheet">
    <header>
      <b>MIDI Follow</b>
      <button type="button" class="x" aria-label="Close" onclick={onclose}>×</button>
    </header>

    <div class="body">
      <h3>What this Deluge is set to</h3>
      <p>
        Which channel MIDI-Follow is on is the one thing this mode cannot learn over MIDI. The instrument
        writes it down, though, so it can be read off the card rather than guessed at.
      </p>
      <p>
        <button type="button" class="btn go" data-testid="follow-check" disabled={follow.checking} onclick={() => void follow.checkDevice()}>
          {follow.checking ? 'Reading…' : 'Read the Deluge’s settings'}
        </button>
      </p>
      {#if follow.settingsError}
        <p class="warn" role="alert" data-testid="follow-check-error">{follow.settingsError}</p>
      {:else if follow.settings}
        <ul data-testid="follow-check-result">
          {#each follow.settings.channels as c (c.slot)}
            <li><b>Channel {c.slot.toUpperCase()}</b> is {c.label}{c.channel === null ? '' : `, on MIDI channel ${c.channel}`}.</li>
          {/each}
        </ul>
        {#each follow.settingsAdvice as line, i (i)}
          <p class:warn={line.includes('MPE zone') || line.includes('feedback is off') || line.includes('within a second')}>{line}</p>
        {/each}
      {/if}

      <h3>Listening</h3>
      <p>
        Turn a gold encoder on the Deluge and the matching control moves here. The instrument needs a
        feedback channel set under <code>SETTINGS &gt; MIDI &gt; MIDI-Follow &gt; Feedback</code>.
        {#if follow.ports.length}This is listening on {follow.ports.join(', ')}.{/if}
      </p>
      <p>
        That setting names one of MIDI-Follow's own channels, <b>A</b>, <b>B</b> or <b>C</b>, and each of
        those is itself set under <code>MIDI-Follow &gt; Channel</code>. It does not have to be a number.
        Set to <b>MPE Lower Zone</b> the feedback arrives on MIDI channel 1, and set to
        <b>MPE Upper Zone</b> it arrives on channel 16, because the instrument sends a zone's feedback on
        that zone's master channel. Leaving Channel here on <b>Any</b> covers all of it.
      </p>
      <p>
        A follow CC says a value changed on the instrument, never which sound it belongs to. These edits
        land in <b>{follow.onBus ? 'the kit bus' : editor.fileName || 'the loaded preset'}</b> whether or
        not that is what the Deluge has open, and like every edit here nothing is written until you save.
      </p>

      <h3>What is on this page</h3>
      <p>
        Only the parameters MIDI Follow can reach: the firmware's own default CC map for the selected
        firmware, in the same blocks and the same knobs as the full editor. A parameter the map does not
        cover is absent rather than greyed out.
      </p>

      <h3>Sending</h3>
      <p>
        Sending is the other direction, and it writes into the sound the Deluge has live. Moving a control
        here changes the instrument.
      </p>
      <p>
        The send channel defaults to <b>Heard</b>, which is whichever channel the instrument's feedback
        came in on. That is the one setting that is right whether the follow channel is a plain number or
        an MPE zone, and nothing is sent at all until something has been heard. Sends also go only to a
        port that names itself a Deluge, never to whatever MIDI device happens to be first.
      </p>
      <p class="warn">
        If you set the channel by hand, set it to one MIDI-Follow actually uses. A CC that misses
        MIDI-Follow is still a CC: it reaches the instrument's ordinary MIDI handling, where it can trip a
        learned command or be recorded into the active clip. Check
        <code>SETTINGS &gt; MIDI &gt; MIDI-Follow &gt; Channel</code>, or leave the channel on Heard.
      </p>
      <p>
        It lands exactly only with MIDI-Follow's takeover mode on <b>JUMP</b>, which is its default. On
        PICKUP or SCALE the instrument waits until the values meet. On RELATIVE it reads every value as an
        increment and will run away.
      </p>

      <h3>Kits</h3>
      <p>
        The instrument routes a kit clip's follow CCs by AFFECT ENTIRE: on, they reach the kit bus; off,
        the selected row's sound. Nothing on the wire says which, so the target switch here is set to
        match the instrument.
      </p>
    </div>

    <footer>
      <button type="button" class="btn" onclick={onclose}>Close</button>
    </footer>
  </aside>
</div>

<style>
  .veil { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(6, 5, 4, .72); }
  .sheet {
    width: min(620px, calc(100vw - 40px)); max-height: min(80vh, calc(100vh - 80px));
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, #171412, #100e0d); border: 1px solid var(--edge-hi); border-radius: 5px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .5); padding: 12px 16px 14px;
  }
  header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  header b { font-family: var(--cond); font-size: 12.5px; letter-spacing: .13em; text-transform: uppercase; color: var(--brass); }
  .x { margin-left: auto; background: none; border: 0; color: var(--faint); font-size: 15px; cursor: pointer; line-height: 1; }
  .x:hover { color: #e9e2d6; }
  .body { overflow-y: auto; padding-right: 4px; }
  h3 { font-family: var(--cond); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--brass); margin: 14px 0 4px; }
  h3:first-child { margin-top: 6px; }
  p { margin: 0 0 8px; font-size: 13px; line-height: 1.6; color: #ddd3c2; }
  p.warn { border-left: 2px solid #6b4a1c; padding-left: 10px; color: #e8b06a; }
  b { color: #f0e6d6; font-weight: 600; }
  code { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
  footer { display: flex; justify-content: flex-end; margin-top: 10px; }
  .btn { height: 24px; padding: 0 12px; border-radius: 3px; border: 1px solid var(--edge-hi); background: #141210; color: var(--muted); font-family: var(--cond); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .btn:hover { color: var(--text); border-color: var(--brass); }
  .btn.go { background: #1d1710; border-color: #6b4a1c; color: #e8b06a; }
  .btn:disabled { opacity: .5; cursor: default; }
  ul { margin: 0 0 8px; padding-left: 18px; }
  li { font-size: 13px; line-height: 1.6; color: #ddd3c2; margin-bottom: 2px; }
</style>
