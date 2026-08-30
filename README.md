# Deluge Editor

A browser-based preset editor for the [Synthstrom Deluge](https://synthstrom.com/product/deluge/).
Edits synth and kit presets as XML, offline (load / download) or live on the
Deluge's SD card over Web MIDI SysEx.

**Status:** greenfield. Nothing works yet.

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
pnpm build      # static bundle in dist/
pnpm deploy     # build + wrangler deploy to Cloudflare Workers
```

Web MIDI SysEx needs Chrome or Edge. XML editing works anywhere.

## Layout

```
src/core/     framework-free TypeScript: params, xml, sysex. No Svelte imports.
src/ui/       Svelte 5 components.
tests/        cross-cutting tests and Deluge-authored XML fixtures.
docs/         decisions log and how the fixtures are captured from DelugEmu.
```

The test that matters is the round-trip: parse a Deluge-authored preset,
generate it back, and compare *flattened path → value maps*. Zero values lost,
changed, or added; second save byte-identical to the first. Fixtures live in
`tests/fixtures/` — see the README there.

## License

MIT — see [LICENSE](LICENSE).
