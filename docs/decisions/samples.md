# Kits, sample ranges and the sample library

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

## Kit rows built from samples are clones of the blank kit's row

The kit builder (issue #10) never authors a sound. Every row it adds is a
deep clone of the one row in `src/assets/templates/Default Kit.XML` — the row
the firmware itself creates for the new-kit gesture — with exactly five
things set: the row name, `osc1`'s `type` (sample, which the template already
says), its `fileName`, the zone, and the loop mode.
The zone end is the WAV's exact frame count, data-chunk bytes over block
align, which is the same arithmetic the firmware runs on load
(`Sample::finalizeAfterLoad`, `model/sample/sample.cpp:1715-1729`,
upstream/community bef6d9df) and what it re-saves after a manual sample
selection (`SampleHolder::setAudioFile`). Loop mode is `1` — ONCE
(`SampleRepeatMode`, `definitions_cxx.hpp:495`) — like every factory drum
row and the firmware-authored `Kit Sample Rows.XML` fixture.

Row order is guessed from file names alone (regex, no audio analysis):
kick on the bottom pad — first in the file, like the factory kits — then
snare, closed hat, open hat, clap, rim, toms, cymbals, percussion, rest.
It is a guess by design; the rows table makes reordering cheap (drag or ▲▼).

The share zip (`src/core/kit/share.ts`) stores entries uncompressed — the
payload is WAV audio and one small XML, so deflate would buy little and cost
a dependency — and all metadata (author, licensing, source) goes in the
README, never into the kit XML, so the packaged kit stays byte-identical to
the saved one.

## A range edit writes the file the instrument would have written

The multisample range list (`src/core/preset/ranges.ts`) is one list whichever
of the two shapes a file uses: the `<sampleRanges>` array, or the single range
the firmware flattens onto the `<osc>` itself. Which shape gets written follows
the count, the way the serializer's own `numRanges > 1` does, so adding a
second sample or deleting back down to one moves `fileName`/`transpose`/`cents`
and the `<zone>` across on its own.

Every write then holds the invariants the firmware's reader and writer require
together: top notes strictly ascending and unique (a duplicate is
`Error::FILE_CORRUPTED` and the whole preset fails to load), exactly one range
without a `rangeTopNote` and it is the last, never the literal 32767 the
absent attribute means, and every range at least one note wide. The bounds an
edit clamps to are the instrument's own (`MultiRange::selectEncoderAction`),
as are the splits an insert makes and the space a delete hands back.

Two consequences worth naming:

- Ranges are **reordered on the first edit, never on load**. The firmware's
  reader inserts them sorted whatever order the file listed them in, so
  document order carries no information — but leaving a file out of order
  would make it differ from the one the instrument writes. A well-formed
  preset is untouched: surveyed on 2026-08-31, of the 769 presets on a real
  card backup normalising changed only 11, all written by some other tool, all
  of them carrying a
  redundant `rangeTopNote` on the topmost range that the instrument itself
  drops when it re-saves.
- **Velocity-keyed ranges are passed through, not edited.** Stock firmware
  keys ranges by note and writes `rangeTopNote` only; a fork that adds
  velocity layers to drum rows writes `rangeTopVelocity` in its place, and
  those files are on real cards. Such a range has no top *note*, so ordering
  or repairing it would invent bounds the file never had. `isVelocityKeyed`
  makes every write refuse and the ranges come back out untouched — the same
  answer pass-through gives everything else the editor does not model. The
  fixture that proves it (`fork-c1.3.0-local-fixes-fbba6b4f/`) was captured
  from that fork build rather than copied off the card, because the card's
  velocity kits turn out to be computer-written; see `tests/fixtures/SOURCES.md`.

## The range editor is as wide as the page

