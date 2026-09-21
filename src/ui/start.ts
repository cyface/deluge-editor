/**
 * The ways to start a preset from this computer: New › Synth, New › Kit and
 * Open › From this computer. The bar's menus and the landing page's tiles
 * both call these (issue #38), so the page and the bar are one thing and
 * cannot drift apart. From Deluge is already a store action,
 * `card.openPanel('open')`. A dropped preset file asks through
 * `replacePreset` too, so every question about replacing the preset is
 * worded here.
 */

import { changesNote, confirm, liveNote, loadedName } from './state/confirm.svelte'
import { editor } from './state/editor.svelte'
import { live } from './state/live.svelte'

/** What is about to replace the loaded preset: a template, or a file picked or dropped. */
export type Replacement = { kind: 'new'; what: 'synth' | 'kit' } | { kind: 'open'; name: string; how: 'drop' | 'pick' }

/*
 * Replacing the preset must not silently throw work away (issue #44). A
 * command asks only when there are unsaved changes: a fresh file over an
 * unedited one loses nothing. A drop asks whenever a preset is loaded, since
 * a stray drag is easy to make.
 *
 * While Live Edit holds the Deluge's sound, the unsaved changes are the
 * Deluge's: a new preset ends the mode (`live.replaced`) and the Deluge
 * keeps them. So what is still on its way goes first (`live.deliver`), and
 * the question says the mode ends and where the work stays, instead of
 * calling it discarded (issue #46). Only an edit the Deluge would not take
 * is really lost, and that is the one question that says Discard; it is
 * asked even with nothing unsaved against the card.
 */
export async function replacePreset(r: Replacement, run: () => void): Promise<void> {
  if (!editor.preset) return run()
  const always = r.kind === 'open' && r.how === 'drop'
  if (live.active) {
    const into = r.kind === 'new' ? `Starting a new ${r.what}` : `Opening ${r.name}`
    if (!(await live.deliver())) {
      confirm.ask({ question: `Discard the edit the Deluge hasn’t taken? ${into} leaves Live Edit.`, verb: 'Discard', run })
      return
    }
    const unsaved = editor.changeCount // read after: the Deluge's own moves may have landed meanwhile
    if (!always && unsaved === 0) return run()
    const kept = `The Deluge keeps ${live.inst?.name ?? loadedName()}${unsaved > 0 ? ` and its ${unsaved} unsaved change${unsaved === 1 ? '' : 's'}` : ''}.`
    confirm.ask(
      r.kind === 'new'
        ? { question: `Leave Live Edit for a new ${r.what}? ${kept}`, verb: `New ${r.what}`, run }
        : { question: `Open ${r.name} and leave Live Edit? ${kept}`, verb: 'Open', run },
    )
    return
  }
  if (!always && editor.changeCount === 0) return run()
  // Live Edit may still be on, waiting for a synth or kit or with its link
  // down; the editor's changes are then not known to be on the Deluge.
  confirm.ask(
    r.kind === 'new'
      ? { question: `Discard changes to ${loadedName()}? A new ${r.what} replaces it${liveNote()}${changesNote()}.`, verb: 'Discard', run }
      : { question: `Open ${r.name}? It replaces ${loadedName()}${liveNote()}${changesNote()}.`, verb: 'Open', run },
  )
}

/** New › Synth or Kit: the Deluge-authored template, asked about as `replacePreset` says. */
export function startNew(what: 'synth' | 'kit'): void {
  void replacePreset({ kind: 'new', what }, () => (what === 'synth' ? editor.newSynth() : editor.newKit()))
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
