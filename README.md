# Deluge Editor

A browser-based preset editor for the [Synthstrom Deluge](https://synthstrom.com/product/deluge/).
Edits synth and kit presets as XML, offline (load / download) or live on the
Deluge's SD card over Web MIDI SysEx.

**Use it now: <https://cyface.github.io/deluge-editor/>** — deployed from
`main` by CI, after the full test suite passes.

**Status:** the XML round-trip, the editor UI, and live load/save on the
Deluge's SD card over Web MIDI (community firmware 1.3.0+) all work.

## Inspired by

This project is inspired by [solaris76/Deluge-Synth-Editor](https://github.com/solaris76/Deluge-Synth-Editor) by Chris Griggs, and by the [DEx](https://github.com/silicakes/deluge-extensions) smSysex protocol work by silicakes

The XML format's ground truth is the [Deluge community firmware](https://github.com/SynthstromAudible/DelugeFirmware).

## Develop

```sh
pnpm install
pnpm dev        # Vite dev server
pnpm test       # Vitest, once
pnpm test:watch
pnpm check      # svelte-check + tsc
pnpm test:e2e   # Playwright smoke test against the built app (needs `pnpm exec playwright install chromium` once)
pnpm build      # static bundle in dist/
pnpm deploy     # build + wrangler deploy to Cloudflare Workers
```

Web MIDI SysEx needs Chrome or Edge. XML editing works anywhere.

## Layout

```
src/core/     framework-free TypeScript: params, xml, preset, firmware. No Svelte imports.
src/ui/       Svelte 5 components: the flow strip, the overview panels, the controls.
tests/        cross-cutting tests, the Playwright smoke test, Deluge-authored XML fixtures.
docs/         decisions log and how the fixtures are captured from DelugEmu.
```

## The editor

The whole preset is on one page. The **flow strip** at the top (Osc → Voice →
Filters → … → Out, modulators below) is the table of contents: click a block
to focus it, shift-click to pin several, click the strip's background to
expand everything. The OLED line above it is a mechanical summary of the
model. Controls are shown for the firmware in the top-right pill (defaulting
to the loaded file's) and a control that firmware can't honour is simply not
there. **Changes** lists every value that differs from the file you opened.

A sample oscillator with more than one sample opens a **range editor** the
width of the page: the key zones as bands across the keyboard, with the splits
draggable, plus root note, tuning and zone for whichever range is selected.

*From folder…* on an oscillator (or dropping a folder of pitched samples on a
synth) asks one question — are the samples on this computer or on the Deluge —
and builds the instrument: it works out what note each file was recorded at
from the note embedded in the WAV, then from its file name through one offset
fitted for the whole folder, and lands you in the range editor with the ranges
written. Each one says where its root came from, the key boundaries are the
instrument's own midpoints, anything it couldn't place is listed with a field
to give it a note rather than quietly dropped, and one control shifts every
root and boundary together when a library is named against a different middle
C. As everywhere else in the editor, the only commit is saving.

The test that matters is the round-trip: parse a Deluge-authored preset,
generate it back, and compare *flattened path → value maps*. Zero values lost,
changed, or added; second save byte-identical to the first. Fixtures live in
`tests/fixtures/` — see the README there.

## License

MIT — see [LICENSE](LICENSE).
