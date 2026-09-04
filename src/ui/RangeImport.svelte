<script lang="ts">
  /**
   * What the folder import left beside the ranges (issue #33): where each
   * root came from, the offset it fitted, and the files it could not place —
   * each with a note field so it can still be added by hand. It belongs in
   * the range editor rather than a panel of its own: that is the editor for
   * what the import wrote, and an import is a way of filling it in.
   */
  import { noteName } from '../core/preset/notes'
  import Status from './controls/Status.svelte'
  import { multisample, type ImportSession } from './state/multisample.svelte'

  interface Props { session: ImportSession }
  let { session }: Props = $props()

  /** The note field beside each left-out file, keyed by its path. */
  let assignNote = $state<Record<string, number>>({})
  const noteFor = (fileName: string, named: number | undefined): number =>
    assignNote[fileName] ?? (named === undefined ? 60 : Math.round(named / 100))

  const lead = $derived(session.kind === 'redetect' ? 'Re-detected' : 'From folder')
  const what = $derived(
    session.kind === 'redetect'
      ? `${session.placed} root${session.placed === 1 ? '' : 's'} changed`
      : `${session.placed} sample${session.placed === 1 ? '' : 's'} placed${session.leftOut.length ? `, ${session.leftOut.length} left out` : ''}`,
  )
</script>

<div class="import" data-testid="range-import">
  <div class="line">
    <span class="lead">{lead}</span>
    <span class="mono who">{session.folder ?? 'samples'}</span>
    <span class="why">
      {what}
      · roots {session.offsetFrom === 'anchors' ? 'calibrated against the files that declare one' : 'read from the file names'}
    </span>
    <span class="shift">
      <span class="lead">Shift all</span>
      <button type="button" class="btn small" data-testid="range-shift-down-oct" aria-label="Down an octave" onclick={() => multisample.shift(-12)}>−12</button>
      <button type="button" class="btn small" aria-label="Down a semitone" onclick={() => multisample.shift(-1)}>−1</button>
      <button type="button" class="btn small" aria-label="Up a semitone" onclick={() => multisample.shift(1)}>+1</button>
      <button type="button" class="btn small" aria-label="Up an octave" onclick={() => multisample.shift(12)}>+12</button>
    </span>
    <button type="button" class="btn small" data-testid="range-import-dismiss" onclick={() => multisample.dismissSession()}>Done</button>
  </div>

  {#if session.discardedFileRoots}
    <!-- The firmware's own rule (sample_browser.cpp:1360): every file in
         the folder declaring the same note means a lazy exporter tagged
         them all, so the tags are worth nothing. -->
    <Status kind="caution" testid="range-import-discarded">
      Every WAV in that folder declared the same root note, so the tags were thrown away — as the Deluge throws them away. The file names carried the import instead.
    </Status>
  {/if}

  {#if session.leftOut.length}
    <div class="leftout" data-testid="range-left-out">
      <span class="lead">Left out</span>
      <ul>
        {#each session.leftOut as l (l.file.fileName)}
          <li>
            <span class="fname" title={l.file.fileName}>{l.base}</span>
            <span class="why">{l.reason === 'no root' ? 'no note in its name or its header' : 'no key band left beside its neighbours'}</span>
            <input
              class="note"
              type="number"
              min="0"
              max="127"
              aria-label="Root note for {l.base}"
              value={noteFor(l.file.fileName, l.named)}
              onchange={(e) => (assignNote[l.file.fileName] = Number((e.currentTarget as HTMLInputElement).value))}
            />
            <span class="mono rn">{noteName(noteFor(l.file.fileName, l.named))}</span>
            <button type="button" class="btn small" data-testid="range-assign" onclick={() => multisample.assign(l.file.fileName, noteFor(l.file.fileName, l.named))}>Add</button>
            <button type="button" class="mini" title="Leave this file out" aria-label="Discard {l.base}" onclick={() => multisample.discard(l.file.fileName)}>×</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .import { margin: 10px 0 0 4px; border: 1px solid var(--edge-hi); border-radius: var(--r-s); padding: 8px 9px; background: #100e0c; }
  .line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .who { color: var(--text-hi); }
  .why { font-family: var(--cond); font-size: 11px; color: var(--faint); }
  .shift { display: flex; align-items: center; gap: 5px; margin-left: auto; }
  .lead { font-family: var(--cond); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .mono { font-family: var(--mono); font-size: 10.5px; color: #cfc6b6; white-space: nowrap; }
  .fname { font-family: var(--mono); font-size: 10.5px; }
  .leftout { margin-top: 9px; }
  .leftout ul { list-style: none; margin: 5px 0 0; padding: 0; }
  .leftout li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .leftout .why { flex: 1; min-width: 120px; }
  .note { width: 46px; background: #0c0b0a; border: 1px solid var(--edge-hi); border-radius: var(--r-s); color: var(--text-list); font-family: var(--mono); font-size: 10.5px; height: 21px; padding: 0 4px; }
  .rn { color: var(--faint); min-width: 30px; }
  .mini {
    background: none; border: 1px solid transparent; color: var(--faint); cursor: pointer; font-size: 11px;
    line-height: 1; padding: 2px 0; border-radius: 2px; width: 24px; text-align: center;
  }
  .mini:hover { color: var(--brass-hi); border-color: var(--edge-hi); }
  .import :global(.msg) { margin: 8px 0 0; }
</style>
