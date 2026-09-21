/**
 * The ways to start a preset from this computer: New › Synth, New › Kit and
 * Open › From this computer. The bar's menus and the landing page's tiles
 * both call these (issue #38), so the page and the bar are one thing and
 * cannot drift apart. From Deluge is already a store action,
 * `card.openPanel('open')`.
 */

import { changesNote, confirm, loadedName } from './state/confirm.svelte'
import { editor } from './state/editor.svelte'

/*
 * New must not silently discard unsaved work: with edits pending it asks
 * first, in the same dialog a preset dropped over one uses. Clean, it just
 * goes — a fresh template over an unedited one loses nothing.
 */
export function startNew(what: 'synth' | 'kit'): void {
  const run = () => (what === 'synth' ? editor.newSynth() : editor.newKit())
  if (editor.preset && editor.changeCount > 0) {
    confirm.ask({ question: `Discard changes to ${loadedName()}? A new ${what} replaces it${changesNote()}.`, verb: 'Discard', run })
    return
  }
  run()
}

/*
 * The page's one preset file input lives in `App.svelte`, beside the drop
 * handler — the two ways a preset file arrives — and attaches itself here so
 * anything can open it. Specs reach it by its test id, `file-input`.
 */
let presetInput: HTMLInputElement | null = null

/** `{@attach}` for the preset file input. */
export function attachPresetInput(el: HTMLInputElement): () => void {
  presetInput = el
  return () => {
    if (presetInput === el) presetInput = null
  }
}

/** Open › From this computer: the browser's file picker, for a preset XML. */
export function openFile(): void {
  presetInput?.click()
}