Every other section is a masonry panel a few hundred pixels wide. The range
editor is not: its point is the **key map**, and a violin patch with seventy
key zones needs the whole page before the bands are anything but stripes. So
the oscillator panel keeps a thumbnail map and a button, and the editor itself
opens full width between the flow strip and the panels (`RangeEditor.svelte`).
The map's arithmetic is pure and tested in Node (`src/ui/keymap.ts`), including
what a band can say at a given width — span and sample, sample alone, span
alone, or nothing.

Three things follow from the model rather than from taste:

- **Root note is a field; `transpose`/`cents` are not.** The file already
  carries the root losslessly (`root = 60 - transpose - cents / 100`), so the
  editor shows and writes the root and stores nothing extra — no sidecar, no
  editor-only attribute the device's next save would drop. The stored pair is
  still shown, in the list, because a preset can carry deliberate detuning.
- **A range given a new sample gets a fresh zone.** The old `endSamplePos`
  belongs to the old file's length. Browsing the card reads the new WAV's
  header over SysEx for its frame count.
- **Dragging a split reports the note under the pointer and nothing more.**
  Every clamp is the instrument's, in `setRangeTopNote`, so no gesture on the
  map can ask for a file the Deluge would refuse to load.

## A multi-sample import that reads names and asks, instead of guessing

