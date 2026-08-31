/**
 * The "Download Zip" share package: the kit XML under `KITS/`, its samples
 * under `SAMPLES/` at the exact paths the kit references, and a README
 * telling the recipient to merge both folders onto their card. Optional
 * metadata (author, licensing, source) goes in the README — the XML itself
 * is never annotated, so the packaged kit stays byte-identical to the saved
 * one.
 */

import { buildZip, type ZipEntry } from './zip'

export interface KitShareMeta {
  /** The kit file's name, e.g. `My Kit.XML`. */
  kitFileName: string
  author?: string
  license?: string
  source?: string
}

export interface KitShareSample {
  /** The path the kit XML references: `SAMPLES/<folder>/<file>`, no leading slash. */
  fileName: string
  /** Absent when the sample lives only on the card (browsed on-device). */
  data?: Uint8Array
}

const kitName = (fileName: string): string => fileName.replace(/\.xml$/i, '')

export function kitReadme(meta: KitShareMeta, samples: readonly KitShareSample[]): string {
  const included = samples.filter((s) => s.data)
  const missing = samples.filter((s) => !s.data)
  const lines: string[] = [
    `# ${kitName(meta.kitFileName)}`,
    '',
    'A kit for the Synthstrom Deluge.',
    '',
    '## Install',
    '',
    'Copy the `KITS` and `SAMPLES` folders onto the root of your Deluge SD',
    'card, merging them with the folders already there. Then load',
    `**${kitName(meta.kitFileName)}** on the Deluge as a kit preset.`,
    '',
    '## Contents',
    '',
    `- \`KITS/${meta.kitFileName}\``,
    ...included.map((s) => `- \`${s.fileName}\``),
  ]
  if (missing.length) {
    lines.push(
      '',
      'These samples are referenced by the kit but not included in this zip',
      '(they were read from a Deluge card, not from this computer) — the kit',
      'loads without them, but those rows stay silent until the files exist at',
      'these paths:',
      '',
      ...missing.map((s) => `- \`${s.fileName}\``),
    )
  }
  const credits: string[] = []
  if (meta.author) credits.push(`- Author: ${meta.author}`)
  if (meta.license) credits.push(`- Sample licensing: ${meta.license}`)
  if (meta.source) credits.push(`- Sample source: ${meta.source}`)
  if (credits.length) lines.push('', '## Credits', '', ...credits)
  lines.push(
    '',
    '---',
    'Packaged with [Deluge Editor](https://github.com/cyface/deluge-editor),',
    'a free, community-made editor — not produced by, associated with, or',
    'endorsed by Synthstrom Audible.',
    '',
  )
  return lines.join('\n')
}

export function kitShareZip(
  xml: string,
  meta: KitShareMeta,
  samples: readonly KitShareSample[],
  now?: Date,
): Uint8Array {
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = [
    { path: 'README.md', data: encoder.encode(kitReadme(meta, samples)) },
    { path: `KITS/${meta.kitFileName}`, data: encoder.encode(xml) },
  ]
  for (const s of samples) {
    if (s.data) entries.push({ path: s.fileName, data: s.data })
  }
  return buildZip(entries, now)
}
