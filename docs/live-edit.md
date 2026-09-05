# Live Edit: the Deluge's sound as the document

Design for editing the instrument the Deluge has *live*, in real time, from
this editor, and saving it back over its own file the way Save → Synth does on
the device. The protocol and the work list, grounded in what the firmware
already has; what is built is marked below. Firmware citations are `beta`
(`e7bae539`) unless marked `[local-fixes]` (Tim's fork, `5c886c66`).

## The workflow this is for

1. Pick a synth or kit on the Deluge, start the clip playing.
2. Open the editor. It shows *that* sound, as the Deluge holds it in RAM,
   not the file on the card.
3. Turn a knob here, the sound changes there. Turn a knob there, the control
   moves here. Change an oscillator type, add a patch cable, swap a sample,
   the same.
4. Press Save. The editor asks the Deluge to write its own preset over its
   own file, with the same overwrite warning the device gives, and the
   editor confirms the file on the card now matches what it shows.

## Why MIDI Follow cannot be stretched to this

Follow Mode (`docs/decisions/follow.md`) is the best that stock community
firmware allows, and it stops well short:

- A CC is 7 bits of a 128-position knob, so a follow value never lands on
  the menu step the device would show, and it never says which sound or
  which kit row it belongs to.
- It reaches only `AutoParam`s with a learned CC: the `<defaultParams>`
  attributes. It cannot touch any enum (`osc1@type`, `lfo1@type`,
  `modFXType`, filter modes, arp mode, sync levels, polarity...), any
  structural edit (add or remove a cable, a sample range, a kit row), any
  path (`fileName`), any of `<unison>`, `<sidechain>`, `<audioCompressor>`,
  `<arpeggiator>`'s integers, transpose, or a patch cable's amount. The
  survey of the editor's controls against `followmaps.ts` is the gap list
  and it is most of the editor.
- The send direction is hostage to the device's takeover mode, MPE zones and
  port choice, and the feedback filter makes a correct send look broken for
  a second.

So a new protocol is needed, and it should be the existing smSysex JSON
protocol with new ops, not a second transport. The editor already speaks it
(`src/core/sysex/`), sessions, retries and pipelining included.

## The model: the Deluge's in-RAM instrument is the document

Every editable thing in this editor already has one address: the preset's
XML path (`src/core/xml/flatten.ts`, e.g. `sound/osc1@type`,
`sound/defaultParams@lpfFrequency`,
`kit/soundSources/sound[2]/defaultParams@volume`), and the firmware already
has a complete parser and writer for that document (`Sound::readTagFromFile`,
`Sound::writeToFile`). Rather than inventing a parameter schema for the wire
and maintaining a third name table, the protocol treats the XML as the
document and adds exactly two kinds of write:

- **Fast path, for continuous values.** The ~110 automatable parameters (the
  `<defaultParams>` attributes, per envelope/EQ child, and patch cable
  amounts) are set by name with a full int32, straight into the `AutoParam`,
  the way MIDI Follow does but without the CC, the 7-bit loss, or takeover.
  Round trip is a few milliseconds; a knob drag streams.
- **Whole-document path, for everything else.** Any other edit (an enum, a
  cable added, a sample path, a kit row) sends the preset XML and the device
  reloads its instrument from it in place, keeping the instrument's name and
  folder so a later save still targets the original file. This is what the
  device itself does when you change an oscillator type (it kills voices and
  re-sets up patching), and it is the hot reload Tim's fork already has
  (`[local-fixes] smsysex.cpp:322` `reloadPresetFromFile`). Round trip is
  the size of the file over SysEx plus the load: roughly 100 to 300 ms for a
  synth. Those edits are discrete clicks, so that is fine.

And one kind of read: the device serializes its current instrument, the
editor reads it. That is the bytes Save would write, so opening a live sound
here and diffing it against the file on the card is the same round-trip
check the editor already runs on every load.

Consequence worth stating: **the device's state is the truth and the editor
is a view of it.** The editor's "unsaved changes" dock keeps working with no
new concept: `source` is the file read off the card, the tree is the device's
state, the diff is what Save would change.

## Protocol

All ops are smSysex JSON requests (`F0 00 21 7B 01 04 <seq> {json} F7`) with
`^op` replies, as documented in the firmware's `SysExProtocolNotes.md`.
Device-initiated messages use the sequence number 0 form that the same
document reserves and nothing uses yet (`startDirect`, `smsysex.cpp:116`).
Every reply stays under 740 bytes (the `[local-fixes] ^view` cap; macOS
mangles outgoing frames over 752, cyface/DelugeFirmware#42).

### Capability

The `^session` grant gains `"live": 1` (a protocol version), next to the
`pipe` field. The editor enables the mode only when the grant carries it,
the same negotiated gate the pipelining decision chose over version checks
(`docs/decisions/card.md`). A `FEATURES` entry `liveEdit` cites the firmware
commit for the docs and the firmware selector; the grant is what actually
switches it on.

### Errors, on every op

Every reply ends in `"err"`: 0 on success, otherwise the firmware's `Error`
value (the `Error` enum in `src/definitions_cxx.hpp`, e.g. `PRESET_IN_USE`,
`FILE_ALREADY_EXISTS`, `FILE_NOT_FOUND`) or 1 when the failure is the
protocol's own, plus `"why"`, one word the client can act on: `off` (the
feature toggle is off; every live op still answers, so a client learns why
instead of timing out), `noInst` (the current clip is not a synth or kit),
`busy`, `exists`, `sameName`, `path`, `notFound`, `load`, `save`, `noKit`,
`noDrum`, `noRow`, `noParam`, `name`, `src`.

### `inst`: what is current

```
→ {"inst": {}}
← {"^inst": {"type": "synth"|"kit"|"midi"|"cv"|"audio"|"none",
             "name": "Foo", "dir": "SYNTHS", "edited": 0|1,
             "drum": 2, "drumKind": "sound"|"midi"|"gate"|"none",
             "entire": 0|1, "gen": 17, "err": 0}}
```

From `getCurrentInstrument()` (`model/song/song.cpp:113`): `name`, `dirPath`
(stored without a leading slash), `editedByUser`. For a kit, `drum` is the
index of `Kit::selectedDrum` in the drum list (`Kit::getDrumFromIndex`,
which is the order `<soundSources>` is written in) or -1, and `entire` is the
clip's AFFECT ENTIRE. `gen` is a counter bumped on every edit (see pushes).

### `save`: write the current instrument to a file

```
→ {"save": {"path": "/SYNTHS/Foo.XML", "overwrite": 0|1, "keep": 0|1}}
← {"^save": {"path": "...", "err": 0 | EXISTS | SAME_NAME | BUSY | <fatfs>}}
```

`path` defaults to the instrument's own `dir/name.XML`. This is
`SaveInstrumentPresetUI::performSave` (`save_instrument_preset_ui.cpp:149`)
with the UI removed, which turns out to be all of it: `getCurrentFilePath` is
string assembly, then `StorageManager::createXMLFile(path, smSerializer,
mayOverwrite, false)` (`:181`), `instrument->writeToFile(getCurrentClip(),
currentSong)` (`:207`), `closeFileAfterWriting(path, header, "\n</sound>\n"
or "\n</kit>\n")` (`:225`), then `name`, `dirPath`, `mightExistOnCard` and
`editedByUser = false` (`:232`). `overwrite: 0` returns `EXISTS` instead of
opening `ContextMenuOverwriteFile`; the editor shows its own warning and
re-sends with `overwrite: 1`, the same two-click arming the card panel has.
The different-slot "SAME NAME" guard (`:158`) becomes an error code.
`keep: 1` writes the file but leaves the instrument's identity alone; that
is how the editor pulls the live preset (below).

### `load`: replace the current clip's instrument from a file

```
→ {"load": {"path": "/TEMP/LIVE.XML", "name": "Foo", "dir": "SYNTHS"}}
← {"^load": {...instrument fields..., "err": 0}}
```

`name` and `dir` are flat fields, not a nested object, because the
firmware's JSON reader is a tag walker and flat is what every existing op
does. With them the new instrument is marked `edited`, since it now differs
from its file by whatever the editor changed; without them it is a plain
preset load and the device shows the name the way it does for one.

### `select`: pick the kit row and AFFECT ENTIRE

```
→ {"select": {"drum": 2, "entire": 0|1}}        // either field may be omitted; drum -1 deselects
← {"^select": {...instrument fields..., "err": 0}}
```

Goes through `InstrumentClipView::setSelectedDrum` and the same
`setActiveModControllableTimelineCounter` the pads use, so the gold knobs,
the LEDs and MIDI Follow all follow.

`[local-fixes] reloadPresetFromFile` verbatim, with the path as an argument
and the identity match replaced by "the current clip's instrument":
`fileExists` → `loadInstrumentFromFile` → `loadAllAudioFiles` → purge the
hibernating copy → `replaceInstrument` → `instrumentSwapped` →
`view.instrumentChanged` → `uiNeedsRendering`. `as` restores `name` and
`dirPath` after the load so the instrument still saves over its original
file; without it the load is a plain preset load. `BUSY` when
`getCurrentUI() != getRootUI()`, for the reason the fork's comment gives:
a stacked menu or browser holds pointers into the old instrument.

### Pull and push the preset: compositions, not ops

- **Pull** = `save {path: "/TEMP/LIVE.XML", overwrite: 1, keep: 1}` then the
  existing `open`/`read`/`close`. The editor gets the exact bytes the
  device would save.
- **Push** = existing `open`/`write`/`close` to `/TEMP/LIVE.XML` then
  `load {path, as}`. (`[local-fixes]` already reloads on `close` when the
  path names a loaded preset; that stays as is and does not fire for the
  TEMP path, because the name does not match.)

The card is the buffer. `FileWriter` has a memory-based mode with a 32 KB
buffer (`storage_manager.h:101`, `.cpp:934`) and `FileReader` can read from
RAM (`.cpp:804`), so a RAM buffer served through a reserved `fid` is a later
optimisation if the SD round trip is ever felt. It needs a
`loadInstrumentFromFile` variant that takes an open deserializer, and it
does not cover a kit over 32 KB, so it is not phase one.

### `param`: set an automatable parameter

```
→ {"param": {"name": "lpfFrequency",
             "src": "lfo1",           // makes it a cable amount: sourceToString of the source
             "drum": 2 | "bus": 1,    // kit only; a synth takes neither
             "value": -1073741824}}   // int32, the file's hex as a number; omit it to read
← {"^param": {"name": "...", "src"?, "drum"?|"bus"?, "value": <current>, "err": 0}}
```

No `kind` field: the name decides between patched and unpatched, and `src`
decides a cable. Names are `paramNameForFile` spellings, which are not
always the file's attribute names: a sound's `<defaultParams volume>` is
`volumePostFX` on the wire while the kit bus's is `volume`
(`docs/decisions/live.md`). The two patched params no attribute holds,
`LOCAL_VOLUME` (`volume`) and `GLOBAL_VOLUME_POST_REVERB_SEND`, are refused
as plain params with `why: "name"`, since a value set there would never
reach a save; they remain reachable as cable destinations. A kit takes either
`drum` (a row by index) or `bus` (the kit's own parameters, what AFFECT
ENTIRE reaches); when a kit gets neither, the selected row is used. A
`param` from the editor is applied with the push hooks suppressed, so the
device does not report the editor's own write back as a change. The reply's
`drum` is the row that was resolved, so a `param` without one on a kit
reports the selected row's index.

Exactly `MidiFollow::handleReceivedCC` (`midi_follow.cpp:1086-1111`) minus
the CC lookup and takeover: resolve the `ModelStackWithAutoParam` through
`Output::getModelStackWithParam` (synth `melodic_instrument.cpp:737`, kit
row and bus `kit.cpp:2002-2080`), then
`autoParam->setValuePossiblyForRegion(value, ...)`. Names are
`paramNameForFile` strings (`param.cpp:748`) resolved with
`fileStringToParam` (`:765`), never numeric IDs: `[local-fixes]` already
renumbers the unpatched range by +2 (`param.h:174`), so numbers on the wire
would be wrong on one branch or the other. The editor already has both
spellings and the bridge between attribute names and parameter names
(`PARAM_ATTR_TO_NAME`, `src/core/preset/params.ts`) plus the slot resolver
(`src/core/preset/follow.ts`).

A kit row is addressed by drum index, not by the selected drum, so the
editor can edit a row the device is not looking at. The firmware resolves
the row's `ParamManager` through the clip's note row for that drum, or the
song's backed-up manager when the drum has no row in the current clip.

`get` is the same shape without `value`; it exists for tests and for
re-syncing one knob.

### `sub`: subscribe to the device's own changes

```
→ {"sub": {"secs": 10}}                 // 0 releases; capped at 120
← {"^sub": {"secs": 10, ...instrument fields..., "err": 0}}
```

Latches the requesting cable with a lease, the way the OLED push does
(`hid_sysex.cpp:15`, `midiDisplayUntil = now + 2 s`) and the debug print
does (`sysex.cpp:34`, `midiDebugCable`). The editor renews it every few
seconds; an unplugged editor stops costing the device anything. One
subscriber at a time, last wins. The reply carries the instrument fields
and is the baseline the pushes are measured from. While the lease holds,
the device sends (sequence 0, command `Json`):

```
{"^chg": {"gen": 18, "p": [{"n": "lpfFrequency", "v": -1073741824, "d": 2}, ...]}}
      // "s": source for a cable amount; "d": kit row; "b": 1 the kit bus; neither: the synth
{"^dirty": {"gen": 19}}
{"^inst": {...}}      // same body as the reply
```

- **`^chg`** is fed from the one place every parameter value change passes:
  `ParamManager::notifyParamModifiedInSomeWay` (`param_manager.cpp:452`),
  which already has `currentValueChanged` computed and is where
  `view.notifyParamAutomationOccurred` is called. Encoders, menus, MIDI,
  automation playback and step edits all arrive there
  (`auto_param.cpp:300, 741, 1164`, `patch_cable_set.cpp:580`). The hook
  must only set a bit (a bitmap per kind, plus a small list for cables) in a
  pending set, because that call runs from the audio routine during
  automation. A repeating task next to `smSysex::handleNextSysEx`
  (`deluge.cpp:577`) drains the set every 25 ms, the coalescing interval
  `View::notifyParamAutomationOccurred` already uses (`view.cpp:1713`),
  reads each param's current value and sends one batched frame, guarded by
  `cable.sendBufferSpace()` the way `sendDisplayIfChanged` is
  (`hid_sysex.cpp:87`). Only changes on the current instrument are sent.
- **`^dirty`** covers every edit that is not a parameter value: menu
  selections, the sample browser, the slicer, cable add or remove. They all
  end in `Instrument::beenEdited` (`instrument.cpp:40`) or
  `SoundEditor::markInstrumentAsEdited` (`sound_editor.cpp:1105`), so the
  hook bumps `gen` there and the drain task sends it, throttled to a few
  per second. The editor answers a `^dirty` by pulling the preset and
  diffing it against its tree (`diffFlat`, `src/core/xml/flatten.ts`), so
  a pull that only confirms what `^chg` already delivered changes nothing.
- **`^inst`** is not hooked at all. The drain task keeps a snapshot of what
  `^inst` reports (the output, the selected drum, AFFECT ENTIRE, the edited
  flag) and pushes when it differs. That covers a preset load from the
  browser, a clip or song change, a row pick on the pads, the AFFECT ENTIRE
  button and Save → Synth on the device (`edited` goes to 0) without a hook
  at any of those sites, and it cannot miss one that is added later. A
  change of output also drops the pending changes, which belonged to the
  old one.
- **The drain is `smSysex::live::tick`**, called at the top of
  `smSysex::handleNextSysEx` on every pass of that task, which already runs
  every 0.2 ms whether or not a request is waiting. Nothing is sent from a
  hook, and every push first checks `sendBufferSpace()` on the leased cable.
  The change queue holds 48 entries, deduplicated by (owner, kind, id) with
  the newest value; if it overflows the whole batch is dropped and a `^dirty`
  goes instead, so the editor pulls.

## Firmware: what is built

Branch `feature/live-edit-sysex` in Tim's fork
(`~/WebstormProjects/DelugeFirmwareTW`), cut from `main` with the fork's
`claude/sysex-preset-hot-reload` branch merged in, since `load` generalises
that hot reload. Builds clean with `./dbt build release`.

Exercised in DelugEmu on 2026-09-05 by `tests/live-edit/live_smoke.py`, which
drives every op and watches the pushes over USB. All of `inst`, `param`
(synth, kit row and kit bus), `save`, `load`, `select` and `sub` pass,
including the `/TEMP/LIVE.XML` pull/push round trip byte-identical, a kit
row written by index reaching a preset save and surviving a reload, `^chg`
from a gold-knob turn, and `^inst` on a row pick. Two firmware findings came
out of it:

- **An unknown `param` name crashed the firmware** (data abort): an unmatched
  name resolves to `GLOBAL_NONE`, which is below `UNPATCHED_START`, so it was
  taken as a patched id and indexed out of range. Fixed by rejecting that
  sentinel in `setParam` (`isRealParam`), commit `4bd820a9` on
  `feature/live-edit-sysex` (merged into `local-fixes`, builds clean). The
  harness cannot run without it: a data abort wedges the whole emulator.
- **A kit row's `volume` looked lost on save, and was a wrong name.** The
  first run set a row's `volume` by index, read it back, and found it absent
  from the saved kit and gone after reload. The row path was blamed (the
  song's backed-up `ParamManager` instead of the note row's), but a
  diagnostic run showed the write landing in the clip's note row, exactly
  where `Kit::writeToFile` reads. The real cause is the name: on the wire,
  `volume` resolves through `fileStringToParam` to `LOCAL_VOLUME`, a real
  `AutoParam` that is only ever a cable destination and that no
  `<defaultParams>` attribute holds; the attribute called `volume` is
  `GLOBAL_VOLUME_POST_FX`, `volumePostFX` on the wire, which the editor
  already sends (`docs/decisions/live.md`). The same request would have
  failed on a synth; the harness had only ever set a synth's `lpfFrequency`
  and `pan`. Fixed on two sides: the `param` op now refuses the two
  attribute-less patched params (`LOCAL_VOLUME`,
  `GLOBAL_VOLUME_POST_REVERB_SEND`) with `why: "name"` so a wrong spelling
  cannot silently edit an unsaveable value, and reports the resolved row in
  its reply; the harness spells the row's volume `volumePostFX` and checks a
  row write by index, and a synth's `volumePostFX`, in the saved file. Clean
  pass, 74 checks, on 2026-09-05.

Not yet run on hardware; DIN is unverified (DelugEmu does not feed guest
sysex-in over its serial chardev the way it does USB).

**Firmware to-do, before the editor side leans on these ops:** (1) ~~commit
the unknown-name crash fix~~ done, `4bd820a9`; (2) ~~the kit-row `volume`
finding above~~ resolved, a name, not the row path; (3) ~~re-run
`tests/live-edit/live_smoke.py` to a clean pass~~ done, 74 passed on
2026-09-05, with the `param` refusal and resolved-row reply uncommitted on
`local-fixes`; (4) verify on hardware, including DIN.

- `src/deluge/storage/smsysex_live.{h,cpp}`: every op above (`inst`,
  `save`, `load`, `select`, `param`, `sub`), the shared
  `swapInstrumentFromFile` that the close-triggered hot reload now calls
  too, the two hooks' bodies, and `tick`.
- `smsysex.cpp`: dispatch entries through `liveOp`, which answers `why:
  "off"` while the toggle is off; `tick` at the top of `handleNextSysEx`;
  `"live": 1` in the `^session` grant while the toggle is on.
- Hooks: one line in `ParamManager::notifyParamModifiedInSomeWay`
  (`param_manager.cpp`) and one in `Instrument::beenEdited`
  (`instrument.cpp`). Both return at once unless a subscriber is live.
- Community feature toggle **Sysex Live Edit** (`SysexLiveEdit`,
  `sysexLiveEdit` in `CommunityFeatures.XML`, 7-seg `SXLE`), default off,
  registered next to the fork's `sysexPresetReload`.

Everything runs in the existing SysEx task, never in an interrupt or the
audio routine. `save` and `load` do card I/O the way the file ops do, behind
the same `currentlyAccessingCard` guard; `load` also refuses with `busy`
while any UI is stacked on the root view. No buffer sizes changed: every
request here is small, and preset bytes travel through the existing
512-byte `write` chunks.

## Editor: what is built (2026-09-05)

- The top bar's **Live Edit** button (`TopBar.svelte`), shown by
  `FEATURES.liveEdit`, and `LiveHeader.svelte` above the editor while the
  mode is on. The whole editor stays: every control reaches the device.

- `SmsClient` (`src/core/sysex/client.ts`): `inst`, `save`, `load`, `select`,
  `param`, `subscribe`; `live` read from the grant; sequence-0 pushes
  surfaced through the `onPush` option as `LivePush` (`^chg` spelled out as
  `LiveChange`s, `^dirty`, `^inst`). Failures are `LiveError` with the
  firmware's `why` word (`src/core/sysex/live.ts`). `save`/`load` run on a
  15 s first rung so a slow card load is not resent behind itself.
- `src/core/live/`: `classifyPath` (flat path → `param` address, or null for
  the whole-document path), `applyChange`/`changePath` (`^chg` → tree,
  through the ordered accessors), `LiveTransfer.pull`/`push` through
  `/TEMP/LIVE.XML`. The two firmware name tables and the drum-index rule
  are in `docs/decisions/live.md`.
- The fake Deluge (`src/core/sysex/fake-deluge.ts`) answers every live op
  from an in-RAM instrument and pushes to a `sub` lease, so all of the above
  is unit-tested (`src/core/live/*.test.ts`, `src/core/sysex/live.test.ts`),
  including every fixture's fast-path addresses mapping back to their paths.
- Save in live mode (`live.save`, reached from the card store's two save
  paths through `card.liveSave`): flush what is still on its way, `save`,
  read the file back, diff it against the document the device held, mark
  the editor saved against the bytes read. Tested in
  `src/ui/state/live.svelte.test.ts` ("saving").
- The row both ways (`live.selectRow`): a row picked in the editor is
  `select`ed on the device, latest pick only, held behind a pending push and
  re-asserted after every push since the load lands the device on its first
  row. A device-side save (`^inst` with `edited` dropping to 0) re-reads the
  card file as `source`. Tested in "the row" and "device → editor".

## Editor work list

- ~~`SmsClient`: the new ops~~ done, above.
- ~~`src/core/live/`~~ done, above. The lease renewal loop and the own-write
  echo filter are the store's, below.
- ~~`src/ui/state/live.svelte.ts`: the mode~~ done. On entry it connects
  through the card store, subscribes (the `sub` reply is the instrument), and
  if that is a synth or kit pulls the preset, `editor.load`s it, sets
  `editor.cardPath` from `dir/name` and reads the card file as `source` (null
  when the card has no such file). A clip that is not a synth or kit parks
  the mode as `waiting` until an `^inst` brings one. Change detection is the
  Follow pattern, "reads values, does not hook controls": one `$effect` on
  `editor.flatOutput` diffs it against a baseline; a changed path that
  classifies as fast is queued as a `param`, latest value per path, drained
  one request at a time; anything else marks the document for a push,
  debounced 150 ms, retried after 2 s when the device answers `busy`. Fast
  sends are held while a push is pending. Our own writes are filtered on the
  way back by (path, value) for one second, every recent value per path; a
  value that arrived from the device is written into the baseline and not
  re-sent. The lease is 10 s, renewed every 4 s, released on leaving.
  `docs/decisions/live.md` has the reasons.
- ~~Incoming `^chg`~~ writes through the ordered accessors (`applyChange`).
  ~~Incoming `^dirty`~~ pulls and, when the pulled document differs from the
  tree, adopts it whole rather than applying the diff, so the ordered
  `ensureAtPath` variant is not needed (`docs/decisions/live.md`). A
  `^dirty` at or below the `gen` of the last pull or push is stale and
  ignored. ~~Incoming `^inst`~~ with a different name or dir re-opens; a
  different `drum` selects the row; `edited` dropping to 0 with the same
  identity is a save on the device, and the card file is re-read as `source`.
- ~~Save: in live mode the Save button sends `save`, shows the overwrite
  warning on `EXISTS`, and on success reads the file back and `diffFlat`s
  it against `editor.output`. Zero entries is the round-trip bar met by
  the device itself; anything else is shown, because it means the editor
  and the firmware disagree about the file and that is a bug worth seeing.
  Then `editor.markSaved`.~~ Done. Both of the card store's saves (the
  panel's Save, the menu's Overwrite) go through the device while the mode
  holds a preset; the panel's two-click arming is the overwrite warning,
  and the device's own `exists` answer arms it when the listing was stale.
  A save to a new name renames the instrument on the device, as its own
  save-as does. `docs/decisions/live.md` has the reasons.
