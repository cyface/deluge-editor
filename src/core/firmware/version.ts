/**
 * Deluge firmware versions as they appear in preset XML:
 *   firmwareVersion="4.1.4"          official (Synthstrom)
 *   firmwareVersion="c1.3.0"         community (SynthstromAudible/DelugeFirmware)
 *   earliestCompatibleFirmware="4.1.0-alpha"
 *
 * The two lineages are not ordered against each other — community forked from
 * official and grew its own feature set — so comparison is only defined within
 * a lineage. Callers gate features per lineage; see features.ts.
 */

export type Lineage = 'official' | 'community'

export interface FirmwareVersion {
  lineage: Lineage
  major: number
  minor: number
  patch: number
  /** Pre-release tag such as `alpha`, `beta`, `nightly`; absent for releases. */
  tag?: string
}

const VERSION_RE = /^(c)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/

/** Parse a version string from XML. Throws on anything unrecognised. */
export function parseVersion(s: string): FirmwareVersion {
  const m = VERSION_RE.exec(s)
  if (!m) throw new RangeError(`not a Deluge firmware version: ${JSON.stringify(s)}`)
  const v: FirmwareVersion = {
    lineage: m[1] ? 'community' : 'official',
    major: Number(m[2]),
    minor: Number(m[3]),
    patch: Number(m[4]),
  }
  if (m[5]) v.tag = m[5]
  return v
}

/** Format back to the string the Deluge writes. `formatVersion(parseVersion(s)) === s`. */
export function formatVersion(v: FirmwareVersion): string {
  const core = `${v.lineage === 'community' ? 'c' : ''}${v.major}.${v.minor}.${v.patch}`
  return v.tag ? `${core}-${v.tag}` : core
}

/**
 * Compare two versions of the same lineage. Negative if a < b, 0 if equal,
 * positive if a > b. A tagged pre-release sorts *before* the untagged release
 * of the same number (`4.1.0-alpha` < `4.1.0`). Throws across lineages.
 */
export function compareVersions(a: FirmwareVersion, b: FirmwareVersion): number {
  if (a.lineage !== b.lineage) {
    throw new RangeError(`cannot compare ${formatVersion(a)} with ${formatVersion(b)}: different lineages`)
  }
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    Number(a.tag === undefined) - Number(b.tag === undefined) ||
    (a.tag ?? '').localeCompare(b.tag ?? '')
  )
}

export const atLeast = (v: FirmwareVersion, min: FirmwareVersion): boolean =>
  compareVersions(v, min) >= 0
