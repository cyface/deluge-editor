# Firmware versions and gating

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

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

## The selected firmware defaults to the file's, else to 4.1.4

The controls are gated for the version in the top-bar pill. It starts as the
loaded file's `firmwareVersion`; a file without one (the pre-3.0 nested format)
or with one the editor can't parse starts at official `4.1.4`, the most
conservative target, so no community-only control is offered for a file
whose origin is unknown. Changing the pill changes nothing in the file — only
which controls exist — and the values behind hidden controls still round-trip,
including the file's own version attributes (see "A save never restamps the
file's firmware attributes"). Once a real device has been seen, the file's attribute stops being a default at
all — see "The connected Deluge outranks the file's firmware attribute".

## The connected Deluge outranks the file's firmware attribute

`firmwareVersion` in a preset says who *wrote* the file; a connected device
says what will *run* it. When a Deluge answers the identity inquiry, the
firmware selector locks to its version — a static pill, no dropdown, because
the device is the ground truth and overriding it would only mislead. The lock
**sticks**: after disconnect the dropdown returns with the last-connected
version still selected, and loading a file no longer resets it from its
attribute (the "saved by firmware …" label still shows provenance). The pill
carries a green dot while connected (see "The bar's commands are menus").

Two firmware facts make this sound: the identity reply carries
`FIRMWARE_VERSION_MAJOR/MINOR/PATCH` (`src/deluge/io/midi/midi_engine.cpp:784`),
and official 4.1.4 throws away all incoming SysEx (`synthstrom-official`
`src/midiengine.cpp:531`), so a Deluge that answers at all runs community
firmware — mapping the reply to lineage `c` is cited, not guessed. Unplugging
is noticed via `MIDIAccess.onstatechange`, which drops the card panel to an
error with a retry rather than letting a dead connection look alive.

## A save never restamps the file's firmware attributes

Retargeting the pill changes which controls exist. It does not change what a
save writes for `firmwareVersion` or `earliestCompatibleFirmware` (issue #28):
both pass through like any other unmodelled value, so a New Synth saved
against a 4.1.4 target still says `c1.3.0` — the firmware that actually wrote
those bytes. That looks like an oversight and is the reverse: restamping
either one silently changes the file's values on the instrument.

**`earliestCompatibleFirmware` is not provenance.** Every family writes the
same hardcoded string for an instrument, whatever version it is: `4.1.0-alpha`
in community 1.0 through 1.3 (`model/output.cpp:234` and
`processing/sound/sound_drum.cpp:123` on `beta`, the same literal back at
`release_1_0`) and in official 4.1.4 (`synthstrom-official`
`src/Output.cpp:180`); official 4.0.1 wrote `4.0.0`, and the fixtures carry
both. It is the reader's refuse-to-load floor, not a stamp:
`tryReadingFirmwareTagFromFile` returns `FILE_FIRMWARE_VERSION_TOO_NEW` when
it is newer than the running firmware (`storage/Deserializer.cpp:874`).
Raising it to the selected target can only lock out firmware that reads the
file fine, and a community string there locks out *every* official build,
whose `stringToFirmwareVersion` maps anything it doesn't recognise to
`FIRMWARE_TOO_NEW` (`synthstrom-official` `src/functions.cpp:1977`).

**`firmwareVersion` is the reader's conversion key.** It becomes
`song_firmware_version`, and the reader applies legacy fixups below fixed
thresholds: filter modes cleared on an FM patch below community 1.2.0
(`processing/sound/sound.cpp:3238`), resonance volume compensation below
official 1.2.0 (`sound.cpp:3245`), default expression patching below official
4.0.0-beta (`sound.cpp:263`). Firmware ordering compares lineage *first* — a
defaulted `operator<=>` over fields with `type_` declared first, and
`COMMUNITY = 254` (`util/firmware_version.h.in:9,45`) — so every official
version is "older" than every community one. Restamping a community-authored
FM preset to `4.1.4` would therefore have community firmware force `hpfMode`
and `lpfMode` to OFF as it loads. That is the `lpfMode="SVF"` trap again, with
the editor writing it this time.

Passing the file's own value through is not just the safe default here, it is
the correct one, and for a reason particular to this editor: we carry values
through rather than rebuilding them, so a 2.x preset still holds 2.x values
and the fixups its stamp asks for are exactly the ones those values still
need. A file with no `firmwareVersion` keeps none — the reader starts at
official 0.0.0 (`Deserializer.cpp:77`), which is what an unstamped pre-3.0
file means. (The upstream editor pins a literal `c1.3.0` instead, for the
opposite and equally correct reason: it regenerates every file from a modern
template, so it has nothing old left to convert.)

The consequence for the UI is that the pill promises less than its name
suggests, and says so: it gates controls, and the top bar keeps showing "saved
by firmware …" beside it because that is the attribute a save preserves.

**What would change this:** a fixup threshold *above* c1.3.0, which would
start converting values in files we write. Check the `song_firmware_version`
comparisons in the reader before assuming the pass-through is still free.
