/**
 * One question at a time, held for the user's yes (`App.svelte` draws it as
 * a modal). Anything that would throw away a loaded preset asks here — a
 * preset dropped over one, samples dropped on a kit, and New, Open › From
 * this computer or entering Live Edit over unsaved work — so the dialog is
 * the same wherever the question came from. The card browser's Open is the
 * one exception: it is already a dialog, so it arms the file instead.
 */

import { errorText } from '../errtext'
import { editor } from './editor.svelte'
import { live } from './live.svelte'

export interface Question {
  question: string
  /** The button that says yes: Replace, Add, Discard. */
  verb: string
  /** The work; a store's `run()` result (whether it ran) is not the dialog's business. */
  run: () => Promise<unknown> | void
}

class Confirm {
  pending = $state.raw<Question | null>(null)
  /** Why the last yes could not be carried out — a `run` that threw rather than reporting through its own store. */
  error = $state<string | null>(null)

  readonly open = $derived(this.pending !== null)

  ask(q: Question): void {
    this.pending = q
    this.error = null
  }

  /** The yes: the question is gone before the work runs, in case it asks another. */
  async go(): Promise<void> {
    const q = this.pending
    if (!q) return
    this.pending = null
    try {
      await q.run()
    } catch (e) {
      this.error = errorText(e)
    }
  }

  cancel(): void {
    this.pending = null
  }
}

export const confirm = new Confirm()

/** What a yes would throw away, for a question to name. */
export const loadedName = (): string => editor.fileName || 'your unsaved preset'
export const changesNote = (): string =>
  editor.changeCount > 0 ? ` — ${editor.changeCount} unsaved change${editor.changeCount === 1 ? '' : 's'}` : ''
/** A new preset ends Live Edit (`live.replaced`), so a question about one says that too. */
export const liveNote = (): string => (live.endsOnNewDocument ? ' and leaves Live Edit' : '')
/**
 * While Live Edit holds the Deluge's sound, the unsaved changes are the
 * Deluge's, and it keeps them when a new preset ends the mode. The sound is
 * named as the Live header names it, since the file on the card is
 * untouched either way.
 */
export const keptNote = (): string => {
  const n = editor.changeCount
  return `The Deluge keeps ${live.inst?.name ?? loadedName()}${n > 0 ? ` and its ${n} unsaved change${n === 1 ? '' : 's'}` : ''}`
}
