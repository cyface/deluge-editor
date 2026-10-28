/**
 * The ways to start a preset from this computer: New › Synth, New › Kit and
 * Open › From this computer. The bar's menus and the landing page's tiles
 * both call these (issue #38), so the page and the bar are one thing and
 * cannot drift apart. From Deluge is already a store action,
 * `card.openPanel('open')`. A dropped preset file asks through
 * `replacePreset` too, so every question about replacing the preset is
 * worded here.
 */

import { isNotFound } from '../core/library'
import { card } from './state/card.svelte'
import { changesNote, confirm, keptNote, liveNote, loadedName } from './state/confirm.svelte'
import { editor } from './state/editor.svelte'
import { live } from './state/live.svelte'
import { recent, type RecentEntry, type RecentHandle } from './state/recent.svelte'

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
 *
 * Open › From Deluge follows the same rule in the browser's own form: it
 * arms the row instead of asking (`card.loadFile`), and the row says it.
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
    // Read after: the Deluge's own moves may have landed meanwhile.
    if (!always && editor.changeCount === 0) return run()
    const kept = `${keptNote()}.`
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

type OpenPickerWindow = Window & {
  showOpenFilePicker?: (opts: {
    id?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<RecentHandle[]>
}

/**
 * Open › From this computer. Where the browser has the File System Access
 * picker (Chrome, Edge) it is used, because its handle is what lets Open ›
 * Recent read the file again later; elsewhere, the plain file input.
 */
export async function openFile(): Promise<void> {
  const picker = (window as OpenPickerWindow).showOpenFilePicker
  if (!picker) {
    presetInput?.click()
    return
  }
  let handle: RecentHandle | undefined
  try {
    ;[handle] = await picker({ id: 'preset', types: [{ description: 'Deluge preset', accept: { 'text/xml': ['.xml', '.XML'] } }] })
  } catch {
    return // cancelled
  }
  if (!handle) return
  const file = await handle.getFile()
  openPreset(await file.text(), file.name, 'pick', handle)
}

/**
 * A preset file replaces what is loaded, and asks first when that could
 * lose something: a drop whenever a preset is loaded, a pick only over
 * unsaved changes (issues #44, #46). With a handle it joins Open › Recent.
 */
export function openPreset(text: string, name: string, how: 'drop' | 'pick', handle?: RecentHandle): void {
  void replacePreset({ kind: 'open', name, how }, () => {
    editor.load(text, name)
    if (handle && !editor.error) void recent.addComputer(handle)
  })
}

/**
 * Open › Recent: read the file where it lives now, then open it as any
 * other open does. A file that is gone — deleted, renamed, moved — leaves the
 * list, and the error says so; one that can't be read just now (no Deluge,
 * permission refused) stays.
 */
export async function openRecent(entry: RecentEntry): Promise<void> {
  if (entry.kind === 'computer') {
    const h = entry.handle
    let text: string
    try {
      // Permission does not survive a reload; asking needs this click's gesture, so it comes first.
      if ((await h.queryPermission?.({ mode: 'read' })) !== 'granted' && (await h.requestPermission?.({ mode: 'read' })) !== 'granted') {
        editor.error = `The browser was not allowed to read ${entry.name}`
        return
      }
      text = await (await h.getFile()).text()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        editor.error = `${entry.name} is no longer where it was on this computer`
        void recent.remove(entry)
      } else editor.error = `Could not read ${entry.name}: ${e instanceof Error ? e.message : String(e)}`
      return
    }
    openPreset(text, entry.name, 'pick', h)
    return
  }
  const text = await card.fetchPreset(entry.path)
  if (text === null) {
    if (isNotFound(card.lastFailure)) {
      editor.error = `${entry.path} is no longer on the Deluge`
      void recent.remove(entry)
    } else editor.error = card.error ?? `Could not read ${entry.path}`
    return
  }
  void replacePreset({ kind: 'open', name: entry.name, how: 'pick' }, () => {
    editor.load(text, entry.name)
    if (editor.error) return
    editor.cardPath = entry.path
    void recent.addDeluge(entry.path)
  })
}
