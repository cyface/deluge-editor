# Editor UI

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

## Tooltip copy is one cited table, keyed the way the file names parameters

Every control says what it does on hover (issue #20), and all of that copy
lives in `src/ui/help.ts` rather than beside the markup. Two reasons, both
about keeping it true.

The first is the citation bar. A tooltip is a claim about the instrument, so
it is held to the same standard as `FEATURES` and `params/scale.ts`: it says
what *this firmware* does, cited in the table's comments — the firmware's own
menu documentation (`docs/menus/**`, upstream/community) where it exists, and
firmware source where it doesn't. "Analog delay darkens the repeats" is a
fact about `delay.analog`; "warm analogue character" is synth-shop copy and
does not belong. Entries that would be guesses were left out rather than
filled in, the same rule an uncited `FEATURES` entry gets.

The second is the key. Knob copy is keyed by the **parameter name a file uses
for that parameter** — a cable's `destination`, a gold knob's `controlsParam`
(`core/preset/params.ts`) — and `HexKnob` looks up its own destination. So one
entry covers LPF Freq wherever it is shown, the numbered envelopes and LFOs
are matched rather than written out four times each (`paramHelp`), and a
description can never drift between two panels showing the same parameter.
Everything that isn't a patchable parameter — selects, toggles, number fields,
the polarity buttons, the panels themselves — is keyed by a slug in the same
file. The kit bus is the one place the same knob means something different, so
`KitGroup` appends one sentence (`KIT_BUS_NOTE`) instead of keeping a second
copy of the text.

**Descriptions stack with the default markers, they don't replace them.** What
a control does and what its blank means are different facts, and a control the
file omits has both: the knob and the number field join the two with a blank
line. Before this pass a `title` silently hid the "not in the file" hint, and
the wavefolder knob — the one control that had a description — had no way to
say both.

The test is the sweep, not a sample: `help.test.ts` asserts every parameter
name the UI can show has copy and that none of it grows past a hint, and the
e2e walks every knob, select, toggle and number field in the rendered panels
of a synth and a kit and fails on the first one with nothing to say.

## A graph is drawn where a picture is the control, and it is a sketch

Four panels draw what their controls do rather than only numbering them: the
filter response, the ADSR overlay, the LFO shapes (issue #35) and the
oscillators' pulse width (issue #36). All four are the same components in the
full editor and in Follow Mode, over the same values, and all four are
draggable, so a knob that moved on the instrument redraws its own picture.

All four are worked the same way: a handle is grabbed and dragged, and
pressing the drawing itself does nothing — the two new ones put theirs on a
track along the bottom edge rather than floating it in the plot, because their
x axis is time and a value cannot share it.

The maths behind each is *illustrative*, and each says so in its header
comment — `FilterGraph` set the precedent ("menu value → 20 Hz…20 kHz, not the
firmware's filter model"), and the LFO's random shapes and the pulse graph's
band-limiting are the same kind of approximation. What is **not** a sketch is
anything the graph puts a number on. Those come from
`src/core/params/lfo.ts` and `src/core/params/pulse.ts`, which are the
firmware's own integer arithmetic under test, held to the same bar as
`params/scale.ts`.

**An LFO rate is shown in hertz, which the Deluge never shows.** The
instrument's menu says 0–50 like every other patched parameter. The frequency
is derived, not invented: `getExp(121739, presetValue × 2^30 >> 32)` is the
phase increment `LFO::render` advances a uint32 phase by each sample
(`Sound::getGlobalLFOPhaseIncrement`, `Voice::getLocalLFOPhaseIncrement`,
`Patcher::recalculateFinalValueForParamWithNoCables`, `getParamNeutralValue`),
so at 44.1 kHz one cycle is 2^32 / that many samples. It comes out at just
under sixteen octaves: menu 0 is one cycle in 205 seconds, menu 25 is 1.25 Hz,
menu 50 is 320 Hz. The knob still reads 0–50; the graph is the only place the
derived number appears, and the tests pin it to the firmware's own values.

**A synced LFO gets no frequency at all.** Its phase increment comes from
`playbackHandler.getTimePerInternalTickInverse()`, so the speed is the song's
tempo and a preset file does not carry one. Rather than guess a tempo, the
graph draws its axis in cycles and names the sync note length.

**And its Rate knob is disabled, not just annotated.** While a sync level is
set the firmware never reads the rate parameter — `getGlobalLFOPhaseIncrement`
and `getLocalLFOPhaseIncrement` return the tempo-derived increment instead —
and it refuses cables to it (`Sound::maySourcePatchToParam`,
`GLOBAL_LFO_FREQ_1` → DISALLOWED), so the right-click cable menu goes too.
This is one of two places the editor greys a control rather than removing
it, and the exception is deliberate: the value is still in the file and still
round-trips, and the difference between "there is no such control" and "this
control is not being read right now" is exactly what the user needs to know.
Removing it would leave the sync setting looking like it had eaten the rate.
A knob that turns and changes nothing is the worst of the three.

The other is the Randomizer panel's **Arp Only** row (bass, chord, glide
probabilities), dimmed with the note "arp is off" while the arpeggiator is
off. Same reasoning, one difference: these knobs stay live, because the
natural order of work is to set the odds and then switch the arp on, and the
row says in words why nothing is audible yet.

**Pulse width is drawn because its name misleads.** On the Deluge it is not a
square-wave control and, for the shapes that are not squares, not a duty cycle:
`Oscillator::renderOsc` runs the wave at `1 + pulseWidth / 2^31` times the
note's rate and hard-syncs it back, so a saw at full pulse width is two saws in
the space of one. Zero is *off* rather than a 50% square
(`doPulseWave = (pulseWidth != 0)`), and Osc Sync takes the control away from
every shape but the mathematical square (`doPulseWave = (pulseWidth &&
!doOscSync)`) — the knob stays, because the firmware's menu keeps offering it,
and the graph says why it does nothing.

The same pass made the knob follow `PulseWidth::isRelevant` instead of its own
list: no pulse width in FM mode, none for a sample or an audio input, and a
wavetable gets one only once it has a file. DX7 is left out although the menu
offers it, because a DX7 oscillator never reaches this renderer at all —
`Voice::render` hands it to `dxVoice->compute`, so the control is inert.

**Mod FX knobs follow the same rule, for the same reason.** The slot has four
controls and eight things it can be, and most of the eight read only two of
them. The firmware's own menu says which: every item under
`gui/menu_item/mod_fx/` carries an `isRelevant` (upstream/community bef6d9df,
identical in the fork), so on the instrument a flanger's menu has no Depth and
a chorus's has no Feedback. `src/core/params/modfx.ts` is that table. The
render path is the check that it is not merely tidying —
`ModFXProcessor::setupModFXWFeedback` gives a flanger the constant
`kFlangerAmplitude` and never reads `modFXDepth`, and `setupChorus` reads the
offset but no feedback at all. Grain also renames three of the four, so the
labels come from `modfx::getParamName` rather than from us: its depth is a
Mix, its feedback a Pitch Spread, its offset a Density.

With the type off there are no knobs, and the panel is the select alone. The
stored values stay in the file and round-trip untouched either way; this only
decides what is worth showing.

**And Follow Mode carries the type select, though follow cannot reach it.**
Mod FX type is a member of `ModControllableAudio`, not a modulation param, so
no CC addresses it and no feedback reports it — the wire never says the type
changed, and the editor cannot notice mod FX coming back on. That is exactly
why the select is allowed onto a page whose rule is "only the parameters MIDI
Follow can reach". It is not a fifth parameter, it is the gate on the other
four, and without it turning Mod FX back on would mean leaving the mode to do
it. The panel keeps its place in the grid even at zero CCs, and says in one
line that the CCs change nothing while the slot is off.

## The bar's commands are menus; its modes are buttons

The top bar had grown a button per feature — ten of them by issue #37, and
the file name, the one thing on the bar that is *about* the preset, had no
room left. They are folded into three dropdowns by verb: **New** (Synth, Kit,
Randomize), **Open** (from this computer, from the Deluge, and the two sample
library entries — on the Deluge, or on a card in a reader), **Save** (download
XML, download Zip when the preset references samples, to the Deluge, and
To Deluge — Overwrite once the preset has a card path). A desktop-style File
menu row would have said the same thing at the cost of a second row of
chrome.

Two things stay out as buttons on purpose. **Follow Mode** and **Changes**
are modes, not commands: one pulses while it is listening, the other carries
the count and toggles the dock, and a menu hides exactly what you glance at.
The connected dot moves to the firmware pill for the same reason — the pill
is already what a connection changes, since it locks to the device's firmware
— and it pulses amber through a card transfer whether or not the dialog is
open.

The dropdown (`src/ui/controls/Menu.svelte`) is a menu button and nothing
more: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` /
`role="menuitem"`, focus lands on the first item, the arrows walk the items,
Escape and a click outside close it and return focus. Save's items are
disabled without a preset rather than the whole menu, so it still says what it
would do.

## Every section at once, dealt into measured columns

The overview is not CSS multicolumn. Panels are rendered, measured, and dealt
into contiguous balanced stacks (`src/ui/masonry.ts`), so the column count
tracks the window continuously instead of snapping at multicolumn's 262 px
floor, and there are never more columns than panels, so none sits empty. The
same measure drives Follow Mode's page.

## A modulation source is picked on the knob, not in a matrix

Right-click (long-press on touch) on any patchable control opens the source
picker (`src/ui/CablePicker.svelte`, issue #13). The cable is created at
amount zero and the Cables panel lands on it — or, when that source →
destination pair already exists, the existing row is revealed rather than
duplicated, because the firmware's matrix holds one entry per pair. A knob
the firmware is not reading (a synced LFO's rate) has no picker either, since
`Sound::maySourcePatchToParam` refuses the cable.

## Gold knobs are a panel of summaries

The sixteen encoder assignments — eight mod-button pages, two knobs each,
bottom knob first in the file — are rarely edited, so each slot is one line
that expands in place to its selects (issues #23, #27). A slot the file does
not carry shows the firmware's stock assignment as its default, and the first
edit writes the full 16-entry array the way the firmware would
(`ensureModKnobs`). The volume family is canonicalised the way the firmware
re-saves it after `ensureKnobReferencesCorrectVolume` (sound.cpp:1317).
