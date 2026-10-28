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

**Narrower than 1100px the bar is two rows** (issue #45). One row needed
870px before the name got a pixel, so below that the page scrolled sideways,
and well before that the name was cut short. The top row is the preset: the
mark, the name and the firmware pill. The second row is what you do: New,
Open and Save, then Follow, Live and Changes, in the same order. The
breakpoint is measured, not round. A Deluge name runs 100 to 220px, and at
1024 one row left "Default Synth.XML" (155px) no slack. At the theme's 640px
the labels shorten: the wordmark goes, since the OLED says what is loaded,
and the modes read Follow and Live. On a phone the buttons still need about
500px, so the second row scrolls sideways within itself, with fades over its
ends, and the page never does. Folding the modes into a menu to make them
fit was ruled out by the paragraph above, and letting the flex row wrap gave
a ragged second line that moved with the name's length. Because that row
scrolls, a menu's list is `position: fixed` and placed under its button: a
scrolling row clips anything absolutely positioned inside it. For the same
reason the fades are the bar's face laid over the row's ends, not a mask on
the row, which would clip the list too.

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

## The landing page offers the actions, it does not describe the bar

With nothing loaded the page used to be sentences of the shape "Choose
**New › Synth** to…", one per feature, six by the time Live Edit arrived
(issue #38). It is now four tiles in two groups, **New** (Synth, Kit) and
**Open** (From this computer, From Deluge), headed and laid out like the bar's
menus, each one line of what happens. A tile calls exactly what its menu item
calls — `src/ui/start.ts` holds New and Open › From this computer for both,
and From Deluge is `card.openPanel('open')` — so the page and the bar cannot
drift apart, and the page teaches the bar by being laid out like it.

A balloon pointing at the menu was rejected: it explains a location rather
than offering the action, it is noise the second time, and it has to know
when to go away. Shorter prose was rejected for the same reason in a smaller
dose: it is still read, remember, go and find it.

**Not everything is a tile.** Drop is a sentence under them, because it is
the one way in that isn't a click. Follow Mode and Live Edit are sentences,
gated as their buttons are, because each is a way of working with the Deluge
rather than a way to start, and each already has its button on the bar.
Randomize, New's third item, has neither: the page offers no more ways in
than the menu does, and four tiles in twos is as many as the page should ask
anyone to choose between.

## A command that replaces the preset asks when it would lose changes; a drop always asks

Five things replace the loaded preset, and until issue #44 they followed three
rules, two of which never asked at all. There are two rules now.

**A command asks only when there are unsaved changes** (`editor.changeCount >
0`): New › Synth or Kit, Open › From this computer, Open › From Deluge, and
entering Live Edit. With nothing unsaved it just goes: a fresh file over an
unedited one loses nothing, and a question there would be noise.

**A drop asks whenever a preset is loaded**, edited or not (`ab721d7`). A stray
drag is easy to make, and unlike a menu command it was not chosen.

The questions are the one confirm dialog (`state/confirm.svelte.ts`) and name
what replaces what, with the unsaved count: "Open X? It replaces Y" for a
file, as a drop says it; "Discard changes to Y? …" for a template or the
Deluge's sound, as New says it. The card browser is the exception in form,
not in rule. It is already a dialog, so its first click arms the file and the
second loads it, as Save's Overwrite arms.

Open › From this computer asks after the pick, not before the picker, so the
question can name the file; cancelling the OS picker already costs nothing.
Live Edit asks at its button, before connecting, so a Cancel asks nothing of
the Deluge and leaves Follow Mode running if it was.

A switch of instrument on the Deluge while Live Edit is on (`^inst`) re-opens
without asking. The page is a view of the device's sound then, and the switch
was made on the device.

While Live Edit is on, anything else that replaces the preset also ends the
mode (`decisions/live.md`, "A new document leaves Live Edit"). The rule for
asking stays the same, but the words change, because the Deluge keeps the
unsaved changes: "Leave Live Edit for a new kit? The Deluge keeps Tim and
its 1 unsaved change." Only an edit the Deluge has refused is asked about
as discarded. `start.ts` (`replacePreset`) words every one of these
questions, for New, Open › From this computer and a dropped file alike.
The card browser's armed row says the same, shortened to fit a row:
"leaves Live Edit? The Deluge keeps Tim and its 1 unsaved change" in place
of "discards your changes?" (issue #47). Those labels are long, so the
row's label wraps under a cap instead of squeezing out the file name.

## The kit builder is a panel until the kit has samples; credits belong to the zip

The kit builder used to be one panel holding the ways samples come in
(drop, choose a folder, browse the Deluge), the push to the card, and the
share zip's credits (author, licensing, source). The credits matter only to
the zip, and they sat under a "Build from samples" heading.

The credits are now asked for by Save › Download zip…, a dialog with the
three fields and the download button (`ShareZip.svelte`). Any preset that
shares as a zip gets them, a sample-based synth as well as a kit.

The builder panel shows only while the kit names no sample (`kit.built`):
that is what a new kit is for. After that, the same controls are the Rows
panel's Add samples… dialog (`KitAddSamples.svelte`), which closes itself
once rows land. Send N samples to the card sits in the Rows panel's actions,
next to the count of samples not on the card. The builder's status lines
(`KitStatus.svelte`) show wherever the builder is: its panel, the dialog, or
the Rows panel when neither is up. Dropping a folder on the page works the
same either way.

## A kit has no OLED sentence; a synth row's sentence is its Source cell

The OLED sentence and chips describe a synth preset. On a kit they used to
describe the selected row, which read as a description of the whole kit;
a sentence for the kit itself (row count and names) said nothing the rows
table doesn't, and a sample row's sentence ("Sample kick.wav, sustained…")
said less than its file name. So a kit shows none. A synth row is the one
row whose file name can't say what it is, so its Source cell carries the
sentence a synth preset gets (`core/kit/rows.ts`, `rowDescription`) in
place of "subtractive · saw".

## Missing samples are split by what can be done, and can be found elsewhere on the card

The Rows header used to say "⚠ N samples not on the card" in red for two
different things. Now it says each one with what can be done about it:

- **To send** (amber): the editor holds the bytes. Send N samples to the
  card copies them, and so does saving the kit to the Deluge.
- **Missing** (red, a button): the card lacks the file and the editor has
  no copy, so the row will be silent. Clicking the count selects the next
  such row and scrolls to it.

Find on card (shown while a Deluge is connected and something is missing)
looks under `SAMPLES/` for a file of the same name, case-insensitively,
starting at the missing file's folder and widening one parent at a time
(`core/library/locate.ts`). Nearest first, because a kit whose folder was
moved or nested usually has its files one level away. It lists each folder
at most once and stops after 400 folders. What it finds is offered with a
Use them button; nothing changes until then. Using them rewrites only the
path. It is the same file by name, so the zone, loop points and tuning
stay as they are.

## Open › Recent reopens a file where it lives now

Open lists the last eight presets opened or saved, newest first, each with
where it lives: its folder on the Deluge, or "this computer"
(`state/recent.svelte.ts`).

- A Deluge entry is a card path. Opening it connects if need be and reads
  that path. Saving to the card adds the path too, because that is the
  file you will want back.
- A computer entry is the browser's file handle, so it reads the file as
  it is on disk now, not a copy from when it was opened. Open › From this
  computer uses the File System Access picker where the browser has one
  (Chrome, Edge) because only that gives a handle; a dropped file gives
  one too. A file opened through the plain input has no handle and is not
  listed. The browser asks again for read permission after a reload.

A file that is gone leaves the list, and the error says so. One that
can't be read just now (no Deluge, permission refused) stays. Opening an
entry asks before replacing the preset exactly as any other open does
(`start.ts`). The list is kept in IndexedDB, since handles can't go in
localStorage. Without IndexedDB it lasts for the session.

The start page lists the same entries under its Open tiles, as rows rather
than tiles because they are many and alike. Opening one there is the same
action as in the menu. The page leaves the list out while it is empty; the
menu's greyed-out "Nothing yet" is where an empty list shows.

## A preset's samples on the Deluge draw their waveforms without a click

Row thumbnails used to come only from audio already in the browser: local
files decoded in the background, but a sample that lived only on the card
got its waveform after you previewed it. So a kit opened from the Deluge
showed an empty column, which reads as broken. Now, while a Deluge is
connected, the editor reads each such sample over SysEx in the background
and decodes it for its thumbnail (`audio.prefetch`, kicked off like the
missing-on-card check: on connecting, and when the preset names a
different set of files).

The reads go one at a time and give way. While the card store or a
preview is busy with something asked for, the next read waits. A newer
preset or a dropped connection ends the run between files. A sample the
card doesn't have is skipped, because the missing count already says so.
The decoded audio is the preview's cache, so ▶ on a row that has its
waveform plays at once.

## A kit's rows show how loud they play, and Match levels evens them with Volume

The rows table has a Rel lvl column. It says how loud each sample row plays
against the kit's loudest row, in dB (0 is the loudest). Two buttons sit
with the Rows actions: ▶ In turn plays the sample rows one after another,
and Match levels sets each row's Volume so they all play equally loud. Put
back undoes the match.

- **What is measured** (`core/samples/loudness.ts`): the loudest 100 ms of
  the part of the sample the zone plays, after BS.1770's K-weighting, with
  the channels averaged. The ear model is there so a kick's sub doesn't
  outweigh a hat's top end. The window is 100 ms rather than BS.1770's
  400 ms because a 60 ms hat would read 8 dB quieter than it sounds. A
  sample's level is known once its audio is in the browser: local files
  decode in the background, and a kit's samples on the Deluge are read in
  the background too.
- **What the controls do** (`core/kit/levels.ts`): the file's `volume` is
  the Deluge's Volume menu (`GLOBAL_VOLUME_POST_FX`), and it and
  `oscAVolume` are volume params, which the firmware squares. So the gain
  is `40·log10` of the knob, with 25 as 0 dB and 50 as +12 dB (citations in
  the module). Preview now plays a row through both, and plays only its
  zone, so preview compares the way the Deluge will.
- **What a match does**: each row's Volume is set so its level equals one
  target. The target is the highest level every row can reach with Volume
  at the top, and never above the loudest row as it plays now. A match
  evens a kit out; it doesn't make it louder. Volume 40 to 50 is under
  4 dB, so in practice the loud rows come down to the quiet one. Volume is
  written as the exact value the match needs, not the nearest menu step,
  so the cell may show 37 for a value between 37 and 38, as the Deluge
  would. Synth rows, MIDI rows and samples not yet measured are left alone.

Cables into the volumes (velocity, envelope) aren't counted, because a
stock kit has the same ones on every row.

## A kit's rows table packs its columns left, and the spare width goes past Pan

Each column is as wide as what it holds, and the table's spare width goes
to the last column, which holds the row's ▲ ▼ × buttons at the right edge.
Before, Source took all the spare width, which opened a gap between the
path and Repeat. The Row column also had a 150 px minimum, which left a gap
before Source. That minimum is now 90 px, still enough to type a name.
Source no longer wraps: the Sample… chip and the path stay on one line, and
the table scrolls sideways when the screen runs out.

Vol, Rel lvl and Pan are centred under their labels. Vol and Pan are
boxes, and their values are centred in the box. The column labels all share
one face. Vol and Pan no longer use the numeric (monospace, right-aligned)
style; the row number still does.

The Source and Repeat labels sit 4 px further in than the others. A label
lined up exactly with a drop-down's or chip's edge reads as left of it,
because the box's border and padding push its text in.
