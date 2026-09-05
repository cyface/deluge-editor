# Live-edit smSysex smoke test

`live_smoke.py` drives every op of the **Live Edit** protocol
(`docs/live-edit.md`) against real firmware running in
[DelugEmu](https://github.com/gramster/delugemu), from plain Python — no
editor, no Web MIDI. It is the firmware-side counterpart to the editor work
listed in the design doc: proof that `inst`, `param`, `save`, `load`,
`select` and `sub` behave as the protocol says before the `SmsClient` ops are
built against them.

This is **not** a unit test. Vitest only globs `*.test.ts`, so it never runs
in `pnpm test`. It needs macOS, DelugEmu, and a firmware binary built with the
feature — so it is a manual integration check you run when the firmware side
changes.

## Running it

```sh
# build the firmware first, in the DelugeFirmwareTW checkout:
#   ./dbt build release        -> build/Release/deluge.bin
python3 tests/live-edit/live_smoke.py            # uses that build by default
python3 tests/live-edit/live_smoke.py --fw /path/to/deluge.bin
python3 tests/live-edit/live_smoke.py --transport din   # DIN instead of USB
```

The firmware must have the **Sysex Live Edit** community feature compiled in
(the `feature/live-edit-sysex` branch of Tim's fork). The harness turns the
feature *on* itself, by writing `SETTINGS/CommunityFeatures.XML` on the card
it builds; it does not need it enabled in the binary's defaults.

Defaults: `--fw` is `$DELUGE_FW` or
`~/WebstormProjects/DelugeFirmwareTW/build/Release/deluge.bin`; `--out` is
`work/` beside the script (git-ignored) and holds the throwaway card, the
pulled presets, per-cable wire logs, OLED screenshots and `RESULTS.md`.

Each run is one ~40 s emulator session. It refuses to start if a
`qemu-system-arm` is already up, because DelugEmu writes its card image back
on exit and a second instance would clobber it.

## What it is, mechanically

- **Self-contained card.** It copies two Deluge-authored fixtures from
  `tests/fixtures/` — a synth (`Sine AnalogSaw Patch Cables.XML`, saved as
  `SYNTHS/Tim.XML` so the boot song loads it) and a kit
  (`Kit Velocity Layers.XML`) — and writes a stand-in 8-frame WAV for every
  sample the kit names. Nothing depends on a real Deluge card.
- **Raw smSysex in Python.** `Sms` speaks the frame format from
  `src/core/sysex/frame.ts` and the 7-bit packing from
  `src/core/sysex/pack.ts`: a session handshake, msgId-matched requests, the
  file ops (`open`/`read`/`write`/`close`) for pull and push, and the live
  ops. Sequence-0 frames are collected as device pushes (`^inst`, `^chg`,
  `^dirty`).
- **QMP for the device side.** `Qmp` sends key and pointer events over QEMU's
  monitor socket to turn a gold knob, pick a kit row on the pads, open a
  browser, and screendump the OLED — so device→editor pushes can be
  provoked and checked.

### The USB nudge

DelugEmu's hosted-USB emulation only hands the guest's MIDI-OUT bytes to the
socket when an inbound USB packet arrives, so a reply shorter than one 64-byte
packet can sit in the emulated controller until the next request. On hardware
the audio routine's MIDI timer flushes USB output every few milliseconds, so
this never shows. The harness sends a universal identity request every 100 ms
on the USB cable to keep the pipe moving; the firmware's identity reply is
ignored. This is an **emulator** workaround, not a protocol requirement.

## Reading the results

`RESULTS.md` (and stdout) tag each check **PASS**, **FAIL**, or **INFO**.
INFO rows are observations that are not pass/fail — a firmware `Error` number
to reconcile with the doc, a check skipped because the emulated menu did not
move, DIN behaviour that only hardware can confirm. The process exits non-zero
only if a non-INFO check fails.

## Known findings (2026-09-05, firmware `feature/live-edit-sysex`)

- **Unknown `param` name crashed the firmware** (data abort): an unmatched
  name resolves to the `GLOBAL_NONE` sentinel, which is below `UNPATCHED_START`,
  so it was accepted as a patched id and indexed out of range. Fixed by
  rejecting the sentinel in `smSysex::live::setParam` (`isRealParam`), commit
  `4bd820a9` on `feature/live-edit-sysex`; the harness's bad-name checks
  guard against a regression.
  The harness cannot run without this fix — a firmware data abort wedges the
  whole emulator.
- **A kit row's `volume` never reached a preset save** — and the name was
  wrong, not the row path. On the wire `volume` is `LOCAL_VOLUME`, a
  cable-only destination no `<defaultParams>` attribute holds; the attribute
  called `volume` is `GLOBAL_VOLUME_POST_FX`, spelled `volumePostFX`
  (`docs/decisions/live.md`), which is what the editor sends. A diagnostic
  run showed the row write landing in the clip's note row, the manager
  `Kit::writeToFile` saves from. The firmware now refuses `volume` and
  `volumePostReverbSend` as plain params with `why: "name"`, and the harness
  spells the row's volume `volumePostFX`; a row written by index is checked
  in the saved kit and after a reload. Clean pass on 2026-09-05.
- **`docs/live-edit.md` `Error` numbers were off by one** — the firmware's
  `PRESET_IN_USE` is 15, `FILE_ALREADY_EXISTS` 17, `FILE_NOT_FOUND` 18. The
  editor keys off the `why` word, not the number, so this is documentation
  only; the doc has been corrected.
- **`^param` echoed the raw `drum` argument, not the resolved row.** Fixed:
  the reply reports the row that was resolved, so a no-`drum` param on a kit
  answers with the selected row's index.
- **DIN not verified in the emulator.** DelugEmu does not feed guest
  sysex-in over the `--midi` serial chardev the way it does USB, so no
  session grant arrives on DIN. The editor uses USB (Web MIDI); DIN needs a
  hardware check.
