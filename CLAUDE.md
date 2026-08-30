# CLAUDE.md

Guidance for AI assistants working in this repository. Read `README.md` and
`docs/decisions.md` first — they are short and they are the rules.

## What this is

A from-scratch Svelte 5 + TypeScript preset editor for the Synthstrom Deluge.
Public at github.com/cyface/deluge-editor, MIT. Work is tracked as GitHub
issues in dependency order (`gh issue list`).

- `src/core/` — framework-free TypeScript (params, xml, sysex, firmware). No
  Svelte or DOM imports beyond `DOMParser`; tests run in Node via happy-dom.
- `src/ui/` — Svelte 5 (runes) components.
- `tests/` — cross-cutting tests and the Deluge-authored XML fixtures.

```sh
pnpm test    # vitest, once      pnpm check   # svelte-check + tsc
pnpm build   # static bundle     pnpm dev     # vite
```

## Rules that are easy to get wrong

- **Do not port code from `~/WebstormProjects/Deluge-Synth-Editor`** (the
  upstream fork this project is inspired by). Read it for firmware facts and
  past traps only; Tim wants to "start fresh and compare notes".
- **No "CFW" badges.** A control the selected firmware can't honour is omitted,
  decided by `supports(version, feature)` in `src/core/firmware/`. Every
  `FEATURES` entry cites firmware source (path, commit, or release note); an
  uncited entry is a guess and gets reverted.
- **Round-trip fidelity is the bar**: parse a Deluge-authored preset, generate
  it back, compare flattened path→value maps (`src/core/xml/flatten.ts`) with
  zero missing/added/changed entries, then a byte-identical second save.
  Everything unmodelled passes through; element order is preserved; hex
  strings stay strings in state.
- **Enum strings match the firmware's string tables character for character.**
  The Deluge accepts bad XML silently: an unknown enum string resolves to the
  *last* table entry, `<unison num="0">` loads and is silent.
- **Fixtures are Deluge-authored, never hand-written.** Hand-written XML tests
  our assumptions, not the firmware. See `tests/fixtures/README.md` and
  `tests/fixtures/SOURCES.md`; the capture process is `docs/fixture-capture.md`,
  automated by the `deluge-fixtures` skill (`.claude/skills/deluge-fixtures/`).
- `.idea/` is intentionally tracked. Never remove it or add it to `.gitignore`.
- Commit and push only when Tim asks. Commits carry the standard Claude
  co-author trailer.

## Ground truth and references on this machine

- Firmware source: SynthstromAudible/DelugeFirmware, branch `beta`. Local
  checkout at `~/WebstormProjects/DelugeFirmwareTW` (Tim's fork; its
  `local-fixes` branch carries fork-only features that stock firmware does not
  have — cite `upstream/community` or the `beta` tag, not `local-fixes`).
  Serializer: `src/deluge/processing/sound/sound.cpp` (`Sound::writeToFile`),
  `src/deluge/model/instrument/kit.cpp`; enum string tables in
  `src/deluge/util/functions.cpp` and `storage/storage_manager.cpp`.
  Official 4.1.4 source is the same repo's `synthstrom-official` branch
  (flat `src/`, writes `firmwareVersion="4.1.4-alpha"`); community releases
  are tags `release_1_0` … `release_1_2_1`. To date a feature, `git grep` the
  XML name at the release tag — `git tag --contains` misses cherry-picks onto
  the `release/1.x` branches.
- The firmware checkout's `.claude/skills/deluge-preset-xml/SKILL.md`
  (`local-fixes` branch) documents patcher arithmetic, envelope tables, sample
  range rules and serializer element order, all verified against source.
- DelugEmu: `/Applications/DelugEmu.app`; card image folder
  `~/Library/Application Support/DelugEmu/sdcard_rw`. Driving it over QMP is
  documented in `docs/fixture-capture.md`.
- Official firmware binaries are not obtainable: 4.x presets come only from
  files real hardware wrote (the fixtures include some).
