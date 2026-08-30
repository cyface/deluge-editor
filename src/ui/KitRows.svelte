<script lang="ts">
  /** A kit's rows in pad order. Selecting a sound row edits it in the panels below. */
  import { LOOP_MODE_NAMES, type DrumRow } from '../core/preset'
  import { osc, paramMenu } from '../core/preset/sound'
  import { child } from '../core/xml'
  import { MIDI_OUTPUT_ATTR_ORDER } from '../core/preset'
  import { setAttr } from '../core/xml'
  import NumberField from './controls/NumberField.svelte'
  import { editor, isSoundRow } from './state/editor.svelte'

  const PADS = ['--osc', '--at', '--flt', '--env1', '--lfo1', '--lfo2', '--fx', '--vel']
  function describe(r: DrumRow): string {
    if (r.tag === 'midiOutput') return `MIDI ch ${Number(r.attrs.channel ?? 0) + 1} · note ${r.attrs.note ?? '?'}`
    if (r.tag === 'gateOutput') return `Gate ${Number(r.attrs.channel ?? 0) + 1}`
    const o = osc(r, 1)
    const t = o?.attrs.type ?? 'square' // Source ctor default survives load (source.cpp:41)
    if (t === 'sample') {
      const file = o?.attrs.fileName ?? child(o!, 'sampleRanges')?.children[0]?.attrs.fileName ?? ''
      return `${file || '(no file)'}${o?.attrs.loopMode ? ` · ${LOOP_MODE_NAMES[o.attrs.loopMode] ?? o.attrs.loopMode}` : ''}`
    }
    return `${r.attrs.mode ?? 'subtractive'} · ${t}`
  }
  const vol = (r: DrumRow) => (isSoundRow(r) ? (paramMenu(r, 'volume') ?? '—') : '')
  const pan = (r: DrumRow) => {
    if (!isSoundRow(r)) return ''
    const p = paramMenu(r, 'pan')
    return p === undefined ? '—' : p === 0 ? 'C' : `${p < 0 ? 'L' : 'R'}${Math.abs(p)}`
  }
  const sel = $derived(editor.selectedRow)
</script>

<section class="panel">
  <div class="ph"><h2>Rows</h2><span class="sub">{editor.rows.length} in pad order · bottom row first in the file</span></div>
  <div class="scroll">
    <table class="rows" data-testid="kit-rows">
      <thead><tr><th></th><th class="num">#</th><th>Row</th><th>Source</th><th class="num">Vol</th><th class="num">Pan</th></tr></thead>
      <tbody>
        {#each editor.rows as r, i (r)}
          <tr class:on={i === editor.row} data-row={i} onclick={() => (editor.row = i)}>
            <td><span class="pad" style="background:var({PADS[i % PADS.length]})"></span></td>
            <td class="num">{i + 1}</td>
            <td><span class="rname">{r.attrs.name ?? '(unnamed)'}</span></td>
            <td><span class="file" title={describe(r)}>{describe(r)}</span></td>
            <td class="num">{vol(r)}</td>
            <td class="num">{pan(r)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
</style>
