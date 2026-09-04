# Codebase audit — 2026-09-04

Audit of `main` at `4074028` (clean tree). Baseline before reading anything:
`pnpm check` 0 errors / 0 warnings, `pnpm test` 773 tests in 51 files passing,
`pnpm test:e2e` 36 passing. No `TODO`/`FIXME`/`XXX` anywhere; no `console.*`
outside the gated SysEx debug line; no legacy Svelte syntax; no `any` in core;
every `FEATURES` commit hash resolves. So this is a clean codebase that has
grown fast, and what follows is drift, duplication, a handful of real bugs,
and copy that no longer matches the instrument.

Line numbers are as of that commit. Firmware facts were checked in
`~/WebstormProjects/DelugeFirmwareTW` at the refs each comment names.

Sections: [1 Fix first](#1-fix-first) · [2 Docs](#2-documentation) ·
[3 MIDI Follow help](#3-midi-follow-help) · [4 UI copy and labels](#4-ui-copy-and-labels) ·
[5 UI components](#5-ui-component-patterns) · [6 State layer](#6-state-layer) ·
[7 Core](#7-core) · [8 Tests and fixtures](#8-tests-and-fixtures) ·
[9 Dead code](#9-dead-code) · [10 Stale citations](#10-stale-firmware-citations) ·
[11 Suggested order](#11-suggested-order-of-work)

---

## Status

Updated as work lands. Line numbers in the sections below are still as of
`4074028`; the tree has moved since.

**Done (2026-09-04, this pass), all with `pnpm test`, `pnpm check` and
`pnpm test:e2e` clean:**

- §1 items 1–9, 11, 12 — every bug except the two fakes (item 10, see §8).
  - 1: `CardError` + `isNotFound` in `library/fs.ts`; `library/sms.ts` maps
    every `SysexError`; `scan.ts` treats only a not-found root as empty;
    `samples.svelte.ts` no longer caches a failed listing as absent and
    surfaces `checkError`; `localcard.ts` throws coded errors.
  - 2: `card.need()` requires `status === 'connected'`; `write` holds the
    client across the await and reports a mid-save disconnect in words.
  - 3: `localcard.ts` reads every write back and throws `verify` on a
    mismatch, rename-by-copy included; `localcard.test.ts` added.
  - 4: `--z-modal` token; the two dialogs use it; Escape closes only the
    topmost dialog in a fixed order.
  - 5: see §3 below.
  - 6: `src/ui/errtext.ts` `errorText(e)`; `SysexError` carries a `reason`
    without the FatFS name and client-side codes `NO_REPLY`/`SHORT_WRITE`/
    `SHORT_READ` below the FatFS range; the ladder's give-up is a
    `SysexError`, not a raw msgId string; every store catch goes through it.
  - 7: the identity inquiry times out after one attempt; `firmwareOk` gains
    `'unknown'` and the card panel says the controls follow the file.
  - 8: `ARP_MODE_NAMES` (Off/On, cited); `arpeggiator@mode` had the same
    fall-through for `arp` and is fixed too.
  - 9: the unison tooltip says the middle copy stays in tune only for an odd
    count; the ±25 cents figure was right and is now cited
    (`kMaxUnisonDetune = 50`, one unit = one cent of total spread).
  - 11: one `$effect.root` in `samples.svelte.ts` keyed on a `$derived` of
    the sorted reference list, with a generation counter; the two component
    effects are gone.
  - 12: README rewritten with §3.
- §3 in full: `FollowHelp.svelte` is the proposed copy in the proposed order;
  `followAdvice` returns `{ level, text }` and names menus as the OLED does
  ("Listening:", Channel A, Feedback › Filter Responses); the header reads
  "Listen on" / "Send on" and its help button is "Help"; the three
  `follow.*` tooltips, the Follow Mode button title, the empty-state line and
  `README.md` are the proposed text. Menu spelling is `Midi-Follow` (the
  `beta` tag, what a 1.3.0 user reads). `follow.svelte.ts` imports `card`
  statically (there was no cycle) and its settings error goes through
  `errorText`.
- §2 "wrong or stale": all fixed except one that was not stale — the
  velocity fixture *is* read by `src/core/preset/ranges.test.ts:500,536`, so
  `SOURCES.md` and `fixture-capture.md` stand. Corpus figures are now dated
  survey figures beside the thresholds the test asserts.
- §2 "undocumented": README gained paragraphs for Save's four exits and the
  two-click arm, the confirm dialog, the kit builder and Rows table, cables on
  right-click, the Gold Knobs panel, tooltips, roll naming, the `._` sidecar
  and why the Follow Mode button is absent on official firmware; the
  decisions log gained entries for pipelining, the grouped changes dock,
  masonry, the cable picker, gold knobs, the sidecar, roll naming and the
  randomizer's exclusions, plus the Arp Only row as the second deliberate
  greyed control. §2 "minor wording": done.

**Done (2026-09-04, second pass):**

- §1 item 10 / §8 "the two fakes": `tests/e2e/fake-deluge.js` is generated
  from the TS fake by a `pretest:e2e` esbuild step (`fake-deluge.entry.ts`),
  so e2e runs the pipelined grant and real dir timestamps; the TS fake's
  grant and timestamps are pinned in `fake-deluge.test.ts`.
- §8 fixtures: `settings/` (MIDIFollow.XML, MIDIDevices.XML from the card
  backup), five "Community Enums" synths and `Kit MIDI CV Rows.XML` written by
  the current c1.3.0 beta (`community-c1.3.0-beta-6e5f2b2/`; the 3f898e9
  binary is no longer on this machine), and the c1.2.1 init synth
  (`community-c1.2.1-release_1_2_1/`). The 3.1.1 `destination="range"` file
  exists on the card backup but is third-party content and is held back until
  its terms are checked. Findings from the captures: the firmware reorders
  patch cables on save; MIDI/gate drum rows carry a full `<arpeggiator>`
  child that `order.ts` has no table for; c1.2.1 is a third serializer
  layout. Executable bits removed from the three XML files.
- §8 tests: table tests for gates, options, names, order, fatfs, sync,
  library fs/nameProblem, xml path, dropdir; `tests/helpers/` (fixtures, wav,
  rig) replace the copied loaders and WAV builders; `client.test.ts` asserts
  what its comments claimed; `card.spec.ts` in `test.step`s;
  `library.spec.ts` parameterised over both backends (`library-mounted.spec.ts`
  folded in); attrs pokes in tests go through the accessors; magic numbers
  cited; `corpus-roots` logs its skip; `forbidOnly` + traces; CI on every
  push and PR. Gaps the tests found: `PARAM_LABELS` lacks the four
  `*PitchAdjust` names; `ARP_ATTR_ORDER` stops at `kitArp` while community
  files continue with the `locked*` attributes; `SOURCES.md`'s "two layouts"
  note is inverted against the fixtures (beta writes `polarity` before
  `amount`, Tim's hardware the reverse) and there are more than two.
- §7 core: the `sound.ts` ↔ `stock.ts` cycle broken (`modknobs.ts`); barrels
  for `firmware/`, `params/`, `midi/`, `kit/`, `samples/`, and `preset/`
  completed; `stemOf`/`compareNatural` in `library/fs.ts`,
  `params/fixedpoint.ts`, `clamp`, `parseSegment`, `isHexParam`,
  `preset/rows.ts`; `ranges.ts` split into `rangemodel.ts` / `tuning.ts` /
  `rangeedit.ts`, `midi/followmaps.ts`, `followfile.ts` / `mpezones.ts` /
  `followadvice.ts`, all behind re-exporting barrels; `listDirectory` throws
  on a failed page; corrupt `rangeTopNote` locks the range writers
  (`rangesLocked`); loose strings typed (`LoopMode`, `FollowAttr`,
  `ParamName` maps, `FeedbackChannelType`, `Feature` gates); the pan display
  strings are cited and noted as the knob's spelling, not the 7-segment's.
  Left: `pulse.ts` osc type and `gateAllows` stay `string` (tests and UI pass
  plain strings); `DirEntry`/`CardEntry` are not identical.
- §5 UI: `Dialog`, `Status`, `CardBrowser`, `Panel` with `title`/`actions`,
  `FollowHeader`, `KitRow`, `RangeImport`/`RangeRedetect`,
  `FilterModeFields`/`DelayFields`, `Seg` with `aria-pressed`, `filepick.ts`,
  `saveblob.ts`, `menukeys.ts`, `attrs.ts`, `heightMeasurer`; theme tokens
  for the repeated surfaces, status colours, radii and label sizes; `.btn.go`
  in theme; `$derived` clamps; `bind:clientWidth` graphs; module-level state
  for the Overview remount problem; keyboard row selection, reachable graph
  handles, `aria-describedby` tips; `$props.id()`. Left for other owners: the
  LFO-sync rule into `core/firmware` (both call sites still differ),
  `kit.svelte.ts` to use `saveBlob`, the pure formatters listed in §5 "Size"
  into core.

**Not started:** §4 copy pass, §6 state layer, the §9 "exported but used only
in-file" group. Follow-ups above.

---

## 1. Fix first

Real bugs or user-facing wrongness, in rough order of harm.

1. **The library scanner treats any listing error as "no such folder".**
   `src/core/library/scan.ts:36-42` swallows every error on a root
   (`/SONGS`, `/KITS`, `/SYNTHS`) and returns `[]`. A timed-out `^dir` or
   an `FR_DISK_ERR` builds an index with no songs; `deleteProblem`
   (`move.ts:166`) then reports a sample "used by 0 files" and the delete goes
   through. Only `SysexError` code 5 (`FR_NO_PATH`) means missing; rethrow the
   rest. The same shape exists in `src/ui/state/samples.svelte.ts:71-73`
   (any listing failure caches the folder as absent, so every referenced
   sample is flagged missing until a reconnect) and in
   `src/ui/localcard.ts:52,177` (plain `Error`, no code at all). Give
   `CardFS` a `CardError` with a small code enum and map both backends to it.
2. **`card.need()` checks for a client, not a connection.**
   `src/ui/state/card.svelte.ts:387-390` throws only when `client` is null,
   but `connect()` assigns the client (`:210`) before `ping()` (`:222`), so a
   failed ping leaves `status = 'error'` with a live client and every panel
   keeps issuing requests through the full retry ladder. `card.write`
   (`:359`) then dereferences `this.client!` after an `await`, so a
   disconnect mid-copy surfaces as `Cannot read properties of null`.
3. **Mounted-card writes are unverified.** `src/ui/localcard.ts:167-171`
   never reads back, while `src/core/library/fs.ts:32` and the decisions log
   ("A save to the card is verified, not assumed") promise it. A library
   move on a reader reports "N files updated" without checking.
4. **Sample picker and folder import render under the Changes dock.**
   `SamplePicker.svelte:107` and `FolderImport.svelte:89` use `z-index: 40`,
   the same layer as the sticky top bar (`TopBar.svelte:198`) and below the
   dock (`ChangesDock.svelte:78`, 60), menus (`Menu.svelte:124`, 60) and the
   other dialogs (70). Escape in `App.svelte:78` also closes every open
   dialog at once instead of the topmost.
5. **The MIDI Follow help tells a new user to set one setting when two are
   needed, and names menus the instrument does not show.** See §3.
6. **`SysexError` text reaches the screen with FatFS codes in it**
   (`client.ts:96-99` renders `… (FR_NO_FILE)`; shown raw at
   `CardPanel.svelte:34,106`, `LibraryPanel.svelte:195`,
   `FollowHelp.svelte:39`, `KitBuilder.svelte:103`). `fatfs.ts:32-40`
   already has the friendly sentence. Related: `client.ts:343,365` reuse
   FatFS codes 9 and 1 for client-side conditions, so a short write on the
   macOS 752-byte cliff is diagnosed as "is an SD card inserted?".
7. **A connected Deluge with unknown firmware looks normal.** The identity
   inquiry is fire-and-forget (`card.svelte.ts:221`); if it never answers,
   `firmwareOk` stays `null`, `CardPanel.svelte:37` warns only on `false`,
   and controls stay gated by the file's version.
8. **`arpMode` values display raw.** `src/core/preset/describe.ts:228`
   looks `arpMode` up in `OLD_ARP_MODE_NAMES` (`off/up/down/both/random`)
   but its values are `ARP_MODES` (`off/arp`), so `arp` falls through as the
   string. Add `ARP_MODE_NAMES` to `names.ts`.
9. **One tooltip is wrong about the firmware.** `help.ts:243`
   (`unison.detune`) says "One copy always stays at the played pitch"; the
   firmware skips detune for the middle voice only when the count is odd
   (`sound.cpp:3004`, `numUnison & 1`). The "±25 cents" figure is uncited.
10. **Two hand-maintained fakes of the firmware have drifted.**
    `tests/e2e/fake-deluge.js` and `src/core/sysex/fake-deluge.ts` are
    independent transcriptions of `smsysex.cpp`. The `.js` session grant
    never carries `pipe`, so e2e never exercises the pipelined save path
    users on fixed firmware get; dir entries carry `date: 0, time: 0` versus
    `22222/11111`, so the scan cache's "unchanged" path is never exercised
    end-to-end; error replies differ in shape; none of the fault options
    exist in `.js`. Generate the init script from the TS fake (details §8).
11. **`checkMissing` runs on every knob tick.** `KitRows.svelte:29-35` and
    `RangeEditor.svelte:31-37` carry a byte-identical `$effect` that reads
    `card.status` and calls `samples.checkMissing()`, which walks the whole
    preset tree (so every attribute is a dependency) and reassigns
    `samples.missing`. Both run when both are mounted, and the
    check-then-set spans an `await` (`samples.svelte.ts:68-70`), so two runs
    interleave. Move it to one place and gate on a `$derived` of the joined
    reference list.
12. **README says Send is off by default.** `README.md:66` — the store
    starts it on (`follow.svelte.ts:97`), and `docs/decisions.md:499-506`
    says so.

---

## 2. Documentation

### Wrong or stale

| Doc | Claim | Reality |
|---|---|---|
| `README.md:66` | Send is "off until you switch it on" | `follow.svelte.ts:97` `sending = $state(true)`; `decisions.md:499-506` |
| `docs/decisions.md:183-184` | "The Connect button becomes Device with a green dot" | No such button. The dot is on the firmware pill (`TopBar.svelte:66-71,88`), as `decisions.md:906-909` says |
| `docs/decisions.md:371-373`, `src/assets/templates/SOURCES.md:22` | "New Kit waits for the kit editor (#10)" / Default Kit "loaded by nothing yet" | Shipped: `editor.svelte.ts:165-172` `newKit()`, `TopBar.svelte:96`, `core/kit/build.ts`; #10 closed 2026-08-31 |
| `docs/decisions.md:352-355`, `editor.svelte.ts:154-156` comment | Synth template is the emulator's init synth | `templates/SOURCES.md:11-19` says real hardware, blank synth, captured 2026-08-31, and explains the earlier confusion. SOURCES.md is right |
| `docs/decisions.md:60-62` | Writer order is in `preset/params.ts` and `types.ts` field order | It is `preset/order.ts` (which `decisions.md:103` cites correctly) |
| `README.md:36` | `src/core/` is "params, xml, preset, firmware" | Ten modules now |
| `CLAUDE.md:11-12` | Module list | Omits `random/` |
| `docs/decisions.md:495-497` | "The header says in words whose file the edits are landing in" | Moved to the help sheet (`FollowHelp.svelte:66`); `decisions.md:722-731` says so |
| `docs/decisions.md:325-327, 395-397, 436-438` | Corpus figures 769/11, 728 of 832, 716 of 783 | `tests/corpus-roots.test.ts:133-134,195-197` asserts `> 800`, `> 0.85`, `> 750`, `> 0.9`. Present as dated survey figures or cite the thresholds |
| `docs/decisions.md:896-899` | Open = "from this computer, from the Deluge"; Save = three items | Open has the two sample-library items (`TopBar.svelte:110-137`); Save has "To Deluge – Overwrite" (`:150-163`) |
| `README.md:70-71` | Randomize touches "the same blocks the flow strip names" | `random/patch.ts:98-108` deliberately excludes `random` (arp Randomiser) and `gold` |
| `README.md:30`, `CLAUDE.md:34` | "the Playwright smoke test" | Ten spec files |
| `tests/fixtures/SOURCES.md`, `docs/fixture-capture.md` | Velocity fixture used by `src/core/preset/ranges.test.ts` | Only `tests/e2e/ranges.spec.ts:196-218` reads it |
| `docs/decisions.md:296-300` | Kit row built "with exactly four things set" | `kit/build.ts:79-84` also sets `type="sample"` (a no-op against the template) |
| `card.svelte.ts:388` | Error says "click Connect first" | There is no Connect button; `CardPanel.svelte:35` is "Retry" |

### Undocumented (in code, in neither README nor decisions)

- **Save › To Deluge – Overwrite**, `editor.cardPath`, and the two-click
  arm rule (`TopBar.svelte:150-163`, `card.svelte.ts:293,307-330`).
- **New asks before discarding; a drop over a loaded preset asks**
  (`TopBar.svelte:33-44`, `confirm.svelte.ts`).
- **The kit builder as a whole**: build from samples, folder drop,
  Choose Folder / From Deluge, the Rows table with in-place Vol/Pan/Repeat/
  Direction, preview, waveform thumbnails, drag and ▲▼ reorder, Add Row,
  and the Share section (`KitBuilder.svelte:34-51,106-110`,
  `KitRows.svelte:167-328`, `core/kit/share.ts`). README mentions kits only
  in passing.
- **Save › Download Zip** (`TopBar.svelte:141-144`).
- **Audio preview and waveform thumbnails** (`audio.svelte.ts`,
  `samples/peaks.ts`); CLAUDE.md's `samples/` line mentions only WAV headers.
- **SysEx pipelining**, `MAX_PIPELINE = 2` gated on the `pipe` field of the
  session grant (`sysex/client.ts:157-171`). Exactly the kind of
  looks-like-a-bug decision the log exists for.
- **Cable picker on right-click / long-press** (`CablePicker.svelte:3`,
  `HexKnob.svelte:70-82`).
- **Gold Knobs panel** (`GoldGroup.svelte`, `sound.ts:216`).
- **Tooltips on every control** (README).
- **Randomize names every roll** (`random/names.ts`).
- **`._` sidecar refusal and dotfile hiding** (`editor.svelte.ts:121-130`).
- **Overview masonry** rationale lives only in `Overview.svelte:3-8`.
- **Changes dock collapses whole added/removed elements** to one entry
  (`editor.svelte.ts:101-113`).
- **Follow Mode needs community ≥ 1.1.0**, and the button is absent, not
  disabled, for an official-firmware file (`TopBar.svelte:173-175`). Nothing
  tells a 4.1.4 user why there is no button.
- Code-comment decisions not in the log: `random/patch.ts:98-104`,
  `samples/roots.ts:19`, `xml/flatten.ts:17` ("deliberately independent of
  `parse.ts`").

### Minor wording

- `README.md:43-45`: there is also a Show all button (`FlowStrip.svelte:89`)
  and ⌘/Ctrl-click pins (`:36`).
- `README.md:88-90`: the single-file button reads "Change sample…" once a
  file is set (`OscGroup.svelte:163`).

---

## 3. MIDI Follow help

Files: `src/ui/FollowHelp.svelte`, `FollowView.svelte:280-344` (header),
`help.ts:336-342`, `TopBar.svelte:185-188`, `EmptyState.svelte:15`,
`src/core/midi/followsettings.ts:318-359` (the readout's advice),
`README.md:56-68`.

### What is wrong against the firmware

Checked at the `beta` tag (c1.3.0) and `upstream/main`.

1. **Setup needs two settings, the help names one.** `FollowHelp.svelte:53-54`
   and `README.md:57` say the Deluge "needs a feedback channel set under
   SETTINGS > MIDI > MIDI-Follow > Feedback". On a factory Deluge all three
   follow slots are *Channel unassigned* (`midi_engine.cpp` `clear()`,
   `english.json` `STRING_FOR_FOLLOW_CHANNEL_UNASSIGNED`) and feedback is
   *NONE* (`midi_engine.cpp:228`). The user must set **Channel › Channel A**
   to a number, then **Feedback › Channel** to *Channel A*. The store's own
   header comment (`follow.svelte.ts:5`) has the full path; no user copy does.
2. **Menu names.** The OLED title is `Midi-Follow` at the `beta` tag
   (`english.json:902`) and `MIDI-Follow` on `upstream/main` (`:903`); the
   7-segment shows `FOLO`. The editor writes "MIDI-Follow" 15 times and
   "MIDI Follow" 6 times. Pick one for the menu name (matching what a 1.3.0
   user reads is the stronger case) and use "Follow Mode" only for the
   editor's own mode.
3. **Takeover.** `FollowHelp.svelte:95-97`, `help.ts:341`, `README.md:68`
   write JUMP / PICKUP / SCALE / RELATIVE and never name the menu. The OLED
   shows *Jump / Pickup / Scale / Relative*, and the item is **MIDI › Takeover**
   (`menus.cpp:1023,1193`), a sibling of Midi-Follow, not inside it.
4. **"The feedback filter"** (`followsettings.ts:356`) is not a menu name.
   The item is **Feedback › Filter Responses** (`menus.cpp:1069,1092`).
5. **What triggers feedback.** The help presents "turn a gold encoder" as
   the only trigger (`FollowHelp.svelte:53`, `TopBar.svelte:185`,
   `EmptyState.svelte:15`, `FollowView.svelte:335`). Feedback is also sent
   from a menu edit, from the automation editor, and, the big one, **for
   every mapped CC at once when the active clip changes**
   (`view.cpp:1738-1747` → `sendCCWithoutModelStackForMidiFollowFeedback`).
   Opening the clip on the Deluge fills the whole page in. Feedback is sent
   only in a clip context (`view.cpp:1754`), so nothing arrives from song or
   arranger view. Neither fact is stated.
6. **"Read the Deluge's settings"** (`FollowHelp.svelte:28-37`) has
   unstated preconditions: the card protocol (community 1.3.0+) and the
   SysEx permission. Its error line can be raw (`card.error` lower-case
   sentences, or `read SETTINGS/MIDIFollow.XML: no such file (FR_NO_FILE)`);
   the fallback sentence at `follow.svelte.ts:479` fires only for non-`Error`
   throws.
7. **`FollowHelp.svelte:47`** decides which advice lines are warnings by
   substring match (`'MPE zone'`, `'feedback is off'`, `'within a second'`).
   Any rewording of `followsettings.ts` silently loses the colour. Advice
   lines should carry a level.

Everything else checked out: MPE lower/upper zone → channel 1/16, Jump as
default, the one-second echo filter, kit routing by AFFECT ENTIRE, the
"Channel A is …" labels.

### Structure

- The sheet opens with the diagnostic readout, which the decisions log
  itself describes as something you consult when things go wrong, before
  telling a first-time user what to set. Order should be: set up the
  Deluge → in the browser → listening → sending → kits → check the settings.
- The MPE paragraph (`FollowHelp.svelte:57-63`) is in everyone's path; most
  users have a plain channel. Make it a one-line aside.
- "Heard" is explained three times (`FollowHelp.svelte:83-86`,
  `help.ts:342`, `FollowView.svelte:335-336`); "only to a port that names
  itself a Deluge" twice.
- Missing operational facts: what the header tag *Following / Off / Not
  listening* means; how to read `ch 1 · CC 74 = 127 → LPF Freq` and
  `unmapped`; that listening falls back to every input when none is named
  Deluge (`follow.svelte.ts:301-304`) while the sheet says "listening on …";
  that a mirrored value is the instrument's int32 and may sit between two
  menu steps; that Send has no undo on the Deluge; that the Rows table
  selection must match the Deluge's selected row.
- The kit sentence is passive ("the target switch here is set to match");
  tell the user to set it.

### Terminology drift

| Concept | Variants | Use |
|---|---|---|
| The editor's mode | "Follow Mode", "MIDI Follow" (sheet title), "MIDI Follow Help", "MIDI Follow help" | **Follow Mode** |
| The Deluge's menu | "MIDI-Follow" ×15, "MIDI Follow" ×6 | one spelling, matching the OLED |
| Deluge → editor | "Following", "Listening", "Mirroring:", "Mirror", "feedback" | **Listening**; "feedback" only for the Deluge's setting |
| Header labels | "Channel" (listen) and "on ch" (send) (`FollowView.svelte:284,306`) | "Listen on" / "Send on" |
| Chrome/Edge | four different sentences (`follow.svelte.ts:237`, `card.svelte.ts:171`, `TopBar.svelte:74,141`, `EmptyState.svelte:10`) | one constant |

### Proposed replacement copy

`FollowHelp.svelte` body, title **Follow Mode**. Bindings in braces are the
existing ones. Menu spelling per item 2 above.

> **Set up the Deluge (once)**
> On the Deluge, hold SHIFT and press SELECT for Settings, then
> **MIDI › Midi-Follow** (on a 7-segment Deluge: **FOLO**).
> 1. **Channel › Channel A** — turn it to a MIDI channel, say 1. Out of the
>    box A, B and C are all *Channel unassigned*, and nothing is followed
>    until one has a channel.
> 2. **Feedback › Channel** — set it to **Channel A** (the default is NONE).
>    This is what makes the Deluge report its own changes.
> 3. Leave **Feedback › Filter Responses** off and **MIDI › Takeover** on
>    **Jump**; both are the defaults. What they do is under *Sending*.
>
> Midi-Follow exists on community firmware 1.1.0 and later. With an
> official-firmware preset loaded the Follow Mode button is not offered.
>
> **In the browser**
> Chrome or Edge, over USB. Follow Mode listens on every input named
> Deluge{#if ports} — right now {ports}{/if}. Allow MIDI access when the
> browser asks; allow SysEx too if you want the settings check at the bottom
> of this sheet.
>
> **Listening**
> Open the clip on the Deluge whose sound this is, and every mapped value
> arrives at once. After that each knob turn, menu edit or automation move
> arrives as it happens. The Deluge reports only from a clip view; nothing
> arrives from song or arranger view.
>
> The page shows only what Midi-Follow can reach: the firmware's default CC
> map, as the same knobs in the same blocks. Envelopes and LFOs tab to
> whichever one the Deluge last touched. The header shows the last message
> heard — channel, CC, value and the parameter it moved; *unmapped* means
> this firmware's map has no parameter for that CC.
>
> These edits land in **{file}**, whether or not that is the sound the Deluge
> has open. A follow CC never says which sound it belongs to, so check before
> you turn. Like every edit here, nothing is written until you save.
>
> Leave **Listen on** at *Any* unless another device sends CCs on the same
> port. (If Channel A is an MPE zone rather than a number, feedback arrives
> on channel 1 for the lower zone or 16 for the upper; *Any* covers both.)
>
> **Sending**
> **Send** plays your moves back at the Deluge, into the sound it has live,
> as you make them. Only what you move goes out; switching the mode on never
> pushes the file. It goes to one Deluge port and to nothing else, and only
> once the Deluge has been heard: **Send on** defaults to *Heard*, the
> channel its feedback arrived on. There is no undo on the Deluge, so keep
> Send off until you are sure the loaded file is the sound it has open.
>
> ⚠ Set the channel by hand only to one Midi-Follow uses: Channel A, B or C.
> On any other channel a CC is still a CC. It reaches the Deluge's ordinary
> MIDI handling, where it can trip a learned command or be recorded into the
> clip.
>
> Two Deluge settings decide what a send does:
> – **MIDI › Takeover.** *Jump* (the default) takes the value outright.
>   *Pickup* and *Scale* wait until the Deluge's knob and yours meet.
>   *Relative* reads every value as a nudge, so absolute sends run away; set
>   it to Jump.
> – **Midi-Follow › Feedback › Filter Responses.** On, the Deluge ignores any
>   CC number it sent itself within the last second: a knob dragged here
>   moves the sound once, then goes quiet for a second. Turn it off for
>   two-way editing.
>
> **Kits**
> A kit clip's follow CCs go either to the kit as a whole or to one row,
> decided by the **AFFECT ENTIRE** light on the Deluge. Nothing in the CC
> says which, so set **Kit bus** or **Selected row** here to match, and
> select the same row in the Rows table as on the Deluge.
>
> **Check what this Deluge is set to**
> Which channel Midi-Follow is on is the one thing this mode cannot hear.
> The Deluge writes it to `SETTINGS/MIDIFollow.XML`; this reads it off the
> card over the same USB connection (community firmware 1.3.0 or later) and
> works out which of the Deluge's USB ports, and which channel, will accept
> a send.
> [Read the Deluge's settings]
> {readout + advice}

Advice strings (`followsettings.ts`): prefix "Listening:" instead of
"Mirroring:" (`:323,325,327`); name items as the OLED does (`:323,346`);
`:356` → "**Filter Responses** is on under Feedback, so the Deluge ignores
any CC it sent itself within the last second: a knob dragged here moves the
sound once and then goes quiet for a second. Turn it off for two-way editing."

Header tooltips (`help.ts:336-342`):

- `follow.channel` → "The channel to listen on. Any takes every channel,
  which is right unless another device sends CCs on the same port. The
  Deluge's feedback channel is Settings › MIDI › Midi-Follow › Feedback ›
  Channel."
- `follow.send` → "Play moves made here back at the Deluge, into the sound
  it has live. Values land exactly only with Settings › MIDI › Takeover on
  Jump, its default."
- `follow.sendChannel` → "The channel to send on. Heard is the channel the
  Deluge's own feedback arrived on, which is right whether its follow
  channel is a number or an MPE zone."

Header labels (`FollowView.svelte:284,306`): "Listen on" / "Send on".
Disabled-Send title (`:302`): "No Deluge MIDI output found. Sending goes only
to a port named Deluge, so a CC cannot land on another instrument."

`README.md:56-68`, replace both paragraphs:

> **Follow Mode** mirrors the Deluge. Set **Settings › MIDI › Midi-Follow ›
> Channel › Channel A** to a MIDI channel and **Feedback › Channel** to
> Channel A (community firmware 1.1.0+), and every value the Deluge changes,
> a knob, a menu edit, the whole sound when you open a clip, moves the
> matching control here. While it is on, the page shows only the parameters
> Midi-Follow can reach, the firmware's own default CC map, in the same
> blocks and knobs as the full editor; envelopes and LFOs tab to whichever
> the instrument last touched. Values written are the instrument's own, and
> nothing is committed until you save.
>
> **Send**, on by default, plays your moves back into the sound the Deluge
> has live: only what you move, to one Deluge port, on the channel the
> Deluge was heard on, and the header says which. Values land exactly when
> the Deluge's **MIDI › Takeover** is *Jump*, its default. The help sheet in
> the mode reads the Deluge's own Midi-Follow settings off the card and says
> which port and channel a send will be accepted on.

---

## 4. UI copy and labels

### Casing and punctuation

- **Casing is mixed in source** and only hidden where CSS uppercases
  (`theme.css:68,124`). It shows in menus (`MenuItem.svelte` has no
  transform) and to screen readers: "From this computer" beside
  "Sample Library on Deluge", "Download XML" / "Download Zip"
  (`TopBar.svelte:119-162`). Buttons: Title Case ("Choose Folder…",
  "Add Row", "Use This Folder", "Send N Samples to Card") next to sentence
  case ("Add the WAVs in this folder", "Re-detect roots…", "Split, new
  below…", "Show all", "Same seed", "Kit bus"). Adopt sentence case in
  source; Title Case only where the firmware capitalises.
- **Ellipsis policy** is inconsistent (the character is always "…"):
  "From this computer" (opens a picker, no ellipsis) vs "Sample Library on a
  card in this computer…"; "From Deluge" (`TopBar.svelte:120`) vs
  KitBuilder's "From Deluge…" (`:51`). Rule: ellipsis when the command needs
  more input before it acts.
- **Dash**: "To Deluge – Overwrite" uses a spaced en dash
  (`TopBar.svelte:162`); everywhere else is an em dash.
- **Apostrophes**: `help.ts` is held to the typographic ’ by test
  (`help.test.ts:53`); Svelte markup uses straight ' in 48 places and ’ in
  11, often side by side (`TopBar.svelte:61` vs `:104-106`;
  `FollowHelp.svelte:35` vs `:58`). Extend the rule or drop it.
- The only tooltip ending in a period: `CardPanel.svelte:60`.

### Same thing, different names

- **Byte sizes**: `LibraryPanel.svelte:23` "1.2 MB" vs `CardPanel.svelte:17`
  "1.2M". One `format.ts`.
- **Pan**: knob shows "CTR" (`HexKnob.svelte:60`), `KitRows.svelte:318` says
  "C for centre", `help.ts:82` "centre at CTR". `describe.ts:267-269`
  renders `CTR/L25/R25` without a citation (firmware:
  `menu_item/patched_param/pan.cpp`).
- **Panel label vs `paramLabel`** (`names.ts`, used by the Changes dock,
  pickers and Follow Mode), so one knob has two names by view: "Ratchet
  Prob / Ratchets / Seq Length" (`ArpGroup.svelte:53-56`,
  `RandomiserGroup.svelte:49-50`) vs "Ratchet Probability / Ratchet Amount /
  Sequence Length"; "Fold" (`FilterGroup.svelte:45`) vs "Wave Fold" vs the
  firmware's "Wavefolder"; "Send" under Reverb (`DelayGroup.svelte:33`) vs
  "Reverb"; "Porta" (`VoiceGroup.svelte:38`) vs "Portamento"; "Side HPF"
  (`OutGroup.svelte:89`) is cryptic.
- **Spelling of firmware terms.** The firmware is American: RANDOMIZER,
  QUANTIZE, Analog. The editor has panel "Randomiser" (`groups.ts:247`) vs
  menu "Randomize" (`TopBar.svelte:112`) vs `help.ts:196` "randomizer" vs
  `help.ts:301` "randomiser"; legend "Quantise" beside toggle "Quantized"
  (`OutGroup.svelte:106`); "Analog Square" (`names.ts:28`) vs "analogue
  square" (`names.ts:42`). Firmware terms take the firmware's spelling.
- **Mod FX**: `help.ts:189,101-102` say "warble" / "Warble"; the select
  shows "Tape Warble" (`names.ts:98`).
- **Nothing-placeholders**: "(unnamed)", "UNNAMED", "(no file)", "(none)",
  "—", "empty", "no folders here" across `KitRows`, `TopBar`, `OscGroup`,
  `RangeEditor`, `CardPanel`, `LibraryPanel`, `KitBuilder`, `SamplePicker`,
  `FolderImport`. Pick one bracketed form.
- Block names in `groups.ts` match `SECTION_LABELS`
  (`randomize.svelte.ts:34-44`) exactly. Good.

### Tooltips (`help.ts`)

- Coverage is complete: no orphan keys, every rendered param has a tip, the
  sweep test holds.
- **Copy outside the table**, against the decision that all of it lives in
  `help.ts`: `KitRows.svelte:270,287,304,318`, `KitBuilder.svelte:41,48-49,
  59-60`, every `TopBar.svelte` menu item (`:104-167`),
  `LibraryPanel.svelte:49,75-76,82,118-121,131,137-140`,
  `CardPanel.svelte:53,60`, `FollowView.svelte:302,419`,
  `OscGroup.svelte:129`, `ModsGroup.svelte:33,43`, `KeyMap.svelte:90,106,133`,
  the four graphs. Not wrong, but uncited and unsweepable.
- `help.ts:243` unison (see §1 item 9). `help.ts:216` and
  `KitRows.svelte:270` describe the four loop modes twice in different words.
- Kit bus knobs describe themselves differently in the two views:
  `KitGroup.svelte:39` appends `KIT_BUS_NOTE`; `FollowView.svelte:350-361`
  uses plain `paramHelp`.
- **Citation format is not uniform** (menu-docs path, bare symbol, symbol +
  file:line, file:line without directory), and Delay, Stutter, Song-level,
  Voice/unison, Mod FX select, Arpeggiator selects and DX7 blocks have no
  citation at all. Adopt one form and give every block one.
- `help.ts:79-80` have backticks in user-visible text.

### Dialogs and messages

- Confirm dialog is one pattern, verb + Cancel. One mismatch:
  `App.svelte:66` asks "Open X? It replaces Y…" but the button says
  **Replace**.
- Three overwrite idioms: the dialog; the two-click arm
  (`CardPanel.svelte:80,101`); and "To Deluge – Overwrite" with no
  confirmation (`TopBar.svelte:161-170`). Justified in decisions; README
  should say it.
- **Error casing**: about half capitalised (`card.svelte.ts:171,219`,
  `follow.svelte.ts:237,334,441`, `library.svelte.ts:328`,
  `editor.svelte.ts:129`), half lower-case (`card.svelte.ts:183,388`,
  `kit.svelte.ts`, `multisample.svelte.ts`, `samplepick.svelte.ts`,
  `localcard.ts`, `client.ts`, `scan.ts`, `wav.ts`). Trailing periods
  likewise. Pick sentence case, no period.
- **Internals on screen**: FatFS names (§1 item 6); `localcard.ts:177`
  "already exists (FR_EXIST)" where there is no FatFS; `client.ts:580`
  "no reply to msgId 0x2a after 4000ms"; `frame.ts:52` "got U+…";
  `editor.svelte.ts:149` prefixes the browser's DOMParser text;
  `library.svelte.ts:363-366` prints raw per-file errors.
- Same warning, three phrasings: another editor on this Deluge
  (`CardPanel.svelte:49`, `KitBuilder.svelte:99`, `card.svelte.ts:111`).
- "Reading directory" (`card.svelte.ts` refresh) vs "Listing …"
  (`LibraryPanel.svelte:32`) for the same operation.

### Duplicated sentences (candidates for constants beside `KIT_BUS_NOTE`)

| Sentence | Locations |
|---|---|
| "…(connects first if needed)" | `TopBar.svelte:74`, `FolderImport.svelte:51`, `KitBuilder.svelte:48,59`, `SamplePicker.svelte:43` |
| "Web MIDI needs Chrome or Edge" | same five, plus two variants in stores |
| "Browse SAMPLES/ on the Deluge…" | `FolderImport.svelte:51`, `KitBuilder.svelte:48`, `SamplePicker.svelte:43` |
| "Sample is not on this computer — connect the Deluge to preview it" | `KitRows.svelte:206`, `RangeEditor.svelte:306`, variant `audio.svelte.ts:149` |
| "Not on the card yet — saving … will copy it there" | `KitRows.svelte:240-241`, `RangeEditor.svelte:330-331` |
| "Connecting to the Deluge" | `kit.svelte.ts:92,154`, `samplepick.svelte.ts:180`, `multisample.svelte.ts:292,492,640`, `library.svelte.ts:132` |
| "could not reach the Deluge" | `kit.svelte.ts:97,156`, `samplepick.svelte.ts:185`, `library.svelte.ts:136`, `multisample.svelte.ts:297,642`, `follow.svelte.ts:441` |
| "no .wav files in …" / "none of the WAV files could be read" | `kit.svelte.ts:56,77,128,144`, `multisample.svelte.ts:259,279,328,343` |
| "…is no longer loaded" | `samplepick.svelte.ts:247`, `multisample.svelte.ts:360,598` |
| `SYNCED_NOTE` | `ModsGroup.svelte:64`, `FollowView.svelte:244`, variants `LfoGraph.svelte:296`, `help.ts:255` |
| "Envelope 1 is hardwired to volume" | `ModsGroup.svelte:33`, `FollowView.svelte:419`, `help.ts:160`, `sources.ts:58` |

---

## 5. UI component patterns

Baseline: uniformly Svelte 5 runes, every component imported, no
commented-out markup.

### Runes

- `$effect` that clamps state it also reads, one frame late:
  `ModsGroup.svelte:23-24` (`envSel`/`lfoSel`), `FollowView.svelte:159-164`.
  Use `$derived` over a raw selection.
- `const W = $derived(width)` for nothing: `EnvGraph.svelte:25`,
  `FilterGraph.svelte:88`, `LfoGraph.svelte:60`, `PulseGraph.svelte:50`.
- The same four graphs hand-roll a `ResizeObserver` (`EnvGraph:17-24`,
  `FilterGraph:28-35`, `LfoGraph:52-59`, `PulseGraph:42-49`) while
  `KeyMap:77`, `Overview:107`, `FollowView:371` use `bind:clientWidth`.
- `Overview.svelte:110-118` nests keyed `{#each}`s; a keyed node cannot move
  between parent blocks, so when the masonry rebalances, a panel remounts
  and loses `GoldGroup.svelte:23` `open` and `ModsGroup.svelte:18-19`
  `envSel`/`lfoSel`. Lift that state into `editor`.
- `KitRows.svelte:267-278,284-294` render `loopMode` and `reversed` with raw
  `<select>` over `Object.entries(...)` and `?? '0'`, bypassing `Select`,
  `loopModeOptions()` and `fallback`. Any gate added to the option builder
  is missed here.

### Six dialogs, six implementations

| Site | z-index | role | Escape | focus in/restore |
|---|---|---|---|---|
| `App.svelte:88` confirm | 90 | `alertdialog`, no `aria-modal` | `App.svelte:78` | no |
| `FollowHelp.svelte:20` | 70 | `dialog` | own `svelte:window` | no |
| `CardPanel.svelte:21` | 70 | `dialog` | `App.svelte:78` | no |
| `LibraryPanel.svelte:44` | 70 | `dialog` | `App.svelte:78` + `stopPropagation` on inputs | `autofocus` only |
| `SamplePicker.svelte:22` | **40** | `dialog` | `App.svelte:78` | no |
| `FolderImport.svelte:30` | **40** | `dialog` | `App.svelte:78` | no |

`.veil` is copied six times with two backdrop colours; the sheet gradient
four times; header + × button five times. Fix: one `Dialog.svelte`
(`title, onclose, testid, width?, children, footer?`) owning veil, sheet,
header, `aria-modal`, Escape, initial focus and restore, with one
`--z-modal` token above dock and menus. `App.svelte:78` then handles only
`confirm` and `randomizer`.

### Other repeated patterns

- **Menus**: `Menu.svelte` is a proper ARIA menu button.
  `CablePicker.svelte:48-57` uses `role="menu"` with no focus move, no
  arrow keys, and CSS (`:62-77`) copied from `Menu`/`MenuItem`. Extract the
  list keyboard handling and render `MenuItem`s.
- **Segmented controls**, four implementations: `Seg.svelte` (no
  `aria-pressed`), `Randomize.svelte:23-34` (has it; avoids `.seg` because
  of a margin, `:124`), `FollowView.svelte:320-324`,
  `CablesGroup.svelte:52-55`. `Seg` takes a margin prop and `aria-pressed`;
  the others use it.
- **Buttons**: `theme.css:66-74` `.btn` is re-declared in `App.svelte:160`
  (26px), `FollowHelp.svelte:134` (24px), `Randomize.svelte:142` (23px);
  heights 20–27px across the app. `.btn.go` is declared identically in
  `App:162`, `FollowHelp:136`, `LibraryPanel:223` and not in theme, so
  `SamplePicker`, `FolderImport` and `RangeEditor` use `class="btn go"` and
  get **no** styling: the primary action looks secondary. Button-shaped
  lookalikes: `FollowView .sendbtn`/`.helpbtn` (`:484-495`, identical),
  `LibraryPanel .act`, `KitRows .act/.play/.pick`, `RangeEditor .mini/.play`.
- **Panel headers**: `Panel.svelte` takes `group: Group` (`:5`), so
  `KitRows:348-350`, `KitBuilder:115-117`, `RangeEditor:422-427`,
  `ChangesDock:80-81`, `SamplePicker:112-113`, `FolderImport:94-95`
  re-declare `.panel/.ph/.ph h2` (seven copies). Give `Panel` a title prop
  and an `actions` snippet.
- **Card browsers**, five copies of markup and CSS: `CardPanel:52-87`,
  `SamplePicker:50-98`, `FolderImport:57-81`, `KitBuilder:66-91`,
  `LibraryPanel:79-83,152-170`. One `CardBrowser.svelte`.
- **File pickers**: hidden input + `ref.click()` in `TopBar:97`,
  `SamplePicker:33`, `FolderImport:41`, `KitBuilder:40`; `pickFolder` is the
  same 12 lines in `FolderImport:13-24` and `KitBuilder:16-27`. One
  `filepick.ts`. `TopBar.svelte:23-31` `download()` and
  `kit.svelte.ts:192-198` both build an `<a download>`; one `saveBlob`.
- **Status lines**: `.busy/.err/.notice/.okline/.caution` declared in ten
  files with the same hex literals; `role="alert"` missing at
  `CardPanel.svelte:38`; `RangeEditor.svelte:467` uses a different caution
  palette. `theme.css` `.msg.*` classes and a `Status.svelte`.
- **Pills/dots**: `TopBar.svelte:212-216` and `FollowView.svelte:474-475`
  each define the 6px green dot with its own `@keyframes`;
  `LibraryPanel.svelte:232` hand-copies `.pill` colours.
- **Masonry**: `Overview.svelte:51-71` and `FollowView.svelte:106-124` are
  identical measure actions. Move to `masonry.ts`.
- **`.lbl`** (identical to theme `.f label`) copied in `DelayGroup:37`,
  `KitGroup:123`, `OutGroup:124`, `OscGroup:223`, `RandomiserGroup:60`,
  `RangeEditor:476`; `Knob:145`, `ChangesDock:87`, `LibraryPanel:221` use
  `.lbl` for different things.
- **Firmware gating duplicated**: `FilterGroup.svelte:25-31` ≡
  `KitGroup.svelte:58-64`; `DelayGroup.svelte:23-30` ≡
  `KitGroup.svelte:101-108`; sidechain-vs-compressor tag inlined at
  `OutGroup.svelte:38`, `KitGroup.svelte:117,118`. The "can LFO n sync on
  this firmware" rule is hard-coded in `ModsGroup.svelte:55` and answered
  differently in `FollowView.svelte:241-243` (disables whenever
  `syncLevel ≠ 0`). Move it to `core/firmware`, cited.
  `ModsGroup.svelte:21-22` builds feature names from template strings;
  `supports` takes `string` (`features.ts:347`) so a typo is silent.
- **A second greyed control.** `RandomiserGroup.svelte:41-43,61` dims the
  "Arp Only" row when the arp is off; `decisions.md:666-671` says the synced
  LFO rate knob is the one place the editor greys instead of omitting.
  Omit, or document and use `Knob`'s `disabled`/`disabledNote`.

### CSS tokens

- Hard-coded where a token exists: `--brass-face` literal at `Knob:135`,
  `FollowView:481`; `--brass` at `Knob:134`; `--brass-hi` at `Knob:136`,
  `FollowView:481`; `--ok` at `TopBar:212`, `FollowView:474`.
- Untokenised surfaces used many times: `#0d0b0a` ×11, `#141210` ×11,
  `#1b1815` ×8, `#ddd3c2` ×11, `#e2d9ca` ×9, `#cfe3c9` ×11. Suggest
  `--well`, `--raised`, `--text-hi`, `--text-list`, and `--bad-text` /
  `--warn-text` / `--ok-text` for the status boxes (16 + 13 literals).
- Unused theme variables: `--brass-face`, `--lfo`, `--oled-dim`, `--arp`,
  `--fx`, `--mod`, `--mst`.
- Single-use classes parked in `theme.css`: `.chip` (only `Oled`),
  `.pad/.rname/.file` (only `KitRows`, which then overrides `.file`),
  `.seg`, `.toggle`, `.badge`. `.seg button sup` (`theme.css:111`) is dead:
  nothing passes `sup`.
- Radius 2/3/4/5/6/11px ad hoc; condensed labels at 9–12.5px for the same
  role. Two radius tokens and three label sizes would cover it.
- `theme.css:27` kills all animation under reduced motion, so the Follow
  glow ring (`FollowView.svelte:501`) never shows there. Give `.slot.lit` a
  static fallback.

### Accessibility

- Row selection is mouse-only: `KitRows.svelte:178-185`,
  `RangeEditor.svelte:292` (`<tr onclick>`, no tabindex, no key handler).
  `KitRows` has no keyboard path at all.
- Graph handles (`EnvGraph:88-99`, `FilterGraph:148-158`, `LfoGraph:310`,
  `PulseGraph:144`) are `role="slider" tabindex="-1"`: announced, unreachable,
  no keys. `EnvGraph`/`FilterGraph` omit `aria-valuemin/max`.
- Tooltip only via `title` on a non-focusable wrapper: `Knob.svelte:108`
  (the focusable svg at `:109` has no description), `Select.svelte:26`,
  `NumberField.svelte:33`. Keyboard users never get the help text.
- No dialog moves focus in or restores it (`Menu.svelte` does both and is
  the model).
- No `aria-pressed`: `Seg.svelte:9`, `FollowView.svelte:321-322`,
  `CablesGroup.svelte:53-54`.
- `FlowStrip.svelte:87` a11y-ignored div with click/keydown and a `title`
  invisible to AT; the Show all button (`:89`) already does the job.
- `KitRows.svelte:186-192` drag grip: add `aria-hidden`.
- `Select.svelte:21`, `NumberField.svelte:18` use `Math.random()` ids;
  Svelte 5 has `$props.id()`.

### Size and responsibility

- **`FollowView.svelte` (503)**: header (`:280-344`) → `FollowHeader`;
  pure grouping (`:65-88, 202-235`) → a `.ts` module testable in Node; the
  outgoing CC snapshot (`:254-267`) belongs in the follow store; eight
  `root as SoundElement` casts exist because `EnvGraph`/`LfoGraph`/
  `PulseGraph` take a `SoundElement` while `FilterGraph` takes a
  `FilterBinding`.
- **`RangeEditor.svelte` (477)**: formatters `base/tuning/zoneOf/loopText/
  zoneText/loopFmt` (`:47-75`) encode cited firmware facts and belong in
  `core/preset/ranges.ts` with tests; redetect (`:170-228`) and import
  session (`:230-284`) blocks are components of their own.
- **`KitRows.svelte` (410)**: `describe/sampleOsc/sampleFile/sourceAction`
  (`:38-83`) → `core/kit/rows.ts`; `commitPan` parser (`:123-132`, "C",
  "L12", "12L", "-12") → `parsePan` in `params/scale.ts` with tests; the
  150-line `<tr>` → `KitRow.svelte`.
- **`LibraryPanel.svelte` (265)** halves with `Dialog` + `CardBrowser`.
- **Graph arithmetic in components**: `LfoGraph.svelte:95-100,136-206`
  cites `LFO::render`/`LFO::warble`/`getSquare`/`getTriangle` and is pure;
  it belongs in `core/params/lfo.ts` with tests. Likewise
  `FilterGraph:48-69`, `PulseGraph:65-72`, `EnvGraph:31-39`,
  `OutGroup.svelte:45` (255/254/253 sentinels), `GoldGroup.svelte:28-46`.

### Props

- Three names for the tooling id: `name`→`data-attr` (`Select`, `Toggle`,
  `NumberField`), `param`→`data-param` (`Knob`, `IntKnob`, `HexKnob`),
  `testid`→`data-testid` (`Menu`, `MenuItem`).
- `fallback` exists on `Select`/`Toggle`/`NumberField` but not on the
  knobs, so a knob with an absent attribute shows `—` and the generic tip
  and cannot cite the firmware default.
- `IntKnob` lacks `disabled`/`disabledNote` (`IntKnob:5-17` vs
  `HexKnob:36-39`); the read/ensure/write boilerplate is duplicated between
  them.

---

## 6. State layer

Design is consistent: class singleton, raw `$state` inputs written by
components, `readonly $derived` outputs, methods for invariants. No import
cycles, no store imports a component. Keep that. The drift:

### Rune correctness

- Reactive reads through non-reactive private fields (each a one-line fix
  to `$state.raw` + `$derived`): `multisample.svelte.ts:161,164`
  (`heldFor`/`planFor`, with a comment at `:171-176` about an ordering trap
  that exists only because of this); `samplepick.svelte.ts:106,110`
  (`opened`, works only because of write order at `:127-128`);
  `library.svelte.ts:107,123` (`ready` reads plain `mounted`);
  `audio.svelte.ts:35-37` (`canPreview` reads the cache Map without the
  `void this.version` that `peaksFor` at `:91` uses).
- `$state` on values only ever replaced (deep proxy for nothing):
  `card.entries:46`, `kit.cardEntries:43`, `samplePick.cardEntries:97`,
  `multisample.cardEntries:195`, `library.entries:81`,
  `library.destFolders:100`, `follow.ports:76`, `follow.glow:85`,
  `follow.last:81`, `editor.focus:73`. `$state.raw`.
- `card.svelte.ts:77,84` and `samples.svelte.ts:162-163`: `sampleSync` /
  `sampleRetarget` are callback slots filled by a module-load side effect
  of another file. If a bundle path imports `card` without `samples`,
  `card.write` (`:351`) silently saves without the samples. Invert the
  dependency.

### Async and races (beyond §1)

- `run()` is re-entrant: `busy` is set but never checked in any of the
  five copies; only `overwrite` guards (`card:317`). `samplePick.start`
  fires `browseCard` unguarded (`:135`) and `SmsClient.request` does not
  serialise (`client.ts:473-508`), so two listings interleave and the older
  can land last.
- `audio.toggle` (`:49-82`) races itself: toggle A then B while A's read is
  pending orphans A's node and clears `loading` on whichever finishes
  first. Use the token pattern `library.readInfo` already has (`:244,253`).
- Unhandled rejections: `follow.svelte.ts:307` `void port.open()`;
  `confirm.svelte.ts:29` `void q.run()`.
- `follow.error` set in `emit()` (`:421`) is never cleared while listening.
- Skipped-WAV notices overwrite each other and are then replaced by the
  success notice (`kit:73→80`, `multisample:275→414`); the user never
  learns which files were skipped.
- `follow.svelte.ts:459-468`: the catch computes the `SysexError` code and
  discards it; both branches do the same thing while the comment promises
  otherwise.
- `library.run` writes `card.busy` (`library:450,458`) and clears it in
  `finally` even if `card` is mid-`run`. `card.write` writes
  `editor.source/fileName/cardPath` directly (`:369-371`); an
  `editor.markSaved()` would own that invariant.
- `library.svelte.ts:164,205`: `openMounted` nulls `indexes.mounted` but
  `rescan()` seeds from the cached mounted index, which may be a different
  card's; a file with the same path, size and mtime inherits stale
  references. Key the mounted cache by `root.name`.

### Duplication

- **`run()` + busy/progress/error/notice**, five copies: `card:447-459`,
  `kit:232-244`, `samplepick:320-331`, `multisample:653-665`,
  `library:443-460`. One `Activity` class with a re-entry guard.
- **On-device folder browser**, three verbatim copies (`kit:41-43,90-116`,
  `samplepick:95-97,178-201`, `multisample:193-195,290-316`) plus the
  "connect for the gesture" prelude four times. One `CardBrowser` store
  with a generation counter (~120 lines).
- `pushToCard` byte-identical: `kit:152-168`, `multisample:638-651`.
- WAV-header read loops, four copies: `kit:59-81,131-148`,
  `multisample:262-282,331-346`.
- `isWav` ×4 (`kit:28`, `samplepick:82`, `multisample:140`, `library:72`)
  plus inline regexes at `dropdir.ts:53`, `KitBuilder.svelte:86`;
  `cleanFolder` ×3 with three different fallbacks; `LocalSample`
  (`kit:22-26`) ≡ `DroppedSample` (`dropdir:9-13`) ≡ inline
  (`multisample:255`); `fileFrom` (`multisample:146-153`) re-implemented at
  `samplepick:252-259`.
- **Path arithmetic** instead of `core/library/fs.ts` helpers: `card.join`
  (`:374-376`) vs `samplepick:208,219` vs bare `${path}/${name}` at
  `kit:135`, `multisample:335` (gives `//x` at root); `cardUp` slicing at
  `kit:110`, `samplepick:200`, `multisample:310`, `card:246-247`;
  `replace(/^\//,'')` at `kit:138`, `multisample:337`, `samplepick:251`;
  `follow.svelte.ts:496,499` passes `SETTINGS/MIDIFollow.XML` with no
  leading slash.
- `card.listPath` (`:393-397`) ≡ `card.list` (`:441-445`); they sort
  differently from `library.list` (`:439`, numeric/base), so the same folder
  lists in two orders depending on the panel.
- The two `CardFS` implementations also disagree on parent creation (SysEx
  open-for-write creates folders, `localFS.write` throws `notFound`,
  `localcard:169`) and trailing-slash handling (`localcard:50` strips).

### Naming

- `source` means four things: file text (`editor:40`), credit line
  (`kit:40`), `'deluge' | 'mounted'` (`library:77`), target `OscElement`
  (`samplePick:101`).
- `cardPath` is the preset's card location on `editor` (`:59`) and the
  browser's current folder on `kit`/`samplePick`/`multisample`, which
  `card`/`library` call `path`. Use `browsePath`.
- Busy-ness: `busy` (five stores), `loading` (`audio:15`), `checking`
  (`follow:127`), `scan` (`library:84`). Result: `notice` (three stores) vs
  `card.saved`.
- `card.readSampleFile` (`:429`) is used to read `SETTINGS/*.XML`.
- Dialog "open" is expressed seven ways (`open` bool, `open` derived,
  `asking`, `for`, `which`, `pending`, `request`); every dialog exposing a
  boolean `open` lets `App.svelte:78` stop special-casing.
- `samplePick.progress` (`:92`) is set to 0 and never advanced;
  `SamplePicker.svelte:101` shows no percentage. Delete.
- `follow.svelte.ts:439` `await import('./card.svelte')` guards a cycle
  that does not exist.

---

## 7. Core

Clean by the rules: no DOM imports beyond `DOMParser`, no `any`, no
`console`, every `FEATURES` entry cited and every hash resolving, enum
strings verified verbatim against `functions.cpp` at 3f898e95.

### Small rule slips

- `preset/files.ts:66` `host.attrs.fileName = to` bypasses `setAttr`
  (justified in a comment, but the one such write in `preset/`).
- `kit/build.ts:85,109` `sources.children.push(row)`; `insertChild` exists.
- `preset/ranges.ts:415` reassigns `set.children` wholesale, the one place
  outside `xml/`.
- `preset/describe.ts:267-269` pan `CTR/L25/R25` is the one uncited display
  mapping in that function.

### Duplication

| Helper | Locations | Fix |
|---|---|---|
| Strip folder + extension | `files.ts:74` `stemOf`; `kit/build.ts:30`; `kit/classify.ts:61` `baseName`; `samples/roots.ts:74` inline | One `stemOf` in `library/fs.ts` |
| `baseName` name collision | `library/fs.ts:49` keeps the extension; `kit/classify.ts:61` strips it | Rename the classify one |
| `parentOf` | `library/fs.ts:43` ≡ `sysex/fake-deluge.ts:69` | Import |
| Numeric `localeCompare` | `kit/classify.ts:79` ≡ `samples/roots.ts:88` | One export |
| Path normalisation regex | `fs.ts:55,58`, `refs.ts:43,104-106`, `usages.ts:31` | Build on `xmlPath()` |
| `mulRshift32` + `TWO31/TWO32` | `params/pulse.ts:29-33` ≡ `params/lfo.ts:84`, `scale.ts:15-16` | `params/fixedpoint.ts` |
| `menuValue` | `lfo.ts:123` re-implements `menuToStandard` "without importing it"; importing creates no cycle | Delete |
| `clamp` | exists at `scale.ts:215`; hand-rolled at `ranges.ts:304-305,463,526,541-542`, `midi/follow.ts:343`, `client.ts` | Use it |
| `SEG` regex | `xml/path.ts:24` ≡ `describe.ts:123` | Export `parseSegment` |
| Hex-param regex | `hex.ts:10` (private) ≡ `describe.ts:213` | Export `isHexParam` |
| Kit rows | `preset/index.ts:22` `drumRows` vs `files.ts:19` `soundsOf` re-walks with casts | Compose |

### Conventions

- Barrels are half-present: `xml/`, `preset/`, `sysex/`, `library/`,
  `random/` have `index.ts`; `firmware/`, `params/`, `midi/`, `kit/`,
  `samples/` do not. `preset/index.ts` omits `sound.ts`, `follow.ts`,
  `summary.ts`, and `sound.ts` is the most deep-imported core module from
  the UI (26 imports). Either complete the barrels or drop them.
- **Import cycle** `preset/sound.ts:23` ↔ `preset/stock.ts:32`, working
  only because both uses are inside function bodies. Move the
  `STOCK_MOD_KNOBS` table to a leaf.
- `sound.ts:21` and `summary.ts:10` import from their own barrel.
- Error style varies by module (`SyntaxError`, `RangeError`, `Error`,
  `SysexError`, boolean/undefined). The odd one is `move.ts:67` `planMove`
  returning `MovePlan | string` where the string *is* the error, while its
  siblings return `string | null`.
- `client.ts:413-417` `listDirectory` returns a partial listing as complete
  when page 2+ errors. `client.ts:562-565` `ensureSession` silently adopts
  the fallback range with no debug line.
- `ranges.ts:67-71` `int()` turns a corrupt `rangeTopNote` into "unbounded",
  and `normalizeRanges` will then rewrite it. Guard the writers.

### Types

- Duplicated shapes: `client.ts:83` `ReadHandle` ≡ `fs.ts:21` `RangedFile`;
  `client.ts:65` `Progress` ≡ `fs.ts:17` `CardProgress`; `client.ts:54`
  `DirEntry` ≈ `fs.ts:8` `CardEntry`; `sound.ts:185` `ModKnobAssign` ≈
  `stock.ts:36` `StockModKnob`.
- Loose strings with an enum available: `multisample.ts:54` `loopMode`,
  `preset/follow.ts:42` `FollowSlot.attr`, `midi/follow.ts` CC map values
  (all `ParamName`), `followsettings.ts:62` `feedback`, `pulse.ts:69,83,96`
  and `lfo.ts:151` osc/lfo type, `gates.ts` values (all `Feature`; the
  exported `Feature` type is otherwise unused, which is what it is for).
- Unneeded casts: `features.ts:350`, `files.ts:21-24` (the `Preset` union
  narrows on `tag`), `kit/build.ts:42`, `preset/follow.ts:183,186` (double
  cast), `stock.ts:85`. `usages.ts:62-73` narrows to `any[]` via
  `Array.isArray`.

### Size

- `preset/ranges.ts` (656) is three things: read model (`:1-262`), root
  arithmetic (`:79-146`, belongs beside `notes.ts`), writers (`:264-656`).
- `summary.ts:127` `summariseSound` is 106 lines, five labelled paragraphs.
- `midi/follow.ts`: 270 lines of CC tables → `followmaps.ts`.
- `midi/followsettings.ts`: file parsing, MPE zone model, advice prose.

### Unreachable

- `summary.ts:258` `return { sentence: '', chips: [] }` after an exhaustive
  union; `summary.ts:250` `kit.attrs &&` (never falsy).
- `ranges.ts:374-383` loops over at most one host with `clearFlatRange`
  inside the loop.
- `midi/follow.ts:44` a doc-block line reading `/*` (typo).

---

## 8. Tests and fixtures

### Coverage gaps (no test file at all)

| Module | What is untested | Suggested test |
|---|---|---|
| `core/firmware/gates.ts` | all 11 exports; the "no CFW badges" mechanism | every `*_FEATURE` value names a `FEATURES` key; every enum value no official fixture wrote is gated; every enum in `official-4.0.1/*.XML` passes `gateAllows('4.1.4')`. `random/patch.test.ts:260-267` keeps its own community-only lists instead of reading the gates |
| `ui/options.ts` | all 23 option builders | each list's values ⊆ the enum table; each has a name |
| `core/preset/names.ts` | all 21 tables (four values via `describe.test.ts`) | completeness, as `help.test.ts:14-17` does |
| `core/preset/order.ts` | 22 of 26 order constants | for every fixture element, attribute keys are a subsequence of `*_ATTR_ORDER` and child tags of `*_CHILD_ORDER` (allowing the two documented c1.3.0 writer variances). Round-trip cannot catch a wrong order |
| `core/sysex/fatfs.ts` | the 20-entry table | pin against `ff.h` `FRESULT` order |
| `core/params/sync.ts` | `SYNC_TYPES` | one assertion |
| `core/library/fs.ts`, `move.ts` | path helpers, `nameProblem` | a table for `nameProblem` (FAT-legal names) |
| `core/xml/path.ts` | indexed paths (`sound[3]`) on a kit | two direct tests |
| `ui/state/card` (462), `library` (480), `kit` (247), `ranges` (84) | e2e only | `card.svelte.ts` is the biggest store with no fast tests; `follow.svelte.test.ts` shows the pattern |
| `ui/dropdir.ts` | only via the e2e fake at `multisample.spec.ts:37-70`, which is plain objects and would run in vitest | move it |

Tested modules with untested exports: `sound.ts` `oscHasFile`,
`cablesFrom`, `ensureEnvelope`, `paramHex/setParamHex`, `hexToMenu/
menuToHex`; `scale.ts` rate tables checked at two points only
(`scale.test.ts:77-82`); `ranges.ts` `wavetableRanges` asserted empty only
(`:166`) despite two Deluge-written wavetable fixtures, `setRangeZone`
untested; `client.ts` `Progress` never asserted.

### Hand-written XML that should be fixtures

1. `midi/followsettings.test.ts:21-51,149-153`: `MIDIFollow.XML` and
   `MIDIDevices.XML` typed from memory. Both exist on the card backup
   (`~/Documents/Music/Deluge/TimCardBU/SETTINGS/`) with the MPE
   lower-zone configuration the tests are about. Add `tests/fixtures/
   settings/` and teach the `roundtrip.test.ts:7-10` and `enums.test.ts:26`
   sweeps to skip it.
2. `preset/summary.test.ts:80-92`: the pre-3.2 `destination="range"` idiom
   is modelled "as Dream.XML (fw 3.1.1) writes it" from a file not in the
   repo. Add it as `official-3.1.1/…`; `enums.test.ts:47` needs a legacy
   allowance for `range`.
3. `library/refs.test.ts:42-48`: hand-written `<song><audioClip>`; the
   comment admits it. Capture a one-clip song; it also extends the
   round-trip guarantee to songs, which the library rewrites in place.
4. `xml/generate.test.ts:37-42` asserts the kit MIDI-row layout; no fixture
   has a MIDI or gate drum row. Capture a kit with one of each.
5. `random/patch.test.ts:456-458` builds a sample oscillator by string
   surgery on the template; `Sample Ranges.XML` exists.

Tests that model a knob drag by poking `attrs` (CLAUDE.md says writes go
through `sound.ts`/`edit.ts`): `follow.svelte.test.ts:156,281,292,303,324,
351-353`, `multisample.svelte.test.ts:99`.

### Fixture coverage

- 17 files; `SOURCES.md` and disk agree. Six carry no specific assertion
  (sweeps only): `Subtractive Many Patch Cables`, `Wavetable DX7`,
  `Kit Row Sound`, `Sine AnalogSaw Patch Cables`, `Wavetable DX7 OscSync
  Warbler`, `Nested Subtractive`. The wavetable pass-through is never
  asserted on a firmware-written wavetable.
- `FEATURES` draws lines at c1.0.0, c1.1.0, c1.2.0 and c1.3.0; no file
  written by 1.0/1.1/1.2 exists. DelugEmu ships `deluge-c1_2_1.bin`: one
  capture pins the 1.2→1.3 boundary.
- Enum values no fixture writes, so a transcription typo would pass every
  test: `hpfMode` `SVF_Band`/`SVF_Notch`; LFO `sah`/`rwalk`; `modFXType`
  `phaser`/`StereoChorus`/`grainFX`/`TapeWarble`/`dimension`; `polyphonic`
  `mono`/`legato`; every arp mode beyond `off`/`up`; `filterRoute`
  alternatives; `inLeft`/`inRight`/`inStereo`. One "Community Enums.XML"
  capture covers them all.
- Three XML files are tracked executable (mode 100755): both templates and
  `Kit Velocity Layers.XML`. `git update-index --chmod=-x`.

### Duplication

- Fixture loaders: `stock.test.ts:16-20`, `ranges.test.ts:42-46`,
  `patch.test.ts:38`, `sound.test.ts:23-33`, `summary.test.ts:6-15` → one
  `tests/helpers/fixtures.ts`.
- WAV byte builders, seven copies: `wav.test.ts:10-55`,
  `samplepick.svelte.test.ts:23-41`, `multisample.svelte.test.ts:30-55`,
  `e2e/kit.spec.ts:12-29` ≡ `multisample.spec.ts:13-30`,
  `card.spec.ts:18-35` ≡ `ranges.spec.ts:125-142` → `tests/helpers/wav.ts`.
- `rig()` wiring `FakeDeluge ↔ SmsClient`: `client.test.ts:6-11`,
  `library.test.ts:15-28`.
- e2e seed boilerplate nine times (`card.spec.ts:38-44,113-123,267-271,
  298-306`, `ranges.spec.ts:145-148`, `library.spec.ts:31-34`,
  `library-mounted.spec.ts:71-74,140-143`); `library.spec.ts` and
  `library-mounted.spec.ts` are the same scenario over two backends and
  already differ in what they check. Parameterise.
- **The two fakes** (§1 item 10). Fix: a `tests/e2e/fake-deluge.entry.ts`
  of ~30 lines (identity reply, Web MIDI shim, `__cardSeed`/`__fakeCard`
  wiring around `new FakeDeluge(reply, { sessionPipe: 2 })`) bundled with
  `esbuild --bundle --format=iife` in a `pretest:e2e` script. Until then, a
  unit test that runs one request script through both fakes and diffs the
  replies.

### Quality

- `client.test.ts:273-279` has no assertion ("nothing to assert");
  `:200-206` states the msgId invariant in a comment and asserts nothing;
  `:127-133` asserts `open >= 1`, which any successful read satisfies.
- `kit.spec.ts:59` `waitForTimeout(150)` then "no error" passes trivially.
- `follow.svelte.test.ts:27,109` cast the store to reach private fields;
  expose `follow.attachTo(access)`.
- `editor.svelte.test.ts:145-212` uses dynamic imports for no reason.
- `roundtrip.test.ts:14-17` `it.todo` guard for "no fixtures" is dead.
- `corpus-roots.test.ts:110` always skips in CI with no log line.
- Uncited magic numbers: `scale.test.ts:87-92` (`83886080`, `1073741824`
  → `5 << 24`, `64 << 24` with the `compressor_values.h` cite),
  `lfo.test.ts:88-95`, `multisample.test.ts:70-88`.
- `card.spec.ts:112-264` is eight scenarios in one test; a failure at step
  3 hides the rest. `test.step` or split.
- `describe` titles mix identifier style (`xml/`, `params/`, `samples/`)
  with prose (`preset/`, `midi/`, `ui/`).
- Placement (beside the module; sweeps in `tests/`; e2e specs) is
  consistent but unwritten; one line in CLAUDE.md.

### Config and CI

- `playwright.config.ts`: no `forbidOnly` (a stray `.only` would deploy a
  half-tested build), no trace on failure, default reporter.
- `deploy.yml` triggers only on push to `main` and dispatch: a branch or PR
  gets no CI, so the first run of any change is the deploying run.

---

## 9. Dead code

Mechanically scanned (every export vs. every importer in `src/` and
`tests/`), then checked by hand.

**No importer anywhere, no in-file use:**

- `src/core/midi/followsettings.ts:302` `sendableChannel`, superseded by
  `chooseSendTarget` (`:262`); its private callee chain `slotAccepts`
  (`:285`) → `hasUpperZone` (`:137`) dies with it.
- `src/ui/groups.ts:302` `groupById`.
- `src/ui/options.ts:72` `polarityOptions` (`CablesGroup` hand-rolls the
  polarity buttons).
- `src/ui/groups.ts:30` `Group.short`, set on all 14 groups, never read.
- `src/ui/controls/Seg.svelte:2` `Item.sup` and `theme.css:111`
  `.seg button sup`.
- Theme variables `--brass-face`, `--lfo`, `--oled-dim`, `--arp`, `--fx`,
  `--mod`, `--mst`.
- `src/ui/state/samplepick.svelte.ts:92` `progress`.
- `follow.svelte.ts:466` dead expression; `:439` dynamic import guarding a
  non-existent cycle.

**Exported but used only inside their own file** (drop `export`, or keep
for tests where a test imports them): `editor.safeVersion:27`,
`editor.FIRMWARE_CHOICES:22`, `follow.portNumber:61`,
`sources.SOURCE_COLOR:10`, `keymap.KEY_COUNT:11`, `keymap.Band:30`,
`params/scale.ts` `ATTACK_RATE_TABLE`/`RELEASE_RATE_TABLE`/`nearestIndex`/
`RETRIG_OFF`, `params/lfo.ts` `lfoRateHz`, `midi/follow.ts`
`KNOB_POS_OFFSET`/`paramValueToKnobPos`, `midi/followsettings.ts`
`DEFAULT_CABLE_ZONES`/`channelToZone`/`isMasterChannel`,
`preset/multisample.ts` `fitSamples`, `preset/notes.ts` `NOTE_NAMES_*`,
`preset/params.ts` `UNPATCHED_GLOBAL_PARAMS`, `preset/ranges.ts`
`UNBOUNDED_TOP_NOTE`, `preset/sound.ts` `setParamHex`, `samples/roots.ts`
`byFileName`, `kit/classify.ts` `DRUM_ORDER`.

**Test-only exports** (fine, but they are API surface with no product
caller): `FOLLOW_*_CC_C11/C13`, `ccToKnobPos`, `knobPosToParamValue`,
`feedbackSlot`, `hasLowerZone`, `usbInputZones`, `LFO_RATE_NEUTRAL`,
`EXP_TABLE_SMALL`, `lfoMenuRateHz`, `pulseWidthRendered`,
`midpointTopNotes`, `noteOctave`, `noteWithinOctave`, `GLOBAL_SOURCES`,
`isMultiSample`, `normalizeRanges`, `envelopeWord`, `cablePhrase(s)`,
`summariseKit`, `supportsFor`, `discardsFileRoots`, `fitOffset`,
`sampleFolder`, `isBlankRow`, `classifyDrum`, `shareReadme`, `crc32`,
`formatVersion`, `compareVersions`, `MIN_COL`, `IDEAL_COL`,
`FALLBACK_FIRMWARE`, `PARAM_HELP`, `GROUPS`.

**Type exports with no importer** (harmless; most of `preset/types.ts` is
documentation): the exception is `LocalSample` / `DroppedSample(s)`, which
should become the one shared `{ relPath, file }` type instead of three
declarations.

**Dependencies**: all used. `@types/node`, `svelte-check`, `typescript`,
`wrangler` are tooling-only, as expected.

**`sources.ts:41-42`** stray double blank line; `sources.ts:8` re-exports
`ALL_SOURCES`/`SOURCE_FEATURE` while `options.ts:38` imports the same from
core.

---

## 10. Stale firmware citations

Checked against the refs each comment names.

**Wrong name or wrong ref**

- `xml/generate.ts:55`, `preset/order.ts:11`, `xml/generate.test.ts:52`
  cite `Kit::writeToFile`. No such function; it is `Kit::writeDataToFile`
  (`kit.cpp:98`; `types.ts:20` has it right).
- `midi/followsettings.ts:15-16` cites `upstream/community bef6d9df`, but
  `writeSpecificChannelSettingsToFile`, `feedbackChannelTypeMap`,
  `getNameFromBool`, `upstreamUSBMIDICable1` and
  `midiCCReceivedForSelectedOrActiveClip` do not exist at that ref; they
  exist at 3f898e95 / `beta`.
- The same snapshot is labelled four ways: `upstream/main 3f898e95`
  (`generate.ts:9`), `beta 3f898e95` (`generate.ts:55,79`),
  `main at 3f898e95` (`features.ts:25`), `tag beta, e7bae53` (`stock.ts:9`).
  Locally the `beta` tag is e7bae539 and 3f898e95 is on `upstream/main`.
  Pick one spelling.
- `features.ts:173-181` `maxVoices` sits under the "community 1.2.0" header
  with `c1.1.0`; `:314-321` `midiFollow` under "1.3.0" with `c1.1.0`.
  Values right, headers misleading.
- `multisample.ts:46` says `LOOP_MODE` mirrors `LOOP_MODE_NAMES`; the two
  tables are defined independently. Derive one.

**Line drift** (fact still holds; line moved)

| Comment | Cited | Now |
|---|---|---|
| `preset/notes.ts:4` | `functions.cpp:1710` | 1917 |
| `preset/sound.ts:195` | `sound.cpp:4260` | 4227 |
| `preset/ranges.ts:189` | `sound.cpp:3527` | 3495 |
| `preset/ranges.ts:295,450,545,632` | `storage/multi_range/multi_range.cpp:…` | the functions are in `gui/menu_item/multi_range.cpp` (68, 282) |
| `preset/multisample.ts:12,17` | `sample_browser.cpp:1791-1805, 1863-1882` | 1640, 1818 |
| `kit/build.ts:8` | `definitions_cxx.hpp:495` | 519 |
| `random/patch.ts:291` | `:272, 807, 808` | 288, 769, 770 |

---

## 11. Suggested order of work

1. **Bugs** (§1 items 1–4, 6–9): scanner and `checkMissing` error classes,
   `card.need()`, mounted-card write verification, dialog z-index and
   Escape, FatFS text off the screen, unknown-firmware warning,
   `ARP_MODE_NAMES`, the unison tooltip. Each is small and independent.
2. **MIDI Follow help** (§3): rewrite `FollowHelp.svelte` to the proposed
   copy, rename the advice prefix and menu items in `followsettings.ts`,
   give advice lines a level, fix `README.md:57,65`, relabel the header.
3. **Docs** (§2): the fourteen stale claims, then a README paragraph each
   for the kit builder, Overwrite, Download Zip, and the missing decisions
   (pipelining, Changes collapsing, the arp-off greyed row or its removal).
4. **Generate the e2e fake** from the TS fake (§8), and capture the four
   fixtures that replace hand-written XML (settings files, c1.2.1 init
   synth, Community Enums, MIDI + CV kit rows).
5. **Shared UI pieces** (§5): `Dialog`, `CardBrowser`, `Status`, `Panel`
   with a title prop, `Seg` with `aria-pressed`, `filepick`/`saveBlob`
   helpers, `.btn.go` and status classes in `theme.css`. This removes most
   of the copied CSS and the five card-browser copies in one pass.
6. **State layer** (§6): `Activity` + `CardBrowser` store extraction, the
   three non-reactive private fields, `$state.raw` on replace-only values,
   the `sampleSync` registration inversion, naming (`source`, `cardPath`,
   `open`).
7. **Core** (§7): break the `sound.ts`/`stock.ts` cycle, complete or drop
   the barrels, one `stemOf`/`fixedpoint`/`clamp`, split `ranges.ts`,
   refresh the citations in §10.
8. **Tests** (§8): the four table tests (gates, options, names, order),
   the shared helpers, `forbidOnly` and a PR trigger in CI.
9. **Dead code** (§9) and the copy consistency pass (§4): spelling of
   firmware terms, casing rule, placeholder form, duplicated sentences into
   constants.
