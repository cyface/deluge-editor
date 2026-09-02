/**
 * The patch generator's panel state, and the roll itself.
 *
 * The roll is `src/core/random/patch.ts`; this store only holds what the
 * panel asks for and points it at the sound the editor is showing — the
 * preset, or the selected row in a kit. It gates with `editor.supports`, the
 * same firmware pill the controls obey, so a roll can never write a value the
 * visible editor would refuse to show.
 *
 * Nothing here is a commit. A roll is state edits like any other, so the
 * changes dock lists every one against the loaded file and each can be put
 * back individually; a roll of the same sections is absolute rather than
 * cumulative, so re-rolling wanders around the file rather than away from it.
 */

import {
  DEFAULT_SECTIONS,
  RANDOM_SECTIONS,
  formatSeed,
  makeRng,
  parseSeed,
  randomPatchName,
  randomSeed,
  randomizePatch,
  patchFileName,
  type Intensity,
  type RandomSection,
} from '../../core/random'
import { isKit } from '../../core/preset'
import { editor } from './editor.svelte'

/** What each scope checkbox says it will move, in the panel's order. */
export const SECTION_LABELS: Record<RandomSection, string> = {
  osc: 'Oscillators',
  voice: 'Voice',
  filters: 'Filters',
  modfx: 'Mod FX',
  dist: 'Distortion',
  delay: 'Delay & Reverb',
  out: 'Output',
  mods: 'Envelopes & LFOs',
  cables: 'Mod Matrix',
  arp: 'Arpeggiator',
}

export const INTENSITY_LABELS: Record<Intensity, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  hard: 'Hard',
  wild: 'Wild',
}

class Randomizer {
  open = $state(false)
  intensity = $state<Intensity>('moderate')
  sections = $state<RandomSection[]>([...DEFAULT_SECTIONS])
  /** Name the preset from what each roll produced (synths; a kit row has its own name). */
  nameIt = $state(true)
  /** The seed of the last roll, so it can be repeated or written down. */
  lastSeed = $state<number | null>(null)
  /** A seed typed in to reproduce someone else's roll; blank means a fresh one. */
  seedInput = $state('')

  readonly seedText = $derived(this.lastSeed === null ? '' : formatSeed(this.lastSeed))
  /** A roll needs a sound to roll and at least one section to roll it in. */
  readonly ready = $derived(editor.sound !== null && this.sections.length > 0)
  /** In a kit the roll lands on the selected row, which is worth saying out loud. */
  readonly target = $derived(
    editor.preset && isKit(editor.preset) ? editor.sound?.attrs.name || `row ${editor.row + 1}` : null,
  )

  toggleSection(id: RandomSection): void {
    this.sections = this.sections.includes(id)
      ? this.sections.filter((s) => s !== id)
      : RANDOM_SECTIONS.filter((s) => s === id || this.sections.includes(s))
  }

  all(): void {
    this.sections = [...RANDOM_SECTIONS]
  }
  none(): void {
    this.sections = []
  }
  reset(): void {
    this.sections = [...DEFAULT_SECTIONS]
  }

  /**
   * One roll. `again` repeats the last seed — the same patch from the same
   * starting point, which is how you go back one after a re-roll you liked
   * less. A typed seed wins over both.
   */
  roll(again = false): void {
    const sound = editor.sound
    if (!sound || this.sections.length === 0) return
    const typed = parseSeed(this.seedInput)
    const seed = typed ?? (again && this.lastSeed !== null ? this.lastSeed : randomSeed())

    const result = randomizePatch(sound, {
      supports: editor.supports,
      intensity: this.intensity,
      sections: this.sections,
      seed,
      // A kit row is a drum: the firmware refuses `note` as a patch source there.
      drum: editor.preset !== null && isKit(editor.preset),
    })
    this.lastSeed = result.seed

    // Every roll is a new patch and, with Name it on, gets a new name — the
    // toggle is the consent, so a file the user named is renamed too while it
    // is on; off, no roll touches the name. The name is drawn after the
    // roll, from the patch the roll produced, so the same seed names alike.
    if (this.nameIt && editor.preset !== null && !isKit(editor.preset)) {
      editor.fileName = patchFileName(randomPatchName(sound, makeRng(result.seed)))
    }
  }
}

export const randomizer = new Randomizer()
