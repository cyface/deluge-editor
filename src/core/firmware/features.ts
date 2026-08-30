import { atLeast, parseVersion, type FirmwareVersion, type Lineage } from './version'

/**
 * Minimum firmware per lineage that supports a feature. A lineage that is
 * absent does not support the feature at all.
 *
 * EVERY ENTRY CITES ITS SOURCE. The Deluge accepts XML it doesn't understand
 * without complaint and silently does something else, so a wrong minimum here
 * puts a control in the UI that produces a broken preset. If you can't point at
 * the firmware commit, string table, or release note, don't add the entry.
 */
export interface FeatureSupport {
  official?: string
  community?: string
  /** Where the minimums come from: a firmware path, commit, or release note. */
  source: string
}

/**
 * The feature table. Keys are stable identifiers used by the UI; nothing here
 * yet because nothing is cited yet. Populate from the firmware checkout, not
 * from memory.
 */
export const FEATURES = {} as const satisfies Record<string, FeatureSupport>

export type Feature = keyof typeof FEATURES

/** Does `version` support `feature`? Unknown features are unsupported, never an error. */
export function supports(version: FirmwareVersion, feature: string): boolean {
  const f = (FEATURES as Record<string, FeatureSupport>)[feature]
  if (!f) return false
  const min = f[version.lineage as Lineage]
  return min !== undefined && atLeast(version, parseVersion(min))
}