- ~~`FEATURES.liveEdit` with the firmware citation; the top bar gets a Live
  button beside Follow, enabled when the grant says so. Follow Mode stays
  for firmware without it.~~ Done. `FEATURES.liveEdit` (c1.3.0, citing the
  fork branch) decides whether the button is *shown*, as for every control;
  the grant decides whether it *works*, and since the grant is only known
  once connected, the button connects, and a Deluge that has answered
  without `live` leaves it disabled with the reason. `LiveHeader.svelte`
  above the editor: status, the instrument (`SYNTHS/Tim`, a kit's row or
  bus, unsaved on the device), the job running, counters, errors. Entering
  either mode leaves the other (`docs/decisions/live.md`). E2E:
  `tests/e2e/live.spec.ts`, with the fake granting `live`.
- ~~The second-editor warning (`card.otherEditor`) applies unchanged, and
  matters more: two subscribers each see the other's pushes as device
  moves. The lease is per cable, so only the last subscriber is pushed to;
  the panel should say so.~~ Done: the live header carries its own caution
  (`LIVE_OTHER_EDITOR_WARNING`) saying the pushes go to the last subscriber.
- ~~Selecting a row in the editor does not yet `select` on the device.~~
  Done: `live.selectRow`, from an effect on `editor.row`; the device's row
  report is not taken while a pick of ours is in flight, and the editor's row
  is re-asserted after a push (`docs/decisions/live.md`).
