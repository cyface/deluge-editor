# Decisions

Things that look like bugs or omissions but are deliberate. Add the *why*; cite
firmware source where the Deluge's behaviour is the reason.

The log is split by area under `docs/decisions/`. Read the file for the area you
are touching; the titles below are the ones code comments cite. A new entry goes
at the end of its area file and gets a line here.

## [Core and round-trip fidelity](decisions/core.md)

- [Core is framework-free](decisions/core.md#core-is-framework-free)
- [Round-trip compares values, not names](decisions/core.md#round-trip-compares-values-not-names)
- [State is the file's strings, in the file's order](decisions/core.md#state-is-the-files-strings-in-the-files-order)
- [No XML escaping](decisions/core.md#no-xml-escaping)
- [Numbers are shown as the Deluge shows them](decisions/core.md#numbers-are-shown-as-the-deluge-shows-them)
- [The summariser is a pure function in core](decisions/core.md#the-summariser-is-a-pure-function-in-core)
- [New starts from a Deluge-authored template, not a built preset](decisions/core.md#new-starts-from-a-deluge-authored-template-not-a-built-preset)

## [Firmware versions and gating](decisions/firmware.md)

- [Firmware-gated UI, not "CFW" badges](decisions/firmware.md#firmware-gated-ui-not-cfw-badges)
- [The selected firmware defaults to the file's, else to 4.1.4](decisions/firmware.md#the-selected-firmware-defaults-to-the-files-else-to-4-1-4)
- [The connected Deluge outranks the file's firmware attribute](decisions/firmware.md#the-connected-deluge-outranks-the-files-firmware-attribute)
- [A save never restamps the file's firmware attributes](decisions/firmware.md#a-save-never-restamps-the-files-firmware-attributes)

## [The card over SysEx](decisions/card.md)

- [A save to the card is verified, not assumed](decisions/card.md#a-save-to-the-card-is-verified-not-assumed)
- [A second editor is detected and named, not locked out](decisions/card.md#a-second-editor-is-detected-and-named-not-locked-out)
- [Bulk SysEx runs two requests deep, and only when the firmware says so](decisions/card.md#bulk-sysex-runs-two-requests-deep-and-only-when-the-firmware-says-so)

## [Follow Mode](decisions/follow.md)

- [Follow Mode is a mode, and sending is a second switch inside it](decisions/follow.md#follow-mode-is-a-mode-and-sending-is-a-second-switch-inside-it)
- [Follow Mode's header is controls, and its prose is behind a button](decisions/follow.md#follow-modes-header-is-controls-and-its-prose-is-behind-a-button)
- [Follow Mode asks the Deluge what its channel actually is](decisions/follow.md#follow-mode-asks-the-deluge-what-its-channel-actually-is)
- [Follow Mode does not need a file first](decisions/follow.md#follow-mode-does-not-need-a-file-first)

## [Kits, sample ranges and the sample library](decisions/samples.md)

- [Kit rows built from samples are clones of the blank kit's row](decisions/samples.md#kit-rows-built-from-samples-are-clones-of-the-blank-kits-row)
- [A range edit writes the file the instrument would have written](decisions/samples.md#a-range-edit-writes-the-file-the-instrument-would-have-written)
- [The range editor is as wide as the page](decisions/samples.md#the-range-editor-is-as-wide-as-the-page)
- [A multi-sample import that reads names and asks, instead of guessing](decisions/samples.md#a-multi-sample-import-that-reads-names-and-asks-instead-of-guessing)
- [The sample library rewrites text, and moves the sample before the references](decisions/samples.md#the-sample-library-rewrites-text-and-moves-the-sample-before-the-references)
- [A `._` file is named, not parsed](decisions/samples.md#a-file-is-named-not-parsed)

## [The randomizer](decisions/random.md)

- [The randomizer rolls in the firmware's terms, not in hex](decisions/random.md#the-randomizer-rolls-in-the-firmwares-terms-not-in-hex)
- [A roll is edits, not a mode](decisions/random.md#a-roll-is-edits-not-a-mode)

## [Editor UI](decisions/ui.md)

- [Tooltip copy is one cited table, keyed the way the file names parameters](decisions/ui.md#tooltip-copy-is-one-cited-table-keyed-the-way-the-file-names-parameters)
- [A graph is drawn where a picture is the control, and it is a sketch](decisions/ui.md#a-graph-is-drawn-where-a-picture-is-the-control-and-it-is-a-sketch)
- [The bar's commands are menus; its modes are buttons](decisions/ui.md#the-bars-commands-are-menus-its-modes-are-buttons)
- [Every section at once, dealt into measured columns](decisions/ui.md#every-section-at-once-dealt-into-measured-columns)
- [A modulation source is picked on the knob, not in a matrix](decisions/ui.md#a-modulation-source-is-picked-on-the-knob-not-in-a-matrix)
- [Gold knobs are a panel of summaries](decisions/ui.md#gold-knobs-are-a-panel-of-summaries)
