# The randomizer

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

## The randomizer rolls in the firmware's terms, not in hex

`src/core/random/patch.ts` writes through the same accessors the panels do
(`src/core/preset/sound.ts`, `src/core/xml/edit.ts`) in the same menu numbers
the OLED shows, and takes every string from `src/core/preset/enums.ts`. Three
things fall out of that and are the point of it:

- A value the selected firmware can't honour is never rolled. The gates are
  `src/core/firmware/gates.ts` — the *same* maps that decide which options the
  selects offer, moved to core so there is one list rather than two. Rolling
  for 4.1.4 and rolling for c1.3.0 produce different files.
- A cable is only made where the instrument would patch it.
  `cableAllowed` (`src/core/preset/patching.ts`) is
  `Sound::maySourcePatchToParam` (sound.cpp:1335): no per-voice source into a
  per-sound param, nothing into post-FX volume, only the sidechain into
  post-reverb volume, no envelope into voice volume, no modulators outside FM,
  no filter cables into a filter that is off, no cable into a synced LFO's own
  rate. A cable the firmware refuses is not an error — it loads, saves and
  does nothing, which is exactly what a generator must not produce. The
  30-plus cables a wild roll could make are also held under
  `kMaxNumPatchCables` (32), past which the reader silently stops.
- Everything it doesn't touch passes through untouched, so a rolled preset
  round-trips and saves like any other file, and the changes dock can put any
  single value back.

The *ranges* are the one judgement call, and they are marked as such in the
source rather than dressed up as firmware facts. They exist because both
Python randomizers in the prior art (issue #30) report the same finding: full-range
randomisation produces unusable patches. So one oscillator is always at full
level, the cutoff has a floor, delay feedback stays in the low end of the knob,
envelopes are drawn from archetypes rather than four independent numbers, and
modulation is weighted towards destinations that do something audible.

## A roll is edits, not a mode

Randomize has no "accept" or "discard": it writes the same state the knobs
write. That is why it needs no undo of its own — the changes dock already
lists every value against the loaded file and reverts them one at a time —
and why re-rolling is safe: each roll writes *absolute* values into the
sections in scope, so ten rolls wander around the file rather than compounding
away from it. A roll keeps the cables whose source is expression (velocity,
aftertouch, note, the MPE axes, the sidechain), replacing only the modulation
it made itself, and an oscillator that carries a sample or wavetable keeps its
type and its file: a generator that threw away the samples somebody chose
would be a generator nobody uses twice.

Seeds are part of that honesty. Every roll reports the seed it used, so a
patch can be reproduced exactly — which is also what makes the ranges and the
firmware gating testable at all (`src/core/random/patch.test.ts` sweeps 120
seeds at four intensities against both firmware lineages).

The editor's Randomize and the firmware's own **Randomizer** panel are
different things — the latter is the arpeggiator's per-note probability and
spread menu — and they never share wording or colour. That panel and the gold
knob assignments are also the two blocks a roll never touches
(`RANDOM_SECTIONS`, `src/core/random/patch.ts`): neither is a sound, and a
preset whose gold knobs move every roll is a preset you can't play.

Every roll also names the preset (`src/core/random/names.ts`). A generator
that leaves everything called UNNAMED on the Deluge makes a folder of rolls unusable, and
the Deluge shows the file name and nothing else. The name is read back from
the rolled sound through the same accessors the panels use, so "FM BELL" is
an FM patch and "SAW SWELL" really has a slow attack.
