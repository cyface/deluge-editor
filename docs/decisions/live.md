# Live Edit

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*. The protocol itself is
`docs/live-edit.md`.

## Live addresses are flat paths at the edge and file names on the wire

The `param` op names a parameter by the string `paramNameForFile` writes for
a cable destination (`src/deluge/modulation/params/param.cpp`), and the
firmware resolves it back with `fileStringToParam`. Not by number: Tim's
fork renumbers the unpatched range (`param.h`, `local-fixes`), so an id on
the wire would be right on one branch and wrong on the other. And not by a
third name table of the protocol's own: the editor already has the
`<defaultParams>` attribute names and the cable names and the bridge
between them (`src/core/preset/params.ts`, `follow.ts`), so
`src/core/live/address.ts` translates a flattened path into a `param`
request and `apply.ts` translates a `^chg` entry back onto the tree, and
nothing between them knows the wire spelling.

The translation has two tables because the firmware has two, and they
disagree on the same attribute. A sound (a synth, or a kit row) resolves
`fileStringToParam(Kind::UNPATCHED_SOUND, name, allowPatched=true)`, which
scans the patched ids first, so `<defaultParams volume>` must go out as
`volumePostFX` — plain `volume` lands on `LOCAL_VOLUME`, a real `AutoParam`
that no file attribute holds. The kit bus resolves
`Kind::UNPATCHED_GLOBAL` with patched ids excluded, and that table spells
the same attribute `volume` and `<defaultParams pitchAdjust>` `pitchAdjust`
(the `volumePostFX`/`pitch` spellings exist only `forMidiFollowFile`). So a
synth's `volume` and a kit's `volume` are different words on the wire, and
the translator is where that is decided, once. The firmware backs this up:
a plain `param` naming `LOCAL_VOLUME` or `GLOBAL_VOLUME_POST_REVERB_SEND`,
the two patched params `Sound::writeParamsToFile` never writes, is refused
with `why: "name"`, because the smoke test once set a kit row's `volume`,
read it back, and found it missing from the saved file. `tempo` has no word at all
(`paramNameForFile` returns nothing for `UNPATCHED_TEMPO`) and goes by the
whole-document path like every enum does.

A kit row is addressed by its index in the drum list (`Kit::getDrumIndex`),
which counts MIDI and gate rows too; the flattener indexes by tag
(`sound[2]` is the third `<sound>`, not the third row), so `rowSegments`
recovers the document order from the flat map rather than trusting the
bracket.

## A live op's failure is a word, not a number

Every live reply ends in `err` and, on failure, `why`: one word the client
acts on (`off`, `busy`, `exists`, `noDrum`, `name`, …). The client keys off
the word (`LiveError.why`) and keeps the number only for the log. The
numbers are the firmware's `Error` enum, whose values moved during the
design (the doc had `FILE_ALREADY_EXISTS` as 18; it is 17), and `SysexError`
already uses the same small integers for FatFS results, so a code alone would
be ambiguous twice over. `off` matters most: every live op answers it while
the device's **Sysex Live Edit** toggle is off, so an editor learns the
reason in one round trip instead of timing out, and only a firmware without
the ops at all is silent.

## The card is the buffer, and `/TEMP` is made once

Pull is `save {keep}` to `/TEMP/LIVE.XML` then the existing `read`; push is
the existing `write` there then `load {as}`. No new transfer op, and the
bytes pulled are exactly what Save → Synth would write, so diffing them
against the card copy is the round-trip check every load already runs.
`StorageManager::createFile` does not build missing folders (only the song
saver calls `buildPathToFile`), so `LiveTransfer` creates `/TEMP` once per
session and treats FR_EXIST as the expected answer. A RAM buffer behind a
reserved fid is a later optimisation, if the card round trip is ever felt.

## The store's document is the device's, and it adopts the pull whole

`^dirty` says something that is not a parameter changed on the device. The
work list had the editor pull the preset and apply the diff to its tree,
which needed an ordered `ensureAtPath` so an element the file lacked would be
inserted where the firmware writes it. The store (`src/ui/state/live.svelte.ts`)
does not diff-apply: when the pulled bytes differ from `editor.output` it
parses them and replaces `editor.preset`. The pulled document *is* the
firmware's serialisation, so element order is right by construction, and a
diff-apply could at best reproduce it. The Svelte proxy re-renders whatever
read the old tree; `row` and `focus` are untouched. A pull that confirms
what `^chg` already delivered only resets the baseline.

Two rules keep the pull from fighting our own writes. A `^dirty` whose `gen`
is at or below the `gen` of the last whole-document exchange (the `save`
reply of a pull, the `load` reply of a push) describes a state we have
already read or replaced and is ignored. And a pull is skipped while a push
of ours is pending: the device is about to hold our document, so what it
holds now is not worth reading. That is last-writer-wins, and the writer is
the editor, which is what editing means.

## Fast sends wait behind a pending push; a refused push keeps the edit

A structural edit (an enum, a cable, a row) marks the document for a push,
debounced 150 ms so a burst of clicks is one push. The baseline adopts the
new document at once — otherwise every knob turned before the push landed
would read as a structural diff again and go by the slow path, killing
voices on every step of a drag. Fast `param` sends are held while a push is
pending or in flight: the push carries the latest document anyway, and a
row index the device does not have yet (a row just added, or the rows after
a deleted one) would land on the wrong row. They resume once the load has
answered; a value the push already carried is sent once more, harmlessly.

