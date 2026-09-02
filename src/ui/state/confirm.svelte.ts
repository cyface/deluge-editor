/**
 * One question at a time, held for the user's yes (`App.svelte` draws it as
 * a modal). Anything that would throw away a loaded preset asks here — a
 * preset dropped over one, samples dropped on a kit, New over unsaved work —
 * so the dialog is the same wherever the question came from.
 */

import { editor } from './editor.svelte'

export interface Question {
  question: string
  /** The button that says yes: Replace, Add, Discard. */
  verb: string
  run: () => Promise<void> | void
}

class Confirm {
  pending = $state<Question | null>(null)

  ask(q: Question): void {
    this.pending = q
  }

  /** The yes: the question is gone before the work runs, in case it asks another. */
  go(): void {
    const q = this.pending
    if (!q) return
    this.pending = null
    void q.run()
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
