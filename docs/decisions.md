# Decisions

Things that look like bugs or omissions but are deliberate. Add the *why*; cite
firmware source where the Deluge's behaviour is the reason.

## Firmware-gated UI, not "CFW" badges

Every feature that isn't in all firmware the editor targets is declared in
`src/core/firmware/features.ts` with the minimum version that supports it, per
lineage (official `4.x.y` / community `c1.x.y`). The UI asks
`supports(selectedFirmware, feature)` and **omits** the control entirely when
the answer is no. No badges, no greyed-out rows, no "community firmware only"
labels sprinkled through the UI.

Why: the Deluge accepts unknown XML silently and does something else with it
(see the upstream editor's decisions log — `lpfMode="SVF"` turning the filter
off is the canonical case). A control the selected firmware can't honour is a
trap, and a badge is a warning the user has to read every time. Removing the
control is the only version that can't be misread.

Consequences:
- The selected firmware is UI state, defaulting to the loaded preset's
  `firmwareVersion` attribute. A preset can be *re-targeted* by changing it,
  which may drop controls; the values behind them still round-trip untouched
  via pass-through.
- Feature entries cite the firmware commit, table, or release note that
  introduced them. An entry without a citation is a guess and gets reverted.
- Versions compare only within a lineage. A feature that lists only a
  `community` minimum is unsupported on every official build, and vice versa.

## Core is framework-free

`src/core/` imports nothing from Svelte or the DOM beyond `DOMParser`, which
`happy-dom` provides under test. This is what makes the round-trip test run in
Node on every commit instead of by hand against an SD card.

## Round-trip compares values, not names

`tests/roundtrip.test.ts` flattens both documents to path→value maps and
requires zero missing, added, or changed entries, then a byte-identical second
save. Name-only comparison has passed while values were being corrupted.
