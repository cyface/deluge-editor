# Contributing

Thanks for wanting to help. This is a small project with a high bar for one
thing: **a preset that goes through the editor must come out as the Deluge
would have written it.** Most of what follows is how that bar is kept.

## Before you start

- **Talk on the issue first.** Work is tracked as GitHub issues, roughly in
  dependency order. Comment on the one you want to pick up with your plan
  before writing much code — scope and approach are easier to settle there
  than in review. For something with no issue, open one.
- **Read the decisions log.** [`docs/decisions.md`](docs/decisions.md) indexes
  one file per area under `docs/decisions/`. They record the things that look
  like bugs or omissions but are deliberate, and why. Read the file for the
  area you are touching before changing it.
- [`CLAUDE.md`](CLAUDE.md) is the same rules written for AI coding agents, with
  a map of the source tree. It mentions paths on the maintainer's machine; the
  rules apply everywhere, the paths don't.

## Setup

Node 24 and pnpm (the version is pinned in `package.json`'s `packageManager`;
`corepack enable` picks it up).

```sh
pnpm install
pnpm dev        # Vite dev server
pnpm test       # Vitest, once
pnpm check      # svelte-check + tsc
pnpm test:e2e   # Playwright specs against the built app
                # (needs `pnpm exec playwright install chromium` once)
```

CI runs `pnpm test`, `pnpm check` and `pnpm test:e2e` on every push and pull
request. All three must pass. Web MIDI SysEx needs Chrome or Edge; everything
else works in any browser.

## Where things go

- `src/core/` — framework-free TypeScript. No Svelte or DOM imports beyond
  `DOMParser`; its tests run in Node.
- `src/ui/` — Svelte 5 (runes) components and stores.
- Values are read and written only through `src/core/preset/sound.ts` and
  `src/core/xml/edit.ts`, never by setting `attrs` directly, so a new
  attribute lands where the firmware writes it.
- Unit tests sit beside their module (`foo.test.ts`); cross-cutting tests in
  `tests/`; Playwright specs in `tests/e2e/`; shared helpers in
  `tests/helpers/`.

## The rules

These are the ones that are easy to get wrong. A PR that breaks one will be
asked to change, however good the rest of it is.

**Round-trip fidelity.** Parse a Deluge-authored preset, generate it back, and
compare flattened path → value maps (`src/core/xml/flatten.ts`): zero
entries missing, added or changed, then a byte-identical second save.
Everything the editor doesn't model passes through untouched, element order
is preserved, and hex strings stay strings. A feature that writes XML needs a
test that holds it to this.

**The firmware is the ground truth, and every fact cites it.** The source is
[SynthstromAudible/DelugeFirmware](https://github.com/SynthstromAudible/DelugeFirmware).
When a change depends on how the firmware reads, writes or displays
something, cite the file and function (and a release tag or commit) in a code
comment. To date a feature, search for its XML name at the release tags
(`release_1_0` … ); the official 4.1.4 source is the `synthstrom-official`
branch. A firmware fact without a citation is a guess.

**Cite firmware code; don't copy it.** The firmware is GPL-3.0 and this
project is MIT, so firmware source can't be pasted or translated line by
line into this repository. Read it, cite it, and write our own.

**Don't port code from other Deluge editors.** This project is written from
scratch. Other editors (notably
[solaris76/Deluge-Synth-Editor](https://github.com/solaris76/Deluge-Synth-Editor))
are fine to read for firmware facts and known traps, but not to copy from.

**Firmware-gated UI, not badges.** A control the selected firmware can't
honour is left out, decided by `supports(version, feature)` in
`src/core/firmware/`. Every `FEATURES` entry cites the firmware source that
introduced it.

**Displayed numbers are the Deluge's own.** `src/core/params/scale.ts` is the
firmware's menu arithmetic. Don't invent a mapping for a new control: find
the menu item's `readCurrentValue` and cite it.

**Enum strings match the firmware's string tables character for character.**
The Deluge accepts bad XML silently — an unknown enum string loads as the
*last* table entry — so a typo is not an error you will see, it is a
different sound.

**Judgement calls are marked as judgement calls.** Some things (the
randomizer's ranges, for example) are taste rather than firmware fact. Say so
in the code, rather than dressing them up as one.

## Test fixtures

**Fixtures are Deluge-authored, never hand-written.** Hand-written XML tests
our assumptions, not the firmware. See
[`tests/fixtures/README.md`](tests/fixtures/README.md) for the sources in
order of preference, and add a row to `tests/fixtures/SOURCES.md` for every
file you add.

The preferred source is [DelugEmu](https://github.com/gramster/delugemu)
running the target firmware: a preset the emulated firmware saves is
Deluge-authored by definition. [`docs/fixture-capture.md`](docs/fixture-capture.md)
describes the process. If you can't capture a fixture you need, say so on the
issue or PR and the maintainer can capture it.

## Pull requests

- Keep a PR to one issue, or one part of one, and reference it.
- New behaviour comes with tests; a bug fix comes with a test that failed
  before it.
- If you made a deliberate choice that a later reader might mistake for a
  bug, add it to the area's file under `docs/decisions/` and add a line to
  the index in `docs/decisions.md`.
- `.idea/` is tracked on purpose; leave it in place.

By contributing you agree that your work is released under the project's
[MIT licence](LICENSE).
