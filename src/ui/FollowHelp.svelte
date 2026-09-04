<script lang="ts">
  /**
   * What Follow Mode is doing, at a size you can read.
   *
   * This used to be a paragraph wedged into the mode's header, where on a wide
   * screen it ran to a single long line nobody read and on a narrow one it
   * pushed the controls down. It is the same text; it is only no longer in the
   * way. Dismissed the way the other dialogs here are: the ×, or Escape
   * (`App.svelte`).
   *
   * Order is the order a first-time user needs it: set the Deluge up, then the
   * browser, then what listening and sending do, then the diagnostic readout,
   * which docs/decisions.md describes as something you consult when things go
   * wrong. Menu names are written as the OLED shows them at community 1.3.0
   * (`STRING_FOR_FOLLOW_TITLE` "Midi-Follow", `STRING_FOR_FOLLOW_CHANNEL_A`
   * "Channel A", `STRING_FOR_FOLLOW_FEEDBACK_FILTER` "Filter Responses",
   * `STRING_FOR_TAKEOVER` with values Jump / Pickup / Scale / Relative;
   * `l10n/english.json` at the `beta` tag); a 7-segment Deluge shows FOLO.
   * That the whole page arrives when a clip is opened: `View::sendMidiFollowFeedback`
   * (`gui/views/view.cpp:1738-1747`) walks every mapped CC on a clip change and
   * sends only in a clip context.
   */
  import { editor } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'

  interface Props { onclose: () => void }
  let { onclose }: Props = $props()
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose() }} />

<div class="veil" role="dialog" aria-modal="true" aria-label="Follow Mode help" data-testid="follow-help">
  <aside class="sheet">
    <header>
      <b>Follow Mode</b>
      <button type="button" class="x" aria-label="Close" onclick={onclose}>×</button>
    </header>

    <div class="body">
      <h3>Set up the Deluge (once)</h3>
      <p>
        On the Deluge, hold SHIFT and press SELECT for Settings, then <b>MIDI › Midi-Follow</b> (on a
        7-segment Deluge: <b>FOLO</b>).
      </p>
      <ol>
        <li>
          <b>Channel › Channel A</b> — turn it to a MIDI channel, say 1. Out of the box A, B and C are all
          <i>Channel unassigned</i>, and nothing is followed until one has a channel.
        </li>
        <li>
          <b>Feedback › Channel</b> — set it to <b>Channel A</b> (the default is NONE). This is what makes the
          Deluge report its own changes.
        </li>
        <li>
          Leave <b>Feedback › Filter Responses</b> off and <b>MIDI › Takeover</b> on <b>Jump</b>; both are the
          defaults. What they do is under <i>Sending</i>.
        </li>
      </ol>
      <p>
        Midi-Follow exists on community firmware 1.1.0 and later. With an official-firmware preset loaded the
        Follow Mode button is not offered.
      </p>

      <h3>In the browser</h3>
      <p>
        Chrome or Edge, over USB. Follow Mode listens on every input named Deluge{#if follow.ports.length} —
        right now {follow.ports.join(', ')}{/if}. Allow MIDI access when the browser asks; allow SysEx too
        if you want the settings check at the bottom of this sheet.
      </p>

      <h3>Listening</h3>
      <p>
        Open the clip on the Deluge whose sound this is, and every mapped value arrives at once. After that
        each knob turn, menu edit or automation move arrives as it happens. The Deluge reports only from a
        clip view; nothing arrives from song or arranger view.
      </p>
      <p>
        The page shows only what Midi-Follow can reach: the firmware’s default CC map, as the same knobs in
        the same blocks. Envelopes and LFOs tab to whichever one the Deluge last touched. The header shows
        the last message heard — channel, CC, value and the parameter it moved; <i>unmapped</i> means this
        firmware’s map has no parameter for that CC.
      </p>
      <p>
        These edits land in <b>{follow.onBus ? 'the kit bus' : editor.fileName || 'the loaded preset'}</b>,
        whether or not that is the sound the Deluge has open. A follow CC never says which sound it belongs
        to, so check before you turn. Like every edit here, nothing is written until you save.
      </p>
      <p>
        Leave <b>Listen on</b> at <i>Any</i> unless another device sends CCs on the same port. (If Channel A
        is an MPE zone rather than a number, feedback arrives on channel 1 for the lower zone or 16 for the
        upper; <i>Any</i> covers both.)
      </p>

      <h3>Sending</h3>
      <p>
        <b>Send</b> plays your moves back at the Deluge, into the sound it has live, as you make them. Only
        what you move goes out; switching the mode on never pushes the file. It goes to one Deluge port and
        to nothing else, and only once the Deluge has been heard: <b>Send on</b> defaults to <i>Heard</i>,
        the channel its feedback arrived on. There is no undo on the Deluge, so keep Send off until you are
        sure the loaded file is the sound it has open.
      </p>
      <p class="warn">
        Set the channel by hand only to one Midi-Follow uses: Channel A, B or C. On any other channel a CC
        is still a CC. It reaches the Deluge’s ordinary MIDI handling, where it can trip a learned command
        or be recorded into the clip.
      </p>
      <p>Two Deluge settings decide what a send does:</p>
      <ul>
        <li>
          <b>MIDI › Takeover.</b> <i>Jump</i> (the default) takes the value outright. <i>Pickup</i> and
          <i>Scale</i> wait until the Deluge’s knob and yours meet. <i>Relative</i> reads every value as a
          nudge, so absolute sends run away; set it to Jump.
        </li>
        <li>
          <b>Midi-Follow › Feedback › Filter Responses.</b> On, the Deluge ignores any CC number it sent
          itself within the last second: a knob dragged here moves the sound once, then goes quiet for a
          second. Turn it off for two-way editing.
        </li>
      </ul>

      <h3>Kits</h3>
      <p>
        A kit clip’s follow CCs go either to the kit as a whole or to one row, decided by the
        <b>AFFECT ENTIRE</b> light on the Deluge. Nothing in the CC says which, so set <b>Kit bus</b> or
        <b>Selected row</b> here to match, and select the same row in the Rows table as on the Deluge.
      </p>

      <h3>Check what this Deluge is set to</h3>
      <p>
        Which channel Midi-Follow is on is the one thing this mode cannot hear. The Deluge writes it to
        <code>SETTINGS/MIDIFollow.XML</code>; this reads it off the card over the same USB connection
        (community firmware 1.3.0 or later) and works out which of the Deluge’s USB ports, and which channel,
        will accept a send.
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
          <p class:warn={line.level === 'warn'}>{line.text}</p>
        {/each}
      {/if}
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
  i { color: #f0e6d6; }
  code { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
  footer { display: flex; justify-content: flex-end; margin-top: 10px; }
  .btn { height: 24px; padding: 0 12px; border-radius: 3px; border: 1px solid var(--edge-hi); background: #141210; color: var(--muted); font-family: var(--cond); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
  .btn:hover { color: var(--text); border-color: var(--brass); }
  .btn.go { background: #1d1710; border-color: #6b4a1c; color: #e8b06a; }
  .btn:disabled { opacity: .5; cursor: default; }
  ul, ol { margin: 0 0 8px; padding-left: 18px; }
  li { font-size: 13px; line-height: 1.6; color: #ddd3c2; margin-bottom: 2px; }
</style>
