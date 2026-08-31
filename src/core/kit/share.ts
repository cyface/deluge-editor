/**
 * The "Download Zip" share package: the preset XML under `KITS/` or
 * `SYNTHS/`, the samples it references under `SAMPLES/` at the exact paths
 * the XML names, and a README telling the recipient to merge the folders
 * onto their card. Optional metadata (author, licensing, source) goes in the
 * README — the XML itself is never annotated, so the packaged preset stays
 * byte-identical to the saved one.
 */

import { buildZip, type ZipEntry } from './zip'

export interface ShareMeta {
  /** The preset file's name, e.g. `My Kit.XML`. */
  presetFileName: string
  /** Decides the folder (`KITS/` or `SYNTHS/`) and the README wording. */
  kind: 'kit' | 'synth'
  author?: string
  license?: string
  source?: string
}

export interface ShareSample {
  /** The path the preset references: `SAMPLES/<folder>/<file>`, no leading slash. */
  fileName: string
  /** Absent when the sample lives only on the card (browsed on-device). */
  data?: Uint8Array
}

const presetName = (fileName: string): string => fileName.replace(/\.xml$/i, '')
const presetFolder = (kind: ShareMeta['kind']): string => (kind === 'kit' ? 'KITS' : 'SYNTHS')

export function shareReadme(meta: ShareMeta, samples: readonly ShareSample[]): string {
  const included = samples.filter((s) => s.data)
  const missing = samples.filter((s) => !s.data)
  const folder = presetFolder(meta.kind)
  const lines: string[] = [
    `# ${presetName(meta.presetFileName)}`,
    '',
    `A ${meta.kind} preset for the Synthstrom Deluge.`,
    '',
    '## Install',
    '',
    `Copy the \`${folder}\` and \`SAMPLES\` folders onto the root of your`,
    'Deluge SD card, merging them with the folders already there. Then load',
    `**${presetName(meta.presetFileName)}** on the Deluge as a ${meta.kind} preset.`,
    '',
    '## Contents',
    '',
    `- \`${folder}/${meta.presetFileName}\``,
    ...included.map((s) => `- \`${s.fileName}\``),
  ]
  if (missing.length) {
    lines.push(
      '',
      `These samples are referenced by the ${meta.kind} but not included in this`,
      'zip (they were read from a Deluge card, not from this computer) — the',
      `${meta.kind} loads without them, but stays silent until the files exist at`,
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

export function shareZip(
  xml: string,
  meta: ShareMeta,
  samples: readonly ShareSample[],
  now?: Date,
): Uint8Array {
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = [
    { path: 'README.md', data: encoder.encode(shareReadme(meta, samples)) },
    { path: `${presetFolder(meta.kind)}/${meta.presetFileName}`, data: encoder.encode(xml) },
  ]
  for (const s of samples) {
    if (s.data) entries.push({ path: s.fileName, data: s.data })
  }
  return buildZip(entries, now)
}