When the device refuses the push (`busy`: a menu or browser is open on it),
the store does not pull to restore the truth — that would throw the user's
edit away for the sake of a menu being open. It keeps the document wanted,
says why in `error`, and retries every 2 s until the device takes it. A
`param` the device refuses (`noDrum`, `name`) falls back to the whole
document the same way, since the document carries every value.

## The echo filter remembers every recent value, not the last

Follow filters the instrument's echo of a CC by the last value sent per CC.
Live Edit filters by (path, value) too, but keeps every value sent in the
last second: a drag sends A then B, and a late echo of A must not read as
the device moving back to A and be written over B. The firmware suppresses
its own push for a `param` write, so on a correct firmware the filter sees
nothing; it exists for the load after a whole-document push and for any
firmware that does not suppress. A device move that arrives while a fast
send for the same path is still queued wins: the queued send is dropped,
because the device's state is the truth and the value the device just set
is the one the file would hold.

## Save is the device's write, reported against what it read back

While Live Edit holds a preset, the card store's two saves (the panel's
Save, the menu's Overwrite) do not `write` the editor's bytes; they hand the
path to `live.save` (`card.liveSave`), which asks the device to `save` its
own instrument the way Save → Synth does. The document is the device's, so
the file Save → Synth would write is the one to keep, and writing our own
serialisation instead would save a file the device has never held — an edit
still on its way, a value the device moved a moment ago. For the same reason
the save first flushes whatever is pending (the debounced push, the queued
fast writes): the file must hold every edit made here, and a device that
will not take the document (a menu open on it) fails the save rather than
writing a stale one.

The file is then read back and diffed against the flattened document the
device was holding, and the editor is marked saved against *those* bytes,
not against `editor.output`. Zero differences is the round-trip bar, met by
the firmware itself. Anything else is reported as an error although the
file is written, and because `source` is now the file, the Changes dock
shows exactly where the editor and the firmware disagree: a serialiser
difference worth a fixture, not something to hide behind a green tick.

The overwrite warning stays the card panel's two-click arming, from its
listing; the device's `exists` answer is the last word and arms the panel
when the listing was stale. The menu's Overwrite item is named for what it
does and always overwrites. No sample copy runs on a live save: the device
holds what it plays, and a sample only this computer has is not something
the device's own save can carry — a local sample in live mode is an open
gap, not a case this path pretends to cover.

A save to a different path renames the device's instrument (`keep: 0`),
as its own save-as does, and the store adopts the new identity *before* the
request goes out: the device's `^inst` announcing the new name can be
delivered ahead of the reply being handled, and with the old identity still
in place it would read as a preset switch and re-open. On `exists` or a
failure the old identity is put back.

## The Live button is shown by the firmware table and switched by the grant

Every control here is gated by `supports(version, feature)`, and the button
is no exception: `FEATURES.liveEdit` cites the fork branch and puts the
button on any `c1.3.0` file. But the ops exist so far only on Tim's fork,
and a fork build writes the same `c1.3.0` as stock, so the version cannot
say whether *this* Deluge has them — only the session grant can (`"live": 1`,
`card.liveVersion`), and the grant is only known once connected. So the
table decides whether the button is shown and the grant whether it works.
With no connection the button is enabled and entering connects, the way
Open › From Deluge does; a Deluge that has answered without `live` in its
grant (a firmware without the ops, or the **Sysex Live Edit** toggle off)
leaves it disabled with that reason as the tooltip, and the mode itself
refuses with the same sentence if it is reached another way. The button is
also offered with nothing loaded, as Follow's is (`decisions/follow.md`):
the mode needs no file first, it brings the device's.

## Follow Mode and Live Edit are exclusive, and the buttons enforce it

Both write the device's moves into the tree, and Live Edit sends the tree's
moves back. On together, a CC Follow mirrored would be diffed against the
live baseline and sent to the device again as a `param`, and a live `^chg`
would be echoed back out as a CC. So entering either leaves the other. That
happens in the two top-bar handlers rather than in the stores: the stores
would otherwise have to import each other, and both are module singletons
with `$effect.root` at load, where a cycle is a real hazard for no gain.


## The row goes both ways, and the device's report is not a pick while ours is in flight

A row picked in the editor is `select`ed on the device (`live.selectRow`,
from an effect on `editor.row`), so the gold knobs, the pads and MIDI Follow
land on the row being edited; a row picked on the pads arrives as `^inst`
and selects here. Both directions through one field would chase each other:
our `select` makes the device push `^inst` with that row, and a device that
follows us must not be read as leading. So the store keeps the row the two
last agreed on, an offer of that row is not a pick, and a device report is
ignored while a pick of ours is queued or in flight or a push is in flight —
the report describes the row the device had before it followed. Picks are
held behind a pending push like the fast writes (the row may not exist on
the device yet) and coalesced to the latest. And a whole-document `load`
lands the device on its first row (the new instrument's selected drum is not
the old one's), so after every push the editor's row is re-asserted; without
that, changing an enum on row 3 would jump the device, and then the editor,
to row 1. A refused `select` is a notice, not an error: the editor's row is
still the editor's, and the next pick tries again.

## A save on the device is `edited` dropping to 0, and the file becomes `source`

The device's own Save → Synth/Kit has no push of its own; it shows as `^inst`
with `edited: 0` where the previous report had 1 (or as the next `sub`
reply, if the push was missed). The store then reads the card file back as
`source`, silently: the tree is still the device's, only the card copy
changed, so the Changes dock empties and nothing else moves. The store's own
`save` reads the file back itself and marks the editor saved against it, so
the transition is not acted on while that save is between its request and
its `markSaved` — the device's `^inst` for our save can arrive before the
reply is handled. A save on the device to a different name arrives as a
different identity and re-opens, which reads `source` anyway.
