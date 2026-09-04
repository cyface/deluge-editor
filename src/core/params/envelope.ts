/**
 * The ADSR graph's geometry.
 *
 * A sketch: time runs on a fixed scale so segment lengths compare across the
 * four envelopes and every handle can move both ways. The firmware's stages
 * are table lookups (`getDecay`/`getRelease`, `util/functions.cpp`) whose
 * lengths span milliseconds to tens of seconds, which no linear axis could
 * show, so the picture gives each stage a fixed width at full menu value —
 * attack 80, decay 90, a 70-wide sustain hold, release 90 — and scales the
 * 0–50 menu value into it. Nothing here writes a file.
 */

/** Width of each stage at menu 50, in the sketch's units. */
export const ENV_SKETCH = { attack: 80, decay: 90, hold: 70, release: 90 } as const

/** The whole envelope at full stretch: what the graph's width is divided by. */
export const ENV_SKETCH_TOTAL = ENV_SKETCH.attack + ENV_SKETCH.decay + ENV_SKETCH.hold + ENV_SKETCH.release

/** The four stages as 0–50 menu values. */
export interface EnvStages {
  A: number
  D: number
  S: number
  R: number
}

/** The stages plus where each corner lands on the x axis: attack peak, decay end, hold end, release end. */
export interface EnvGeometry extends EnvStages {
  x1: number
  x2: number
  x3: number
  x4: number
}

/** Corner positions for `stages`, at `sc` pixels per sketch unit starting `pad` in from the left. */
export function envelopeGeometry(stages: EnvStages, sc: number, pad: number): EnvGeometry {
  const { A, D, S, R } = stages
  const ta = (A / 50) * ENV_SKETCH.attack
  const td = (D / 50) * ENV_SKETCH.decay
  const ts = ENV_SKETCH.hold
  const tr = (R / 50) * ENV_SKETCH.release
  const x1 = pad + ta * sc
  const x2 = x1 + td * sc
  const x3 = x2 + ts * sc
  const x4 = x3 + tr * sc
  return { A, D, S, R, x1, x2, x3, x4 }
}
