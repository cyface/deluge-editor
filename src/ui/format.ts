/** Numbers the panels print, one spelling each. */

/** A byte count as the listings show it: `12 B`, `340.5 KB`, `1.2 MB`. */
export function formatBytes(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

/** A sample's length from its frame count: `0.35 s`, `12.5 s`, `1:05`. */
export function formatDuration(frames: number, rate: number): string {
  const s = rate ? frames / rate : 0
  if (s >= 60) return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  return `${s.toFixed(s < 10 ? 2 : 1)} s`
}
