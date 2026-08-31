<script lang="ts">
  import { referencedSampleFiles } from '../core/preset'
  import { card } from './state/card.svelte'
  import { editor } from './state/editor.svelte'
  import { kit } from './state/kit.svelte'
  import Mark from './Mark.svelte'

  let fileInput: HTMLInputElement | undefined = $state()
  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    if (!f) return
    editor.load(await f.text(), f.name)
    input.value = ''
  }
  function download() {
    const blob = new Blob([editor.output], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = editor.fileName || `${editor.preset?.tag === 'kit' ? 'KIT' : 'SYNTH'}.XML`
    a.click()
    URL.revokeObjectURL(url)
  }
  const kind = $derived(editor.preset?.tag === 'kit' ? 'Kit' : editor.preset ? 'Synth' : 'Editor')
  /** A kit, or any preset referencing external files, can share as a zip. */
  const showZip = $derived(
    editor.preset !== null && (editor.preset.tag === 'kit' || referencedSampleFiles(editor.preset).length > 0),
  )
  /** While a Deluge is connected the selector is locked to it: the device is the ground truth. */
  const fwLocked = $derived(card.status === 'connected' && editor.deviceFirmware !== null)
  const fwTitle = $derived(
    fwLocked
      ? 'Firmware of the connected Deluge. A control this firmware can’t honour is omitted.'
      : 'Firmware the controls are shown for. A control this firmware can’t honour is omitted.',
  )
</script>

<div class="bar">
  <div class="logo"><Mark size={34} /><b>Deluge <span>{kind}</span></b></div>
  <div class="namewrap">
    {#if editor.preset}
      <span class="name" data-testid="file-name">{editor.fileName || 'UNNAMED'}</span>
      {#if editor.preset.attrs.firmwareVersion}<span class="path">saved by firmware {editor.preset.attrs.firmwareVersion}</span>{/if}
    {:else}
      <span class="path">no preset loaded</span>
    {/if}
  </div>
  <label class="pill" title={fwTitle}>
    {#if fwLocked}
      <span class="fw" data-testid="firmware-locked">{editor.firmware}</span>
    {:else}
      <select data-testid="firmware" bind:value={editor.firmware}>
        {#each editor.firmwareChoices as v (v)}<option value={v}>{v}</option>{/each}
      </select>
    {/if}
  </label>
  <input bind:this={fileInput} type="file" accept=".xml,.XML,text/xml,application/xml" hidden data-testid="file-input" onchange={pick} />
  <button
    type="button"
    class="btn"
    class:on={card.open}
    data-testid="card-button"
    title={card.busy
      ? `Card transfer in progress: ${card.busy}…`
      : card.supported
        ? 'Connect to the Deluge and browse its SD card over MIDI'
        : 'Web MIDI needs Chrome or Edge'}
    onclick={() => card.toggle()}
  >
    {#if card.status === 'connected'}<span class="dot" class:pulse={!!card.busy}></span>Browse Card{:else}Connect{/if}
  </button>
  <button type="button" class="btn" title="Start a new synth from the Deluge's own init preset" data-testid="new-synth" onclick={() => editor.newSynth()}>New Synth</button>
  <button type="button" class="btn" title="Start a kit from the Deluge's own blank kit — then drop a folder of WAVs on the page" data-testid="new-kit" onclick={() => editor.newKit()}>New Kit</button>
  <button type="button" class="btn" title="Open a preset XML from this computer" onclick={() => fileInput?.click()}>Open File</button>
  <button type="button" class="btn" disabled={!editor.preset} title="Just the preset file being edited" onclick={download}>Download XML</button>
  {#if showZip}
    <button type="button" class="btn" data-testid="download-zip-top" title="Preset + samples + README, ready to share{editor.preset?.tag === 'kit' ? ' — credits are set in the Share section below' : ''}" onclick={() => kit.downloadZip()}>Download Zip</button>
  {/if}
  <button type="button" class="btn" class:on={editor.showChanges} disabled={!editor.preset} data-testid="changes-button" onclick={() => (editor.showChanges = !editor.showChanges)}>
    Changes {#if editor.preset}<span class="badge" data-testid="change-count">{editor.changeCount}</span>{/if}
  </button>
</div>

<style>
  .bar {
    display: flex; align-items: center; gap: 13px; height: 48px; position: sticky; top: 0; z-index: 40;
    background: linear-gradient(180deg, #1c1916, #100e0d); border-bottom: 1px solid var(--edge);
    margin: 0 calc((var(--cheek) + var(--gut)) * -1); padding: 0 calc(var(--cheek) + var(--gut) + 13px);
  }
  .logo { flex: none; display: flex; align-items: center; gap: 9px; color: var(--brass); }
  .logo b { font-family: var(--cond); font-weight: 700; letter-spacing: .15em; text-transform: uppercase; font-size: 14px; color: #e9e2d6; }
  .logo b span { color: var(--brass); }
  .namewrap { flex: 1; display: flex; align-items: baseline; gap: 11px; min-width: 0; }
  .name { color: #efe6d7; font-family: var(--cond); font-size: 19px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .path { font-family: var(--mono); font-size: 10.5px; color: var(--faint); white-space: nowrap; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 6px 0 10px; border-radius: 12px; border: 1px solid #2f4a2c; background: #0e1410; flex: none; }
  /* Locked to the connected device: same face as the select, but it is just text. */
  .pill .fw { color: #a9d9a1; font-family: var(--cond); font-size: 12px; letter-spacing: .09em; text-transform: uppercase; }
  .btn .dot { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #67c45c; box-shadow: 0 0 6px #67c45c; vertical-align: 1px; }
  /* A transfer is running (even with the panel closed): amber, pulsing. */
  .btn .dot.pulse { background: #e8b06a; box-shadow: 0 0 6px #e8b06a; animation: cardbusy 1s ease-in-out infinite; }
  @keyframes cardbusy { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
  .pill select { background: transparent; border: 0; color: #a9d9a1; font-family: var(--cond); font-size: 12px; letter-spacing: .09em; text-transform: uppercase; cursor: pointer; }
  .pill select:focus { outline: none; }
</style>
