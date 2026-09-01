<script lang="ts">
  import { ARP_ATTR_ORDER, SOUND_CHILD_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import { ensureParams, params } from '../../core/preset/sound'
  import { child, ensureChild, setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import Toggle from '../controls/Toggle.svelte'
  import { HELP } from '../help'
  import { editor } from '../state/editor.svelte'

  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)
  const arp = $derived(child(sound, 'arpeggiator'))
  const A = () => ensureChild(sound, 'arpeggiator', SOUND_CHILD_ORDER)
  const arpOn = $derived((arp?.attrs.arpMode ?? arp?.attrs.mode ?? 'off') !== 'off')
</script>

<!-- The device's RANDOMIZER menu, beside ARPEGGIATOR (gui/ui/menus.cpp:1961, tag
     beta). Every note-on passes through the Arpeggiator object even with the arp
     off, and the arp-off branch applies note probability, velocity spread and
     reverse (modulation/arpeggiator.cpp, the "Apply randomizer" branches ~197
     drums / ~361 synths) — the same split as RandomizerUnpatchedParam::isRelevant.
     The rest roll only while the arp runs, in any mode. -->
<div class="fields">
  <!-- Lock saves a cycle of rolls and replays it, so the pattern repeats
       (arpeggiator.cpp ~922, the locked*ProbArray attributes). Default false
       (arpeggiator.h:96, tag beta). -->
  <div class="f"><span class="lbl">Pattern</span><Toggle label="Lock" name="arpeggiator.randomizerLock" value={arp?.attrs.randomizerLock} fallback="0" title={HELP['arp.randomizerLock']} onchange={(v) => setAttr(A(), 'randomizerLock', v, ARP_ATTR_ORDER)} /></div>
</div>
<div class="h3">Every Note</div>
<div class="knobrow">
  <HexKnob el={params(sound)} ensure={P} attr="noteProbability" label="Note" order={SOUND_PARAM_ATTRS} {sound} />
  {#if editor.supports('arpSpread')}
    <HexKnob el={params(sound)} ensure={P} attr="spreadVelocity" label="Velocity" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
  {#if editor.supports('arpReverseGlideSwap')}
    <HexKnob el={params(sound)} ensure={P} attr="reverseProbability" label="Reverse" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
</div>
<div class="h3">Arp Only{#if !arpOn}<span class="note">arp is off</span>{/if}</div>
<div class="knobrow" class:asleep={!arpOn}>
  <HexKnob el={params(sound)} ensure={P} attr="bassProbability" label="Bass" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="chordProbability" label="Chord" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="chordPolyphony" label="Chord Poly" order={SOUND_PARAM_ATTRS} {sound} />
  {#if editor.supports('arpReverseGlideSwap')}
    <HexKnob el={params(sound)} ensure={P} attr="glideProbability" label="Glide" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="swapProbability" label="Swap" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
  <HexKnob el={params(sound)} ensure={P} attr="ratchetProbability" label="Ratchet Prob" order={SOUND_PARAM_ATTRS} {sound} />
  <HexKnob el={params(sound)} ensure={P} attr="ratchetAmount" label="Ratchets" order={SOUND_PARAM_ATTRS} {sound} />
  {#if editor.supports('arpSpread')}
    <HexKnob el={params(sound)} ensure={P} attr="spreadGate" label="Gate Spread" order={SOUND_PARAM_ATTRS} {sound} />
    <HexKnob el={params(sound)} ensure={P} attr="spreadOctave" label="Octave Spread" order={SOUND_PARAM_ATTRS} {sound} />
  {/if}
</div>

<style>
  /* Still editable — values load with the preset and wake when the arp is
     turned on — but visibly dormant while it's off. */
  .lbl { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .asleep { opacity: .55; }
  .note { font-family: var(--mono); font-size: 9px; letter-spacing: 0; text-transform: none; color: var(--faint); }
</style>