The instrument builds a multi-sampled synth from a folder with an FFT
(`Sample::determinePitch`, `model/sample/sample.cpp:1269`) because it cannot
read a filename as text and cannot ask anyone. We can do both, so the import
(issue #33) ships **no pitch detector**. What it takes from the firmware is
the knowledge rather than the necessity: the embedded root note from the WAV's
`smpl`/`inst` chunks, read the device's way (`storage/audio/audio_file.cpp`),
and the device's own discard rule — every file in a folder declaring the *same*
note means a lazy exporter tagged them all, so the whole set is thrown away
(`SampleBrowser::loadAllSamplesInFolder`, `sample_browser.cpp:1360`). On Tim's
card that rule fires on about a third of the library; it is load-bearing.

Below the tags, file names carry the import — never at face value. One integer
offset is fitted for the whole folder against whatever files do declare a
root, and the folder offset stays visible and adjustable, because Salamander
names middle C as C4 and would otherwise land a whole piano an octave out.
Rows nothing places are **flagged, never dropped**, which is the firmware's
worst behaviour here, and every row says where its answer came from. Measured
against the card backup (a 2026-08 survey), the cascade put 728 of 832
ranges on the root the device stored; `tests/corpus-roots.test.ts` holds the
line at more than 800 ranges and 85 % placed, and skips when the backup isn't
there. The shortfall is folders with neither a tag nor a note name, and the
test pins them by name.

**One panel, no Build button.** The import had both at first — a review table
of its own and a button to commit it — and the first preset built that way was
saved silent, because the panel had been opened, the folder read and the file
downloaded without the confirming click. Nothing else in this editor works
like that: a knob writes when you turn it, and the only commit is saving. So
the import is one question — where are the samples, this computer or the
Deluge — and the answer lands as ranges in the range editor. There is no
second panel to reconcile with the first, because the range editor already is
the review: it lists every range with its file, root, keys and zone.

What the import knows that the range editor cannot work out for itself sits in
a row above the table for as long as it is useful: the folder it came from,
where each root came from (a column, spelled out in a legend — provenance is
the point, so it cannot depend on a tooltip), and **the files it could not
place**, which the firmware drops silently and this lists with a note field
and an Add button. The folder offset became `shiftRanges`: it moves every root
and every boundary by whole semitones, so it repairs a library named against a
different middle C — and, being an ordinary range edit, works on any
multi-sampled oscillator, imported or loaded from a card.

Asking the question turns the target into a sample oscillator straight away,
so the panel and the waveform never disagree, and dismissing it without
choosing a folder puts the waveform back: a sample oscillator with no sample
is silent on the instrument, and that silence is now called out in amber in
the oscillator panel wherever it occurs.

Everything downstream of the roots is the firmware's arithmetic, in
`src/core/preset/multisample.ts`: midpoint boundaries, the zone a freshly
chosen sample gets (a loop with a shorter tail than the loop itself becomes
the zone end, `sample_holder_for_voice.cpp:170-203`), and the repeat mode a
set implies. The review table shows the same `fitSamples` result the writer
consumes, so what the user is shown and what the oscillator gets cannot drift
apart. Boundaries are computed **only** at import — across the same 36 presets
the midpoint rule held for 716 of 783 adjacent pairs in the same survey (the
test asserts more than 90 % exact and 95 % within a semitone), and every clear
miss is a preset a human touched, so a boundary that isn't the midpoint is a
decision, not a defect.

**Re-detecting the roots of a preset that already has them.** The same reading
runs the other way round, on ranges that are already on an oscillator: read
the files they point at — held bytes first, then over SysEx from the card —
and offer what the cascade makes of them. The instrument cannot do this at
all. Its only route to the question is a whole-folder re-import that deletes
every range first, so a preset with hand-placed splits cannot be re-rooted on
the hardware; here it is a proposal that says what would move, from where to
where and on what evidence, and is applied or turned down.

Three things it deliberately does not do. It does not touch boundaries — the
midpoint rule is an import-time answer and a split that disagrees with it is a
decision. It does not anchor the folder's offset to the roots already stored:
fitting the answer to what is there would report "nothing to change" for
exactly the library that is uniformly an octave out, which is the case this
exists for, so a folder with no tags of its own gets an assumed offset that
says so and Shift all moves the lot afterwards. And it never silently leaves a
range unexplained: one the cascade cannot place keeps the root it has and is
captioned `kept`. Folders are resolved one at a time, because both the discard
rule and the offset are properties of a library rather than of a preset.

Two consequences elsewhere. The bytes of locally sourced samples moved out of
the kit builder into a shared stash (`src/ui/state/samples.svelte.ts`): a
sample-based synth needs the same preview, card push, retarget-on-save and
missing-file warning a kit does, and none of that was ever about kits. And a
save now writes **samples first, preset second** — the Deluge loads a preset
whose samples are absent without complaining and plays it silently
(`Source::loadAllSamples` ignores the per-range error, `processing/source.cpp:105`),
so the preset must never be the thing that lands first.

## The sample library rewrites text, and moves the sample before the references

**Open › Sample library on Deluge** does what Deluge Commander does on a mounted
card — see which songs, kits and synths name a sample, and rename, move or
delete it with those files updated — over SysEx, on the card in the
instrument. Three choices in how, each with a reason.

**References are found and rewritten as text, not through the tree.** The
firmware writes a sample path in exactly two places: `fileName` on every
oscillator range (`Sound::writeSourceToFile`, `processing/sound/sound.cpp:3635`
and `:3703`, upstream/community b6062d7) and `filePath` on a song's audio
clips (`AudioClip::writeDataToFile`, `model/clip/audio_clip.cpp:1059`); a
song embeds its instruments, so it carries both. `src/core/library/refs.ts`
matches those two attributes — and their pre-3.0 element form, which the
reader still accepts — and splices the value. Songs are files this editor
does not model; parsing one and generating it back would be a round-trip
promise the fixtures don't yet cover, while a splice provably changes only
the path. The test is the same bar as everywhere else: the rewritten kit
fixture is the fixture with one value changed, and still reproduces itself
byte for byte.

**Paths compare the way the card compares them.** FAT names are
case-insensitive and the firmware matches folders with `memcasecmp`
(`gui/ui/browser/sample_browser.cpp:139`), so a reference spelled
`samples/drums/KICK.WAV` names the same file as `SAMPLES/Drums/Kick.wav`
and is rewritten with it; a folder move keeps each reference's own tail,
spelling and all. `f_rename` allows a change of case alone
(`src/fatfs/ff.c:5208-5213`), so `kick.wav` → `Kick.wav` is a plain rename.

**The sample moves first, then the files, each swapped in beside itself.**
`f_rename` is one operation the card does or refuses (FR_EXIST on a taken
name, and nothing has changed); everything after it is text the panel can
retry. Each referencing file is written as `X.XML.tmp`, verified by
read-back, then `X.XML` → `X.XML.bak`, tmp → `X.XML`, bak removed. Writing
over `X.XML` directly would truncate it on open, and a transfer that died
mid-song would leave the song gone; with the swap, an interruption leaves
the original, or a complete copy under the right name with a `.bak` beside
it that the instrument never lists (`Browser::readFileItemsForFolder` keeps
only `allowedFileExtensionsXML`, `gui/ui/browser/browser.cpp:67`). A file
that fails is reported by name as still carrying the old path, and Rescan
plus a second move is the retry.

Three things follow. The three folders the firmware records into
(`SAMPLES/CLIPS`, `RECORD`, `RESAMPLE`; `storage/audio/audio_file_manager.h:44`)
are shown but never renamed, moved or deleted. Delete is offered only when
the index says nothing names the sample. And a song or preset the Deluge
has open holds its paths in RAM and writes those back on save
(`audioFile->filePath`), which would undo the move — the panel says so, and
the preset open in this editor is retargeted as an ordinary edit the
Changes dock lists, for the same reason.

The index — one record per `.XML` under `SONGS/`, `KITS/`, `SYNTHS/` with
its size, FAT timestamp and referenced paths — is the cost of the feature:
a card of songs can be many megabytes at ~170 KB/s. It is read once, kept in
memory across moves, cached in localStorage, and a rescan re-reads only files
whose listing entry changed. Files the Deluge writes all carry the 1969
timestamp, so in practice the size is the change detector; *Rescan all*
exists for the rewrite that keeps the length.

**The same panel works on a card in a reader.** `src/ui/localcard.ts` is a
second `CardFS` over the browser's File System Access API (Chrome and Edge,
the same browsers Web MIDI needs): `showDirectoryPicker` in `readwrite` mode
is both the folder choice and the write permission, and a folder is accepted
only when it has `SAMPLES/` beside `SONGS/`, `KITS/` or `SYNTHS/`, so a stray
folder is never indexed. Everything above it — the reference scan, the move
order, the swap-in, the guards — is the same code, which is why the abstract
`CardFS` was worth having. Two things differ underneath. A file rename uses
the handle's own `move()` where the browser has it; a folder is copied and
then removed, because no browser moves a directory handle. And the change
detector is `lastModified` rather than FAT's date words, so a card seen both
ways gets two indexes rather than one that lies. It lives beside `dropdir.ts`
rather than in `src/core/` because happy-dom has no such API; it is tested
end to end against Chrome's origin-private file system instead, which is a
real `FileSystemDirectoryHandle`.

It is an item under Open, not a fourth menu: issue #37 folded the bar's
commands into three so the file name has room, and a fourth menu costs
exactly that room (the bar test measures it). It sits under Open because it
opens the card's samples, set apart from the presets by a rule.

The file operations are the protocol's own `rename`, `delete` and `mkdir`
(`smSysex::rename`, `deleteFile`, `createDirectory`, `storage/smsysex.cpp`),
present since smSysex's first commit (7759705a #2853, 2024-11-11), so the
existing `smSysex` feature gate covers them. The later `move` and `copy`
ops (c23730b9 #3775, 2025-06-03) are not used: `f_rename` already moves
across folders on one card, and a c1.3.0 nightly from before June 2025
lacks the newer ops while carrying the same version string.

## A `._` file is named, not parsed

Finder drops an AppleDouble sidecar (`._NAME.XML`) beside every file it
touches on a FAT card. It matches the file picker's filter and drag-and-drop
bypasses the filter entirely, but it is binary. Loading one says what it is
and which file to open instead, rather than surfacing the XML parser's
confusion (issue #24). The card browsers hide dotfiles for the same reason.