- ~~A device-side save does not yet re-read the card file as `source`.~~
  Done: `handleInst` reads the file when `edited` drops to 0 outside a save of
  the store's own.

## Hazards, named

- **Automation playback floods the choke point** at tick rate. The bit-set
  plus 25 ms drain sends the latest value per parameter, never every
  step. Smooth interpolation between nodes does not notify at all
  (`auto_param.cpp:907`), which is fine: the editor wants the value the
  file would hold.
- **A kit row without a note row** in the current clip has its params in
  the song's backup manager; `param` resolves that, or refuses with `noRow`.
  A row the clip holds is addressed through its note row, verified to be
  the manager `Kit::writeToFile` saves from.
- **Whole-document push kills voices** (`replaceInstrument`). So does the
  device's own oscillator-type change. A held note restarts; a playing
  clip continues. Acceptable for discrete edits; unacceptable for knobs,
  which is why the fast path exists and why the classifier must be right.
- **The TEMP write is a card write on every structural edit and every
  pull.** Tens of milliseconds and no wear worth counting, but it is why
  the RAM buffer is listed as a later step.
- **`local-fixes` versus `beta`.** Names on the wire, not IDs. The
  feature lands on the fork first; the protocol should be proposed
  upstream once it has run on hardware, since the smSysex file protocol
  itself came in that way.
- **Frame sizes.** Pushes are batched under 740 bytes; a `^chg` burst that
  does not fit is split across frames, never truncated.

## Open questions, answered (2026-09-05)

1. **Lease owner.** One subscriber at a time, last wins, like the display
   push. That is what is built.
2. **Save on the device while live.** The device's own Save → Synth pushes
   `^inst` with `edited: 0`; the editor then re-reads the card file as its
   new `source`, silently. Built (`adoptDeviceSave` in
   `src/ui/state/live.svelte.ts`).
3. **Kits.** Selecting a row in the editor also selects it on the device
   through `select`, so the gold knobs and the pads follow. Built
   (`selectRow`).
