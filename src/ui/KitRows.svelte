<script lang="ts">
  /**
   * A kit's rows in pad order. Selecting a sound row edits it in the panels
   * below; rows reorder by dragging the grip or nudging with the arrows
   * (bottom pad first in the file, so row 1 is the bottom of the grid).
   */
  import { moveRow, removeRow, renameRow } from '../core/kit/build'
  import { LOOP_MODE_NAMES, OSC_ATTR_ORDER, type DrumRow, type KitElement, type OscElement } from '../core/preset'
  import { osc, paramMenu, setParamMenu } from '../core/preset/sound'
  import { child } from '../core/xml'
  import { MIDI_OUTPUT_ATTR_ORDER } from '../core/preset'
  import { setAttr } from '../core/xml'
  import NumberField from './controls/NumberField.svelte'
  import { audio } from './state/audio.svelte'
  import { card } from './state/card.svelte'
  import { editor, isSoundRow } from './state/editor.svelte'
  import { kit as builder } from './state/kit.svelte'

  // Keep the missing-on-card check current: re-runs when the connection,
  // the kit, or any row's sample reference changes (checkMissing reads them
  // before its first await). A fresh connection drops the listing cache —
  // the card may have changed while we weren't looking.
  let wasConnected = false
  $effect(() => {
    const connected = card.status === 'connected'
    if (connected && !wasConnected) builder.invalidateCardListings()
    wasConnected = connected
    void builder.checkMissing()
  })

  const PADS = ['--osc', '--at', '--flt', '--env1', '--lfo1', '--lfo2', '--fx', '--vel']
  function describe(r: DrumRow): string {
    if (r.tag === 'midiOutput') return `MIDI ch ${Number(r.attrs.channel ?? 0) + 1} · note ${r.attrs.note ?? '?'}`
    if (r.tag === 'gateOutput') return `Gate ${Number(r.attrs.channel ?? 0) + 1}`
    const o = osc(r, 1)
    const t = o?.attrs.type ?? 'square' // Source ctor default survives load (source.cpp:41)
    if (t === 'sample') {
      const file = o?.attrs.fileName ?? child(o!, 'sampleRanges')?.children[0]?.attrs.fileName ?? ''
      return file || '(no file)'
    }
    return `${r.attrs.mode ?? 'subtractive'} · ${t}`
  }

  /** The oscillator whose play mode the Mode column edits: osc1 when it plays a sample. */
  function sampleOsc(r: DrumRow): OscElement | undefined {
    if (!isSoundRow(r)) return undefined
    const o = osc(r, 1)
    return o?.attrs.type === 'sample' ? o : undefined
  }
  /** The sample file a row plays, for the audio preview; undefined for non-sample rows. */
  function sampleFile(r: DrumRow): string | undefined {
    if (!isSoundRow(r)) return undefined
    const o = osc(r, 1)
    if (o?.attrs.type !== 'sample') return undefined
    return o.attrs.fileName || child(o, 'sampleRanges')?.children[0]?.attrs.fileName || undefined
  }

  const vol = (r: DrumRow) => (isSoundRow(r) ? (paramMenu(r, 'volume') ?? '') : '')
  const pan = (r: DrumRow) => {
    if (!isSoundRow(r)) return ''
    const p = paramMenu(r, 'pan')
    return p === undefined ? '' : p === 0 ? 'C' : `${p < 0 ? 'L' : 'R'}${Math.abs(p)}`
  }

  /** Commit a typed volume: 0–50, the Deluge's own scale. Empty leaves the value alone. */
  function commitVol(r: DrumRow, e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const n = Math.round(Number(input.value.trim()))
    if (isSoundRow(r) && input.value.trim() !== '' && Number.isFinite(n)) {
      setParamMenu(r, 'volume', Math.max(0, Math.min(50, n)))
    }
    input.value = String(vol(r)) // re-show the stored value (clamped, or unchanged on bad input)
  }

  /** Commit a typed pan: C, L1–L25, R1–R25, or a signed number (negative = left). */
  function commitPan(r: DrumRow, e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const raw = input.value.trim().toUpperCase().replace(/^(\d+)\s*([LR])$/, '$2$1') // 12L → L12
    if (isSoundRow(r) && raw !== '') {
      const side = /^([LR])\s*(\d*)$/.exec(raw) // a bare L or R is hard left/right
      const n = raw === 'C' ? 0 : side ? (side[1] === 'L' ? -1 : 1) * (side[2] ? Number(side[2]) : 25) : Math.round(Number(raw))
      if (Number.isFinite(n)) setParamMenu(r, 'pan', Math.max(-25, Math.min(25, n)))
    }
    input.value = pan(r)
  }
  const sel = $derived(editor.selectedRow)
  const kit = $derived(editor.preset as KitElement)

  let dragFrom = $state<number | null>(null)
  let dragOver = $state<number | null>(null)

  /** Reorder, keeping the selection on the row it was on. */
  function move(from: number, to: number) {
    if (to < 0 || to >= editor.rows.length) return
    const selected = editor.selectedRow
    moveRow(kit, from, to)
    if (selected) editor.row = editor.rows.indexOf(selected)
  }

  function drop(i: number) {
    if (dragFrom !== null && dragFrom !== i) move(dragFrom, i)
    dragFrom = null
    dragOver = null
  }

  function remove(i: number) {
    removeRow(kit, editor.rows[i])
    if (editor.row >= editor.rows.length) editor.row = Math.max(0, editor.rows.length - 1)
    else if (editor.row > i) editor.row -= 1
  }

  function rename(r: DrumRow, e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value.trim()
    if (value) renameRow(r, value)
  }
