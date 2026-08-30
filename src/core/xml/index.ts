export { diffFlat, flattenXML, isClean } from './flatten'
export type { FlatDiff, FlatXML } from './flatten'

/** Placeholder until the preset model exists. The round-trip test targets these. */
export function parseXML(_xml: string): unknown {
  throw new Error('parseXML: not implemented')
}
export function generateXML(_preset: unknown): string {
  throw new Error('generateXML: not implemented')
}
