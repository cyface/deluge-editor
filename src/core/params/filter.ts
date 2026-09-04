/**
 * The filter graph's response curves.
 *
 * This is a sketch, not the firmware's filter model: cutoff on a log axis
 * from 20 Hz to 20 kHz across the 0–50 menu, resonance as a peak at the
 * cutoff, the ladder modes as Butterworth-shaped roll-offs of the order their
 * name says, and the SVF band and notch as a second-order resonance. Nothing
 * here is used to write a file; the stored values are `scale.ts`'s business
 * and the picture is only ever a picture. The mode strings are the file's
 * (`lpfMode`/`hpfMode`, `src/core/preset/enums.ts`): `Off` is a flat line,
 * anything starting `SVF` is the state-variable pair, and the rest are
 * ladders.
 */

/** The cutoff a 0–50 menu value stands for on the graph's axis: 20 Hz at 0, 20 kHz at 50. */
export const filterCutoffHz = (menu: number): number => 20 * Math.pow(1000, menu / 50)

/** The LPF's peak height for a 0–50 resonance: Q 1 to 12. */
export const lpfQ = (res: number): number => 1 + (res / 50) * 11

/** The HPF's, a little tamer: Q 1 to 9. */
export const hpfQ = (res: number): number => 1 + (res / 50) * 8

/** A second-order state-variable response at ratio `r` of the cutoff: band-pass, or its notch complement. */
function svfMagnitude(r: number, q: number, notch: boolean): number {
  const den = Math.sqrt(Math.pow((r - 1 / r) * q, 2) + 1)
  return notch ? Math.abs((r - 1 / r) * q) / den : 1 / den
}

/** Magnitude of the low-pass at `hz` for a file's mode string and 0–50 cutoff and resonance; 1 when `Off`. */
export function lpfMagnitude(hz: number, mode: string, freq: number, res: number): number {
  if (mode === 'Off') return 1
  const q = lpfQ(res)
  const r = hz / filterCutoffHz(freq)
  if (mode.startsWith('SVF')) return svfMagnitude(r, q, mode === 'SVF_Notch')
  const order = mode === '12dB' ? 2 : 4
  return (1 / Math.sqrt(1 + Math.pow(r, 2 * order))) * (1 + (q - 1) * Math.exp(-Math.pow(Math.log(r) * 3.2, 2)))
}

/** Magnitude of the high-pass at `hz`; the ladder is drawn second-order with a gentler peak. */
export function hpfMagnitude(hz: number, mode: string, freq: number, res: number): number {
  if (mode === 'Off') return 1
  const q = hpfQ(res)
  const r = hz / filterCutoffHz(freq)
  if (mode.startsWith('SVF')) return svfMagnitude(r, q, mode === 'SVF_Notch')
  return (Math.pow(r, 2) / Math.sqrt(1 + Math.pow(r, 4))) * (1 + (q - 1) * 0.4 * Math.exp(-Math.pow(Math.log(r) * 3.2, 2)))
}