</script>

<section class="panel">
  <div class="ph"><h2>Rows</h2><span class="sub">{#if builder.missing.size}<span class="misscount" data-testid="missing-count">⚠ {builder.missing.size} sample{builder.missing.size === 1 ? '' : 's'} not on the card</span> · {/if}{editor.rows.length} in pad order · bottom row first in the file · drag or ▲▼ to reorder</span></div>
  <div class="scroll">
    <table class="rows" data-testid="kit-rows">
      <thead><tr><th></th><th></th><th></th><th class="num">#</th><th>Row</th><th>Source</th><th>Repeat</th><th>Direction</th><th class="num">Vol</th><th class="num">Pan</th><th></th></tr></thead>
      <tbody>
        {#each editor.rows as r, i (r)}
          <tr
            class:on={i === editor.row}
            class:over={i === dragOver && dragFrom !== null && dragFrom !== i}
            data-row={i}
            onclick={() => (editor.row = i)}
            ondragover={(e) => { e.preventDefault(); dragOver = i }}
            ondrop={(e) => { e.preventDefault(); drop(i) }}
          >
            <td
              class="grip"
              draggable="true"
              title="Drag to reorder"
              ondragstart={(e) => { dragFrom = i; e.dataTransfer?.setData('text/plain', String(i)) }}
              ondragend={() => { dragFrom = null; dragOver = null }}
            >⋮⋮</td>
            <td class="playcell">
              {#if sampleFile(r)}
                {@const f = sampleFile(r)!}
                <button
                  type="button"
                  class="play"
                  class:live={audio.playing === f}
                  data-testid="row-play"
                  disabled={audio.loading !== null || (!audio.canPreview(f) && audio.playing !== f)}
                  title={audio.playing === f
                    ? 'Stop'
                    : audio.canPreview(f)
                      ? 'Preview this sample'
                      : 'Sample is not on this computer — connect the Deluge to preview it'}
                  aria-label="Preview row {i + 1}"
                  onclick={(e) => { e.stopPropagation(); audio.toggle(f, sampleOsc(r)?.attrs.reversed === '1') }}
                >{audio.playing === f ? '■' : audio.loading === f ? `${Math.round(audio.progress * 100)}%` : '▶'}</button>
              {/if}
            </td>
            <td><span class="pad" style="background:var({PADS[i % PADS.length]})"></span></td>
            <td class="num">{i + 1}</td>
            <td>
              {#if i === editor.row}
                <input
                  class="rename"
                  data-testid="row-name"
                  value={r.attrs.name ?? ''}
                  placeholder="(unnamed)"
                  spellcheck="false"
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => rename(r, e)}
                />
              {:else}
                <span class="rname">{r.attrs.name ?? '(unnamed)'}</span>
              {/if}
            </td>
            <td class="src">
              {#if sampleFile(r) && builder.missing.has(sampleFile(r)!)}
                {@const held = builder.bytes.has(sampleFile(r)!)}
                <span
                  class="warn"
                  class:pending={held}
                  data-testid="row-missing"
                  title={held
                    ? 'Not on the card yet — saving the kit will copy it there'
                    : 'Not on the card — the Deluge loads the kit anyway, but this row will be silent'}
                >⚠</span>
              {/if}
              <span class="file" title={describe(r)}>{describe(r)}</span>
            </td>
            <td>
              {#if sampleOsc(r)}
                {@const o = sampleOsc(r)!}
                <select
                  class="mode"
                  data-testid="row-mode"
                  title="The device's REPEAT setting: Cut stops on note-off, Once always plays out, Loop repeats, Stretch fits the sample to the note length"
                  value={o.attrs.loopMode ?? '0'}
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => setAttr(o, 'loopMode', (e.currentTarget as HTMLSelectElement).value, OSC_ATTR_ORDER)}
                >
                  {#each Object.entries(LOOP_MODE_NAMES) as [value, label] (value)}
                    <option {value}>{label}</option>
                  {/each}
                </select>
              {/if}
            </td>
            <td>
              {#if sampleOsc(r)}
                {@const o = sampleOsc(r)!}
                <select
                  class="mode"
                  data-testid="row-direction"
                  title="Play direction"
                  value={o.attrs.reversed ?? '0'}
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => setAttr(o, 'reversed', (e.currentTarget as HTMLSelectElement).value, OSC_ATTR_ORDER)}
                >
                  <option value="0">Fwd</option>
                  <option value="1">Rev</option>
                </select>
              {/if}
            </td>
            <td class="num">
              {#if isSoundRow(r)}
                <input
                  class="cell"
                  data-testid="row-vol"
                  value={vol(r)}
                  placeholder="—"
                  title="Volume, 0–50 (the Deluge's own scale); blank means the firmware's default"
                  spellcheck="false"
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => commitVol(r, e)}
                />
              {/if}
            </td>
            <td class="num">
              {#if isSoundRow(r)}
                <input
                  class="cell"
                  data-testid="row-pan"
                  value={pan(r)}
                  placeholder="—"
                  title="Pan: C for centre, L1–L25, R1–R25; a bare L or R pans hard; a signed number works too (negative = left)"
                  spellcheck="false"
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => commitPan(r, e)}
                />
              {/if}
            </td>
            <td class="acts">
              <button type="button" class="act" title="Move up (towards the bottom pad)" aria-label="Move row {i + 1} up" disabled={i === 0} onclick={(e) => { e.stopPropagation(); move(i, i - 1) }}>▲</button>
              <button type="button" class="act" title="Move down" aria-label="Move row {i + 1} down" disabled={i === editor.rows.length - 1} onclick={(e) => { e.stopPropagation(); move(i, i + 1) }}>▼</button>
              <button type="button" class="act x" title="Remove this row" aria-label="Remove row {i + 1}" onclick={(e) => { e.stopPropagation(); remove(i) }}>×</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if audio.error}<p class="err" role="alert">{audio.error}</p>{/if}
  {#if sel && !isSoundRow(sel)}
    <div class="fields">
      <NumberField label="Channel" name="row.channel" value={sel.attrs.channel} min={0} max={15} format={(n) => `ch ${n + 1}`} onchange={(v) => setAttr(sel, 'channel', String(v), MIDI_OUTPUT_ATTR_ORDER)} />
      {#if sel.tag === 'midiOutput'}
        <NumberField label="Note" name="row.note" value={sel.attrs.note} min={0} max={127} onchange={(v) => setAttr(sel, 'note', String(v), MIDI_OUTPUT_ATTR_ORDER)} />
      {/if}
    </div>
    <p class="hint">A MIDI or gate row has no sound of its own; the panels below stay hidden.</p>
  {/if}
</section>

<style>
  .panel { margin: 10px 0 0; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge); border-radius: 4px; padding: 9px 11px 12px; }
  .ph { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 4px 4px; }
  .ph h2 { margin: 0; font-family: var(--cond); font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #e2d9ca; }
  .scroll { overflow-x: auto; max-height: 300px; overflow-y: auto; }
  .grip { cursor: grab; color: var(--faint); font-size: 10px; letter-spacing: -1px; user-select: none; width: 16px; }
  .grip:active { cursor: grabbing; }
  tr.over td { border-top: 2px solid var(--brass); }
  /* Same face as .rname (theme.css): editing must not shrink the name. */
  .rename {
    width: 100%; min-width: 70px; box-sizing: border-box; background: #0d0b0a; border: 1px solid var(--edge-hi);
    border-radius: 3px; padding: 1px 5px; font-family: var(--cond); font-size: 13px; font-weight: 600;
    letter-spacing: .05em; text-transform: uppercase; color: #e0d7c7;
  }
  .rename:focus { outline: 1px solid var(--brass); }
  .acts { white-space: nowrap; }
  .act {
    background: none; border: 0; color: var(--faint); cursor: pointer; font-size: 9px; padding: 2px 3px; line-height: 1;
  }
  .act:hover:not(:disabled) { color: var(--brass-hi); }
  .act:disabled { opacity: .25; cursor: default; }
  .act.x { font-size: 13px; vertical-align: -1px; }
  .act.x:hover { color: #e8a08f; }
  .playcell { width: 30px; text-align: center; }
  .mode {
    background: #0d0b0a; border: 1px solid var(--edge); border-radius: 3px; color: #cfc6b6;
    font-family: var(--mono); font-size: 10.5px; padding: 2px 3px; cursor: pointer;
  }
  .mode:hover, .mode:focus { border-color: var(--brass-dim); color: #efe6d7; outline: none; }
  .cell {
    width: 34px; box-sizing: border-box; background: #0d0b0a; border: 1px solid var(--edge); border-radius: 3px;
    color: #cfc6b6; font-family: var(--mono); font-size: 10.5px; padding: 2px 4px; text-align: right;
  }
  .cell:hover, .cell:focus { border-color: var(--brass-dim); color: #efe6d7; outline: none; }
  .cell::placeholder { color: var(--faint); }
  /* Source takes all spare width; the path only ellipsizes when the screen
     truly runs out (the .scroll wrapper still allows a horizontal scroll). */
  .src { width: 100%; }
  .src .file { display: inline; max-width: none; }
  .warn { color: #e8a08f; margin-right: 4px; cursor: help; }
  .warn.pending { color: #e8b06a; }
  .misscount { color: #e8a08f; }
  .play {
    background: none; border: 1px solid var(--edge-hi); border-radius: 3px; color: var(--muted); cursor: pointer;
    font-size: 9px; line-height: 1; padding: 3px 5px; min-width: 22px; font-variant-numeric: tabular-nums;
  }
  .play:hover:not(:disabled) { color: var(--brass-hi); border-color: var(--brass-dim); }
  .play.live { color: var(--brass-hi); border-color: var(--brass-dim); }
  .play:disabled { opacity: .35; cursor: default; }
  .err { margin: 8px 0 0 4px; font-family: var(--mono); font-size: 10.5px; color: #e8a08f; padding: 5px 7px; border: 1px solid #5a2a22; background: #1d1210; border-radius: 3px; }
</style>
