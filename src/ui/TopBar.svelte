<script lang="ts">
  import { referencedSampleFiles } from '../core/preset'
  import { card } from './state/card.svelte'
  import { changesNote, confirm, loadedName } from './state/confirm.svelte'
  import { editor } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'
  import { kit } from './state/kit.svelte'
  import { library } from './state/library.svelte'
  import { randomizer } from './state/randomize.svelte'
  import Mark from './Mark.svelte'
  import Menu from './controls/Menu.svelte'
  import MenuItem from './controls/MenuItem.svelte'

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
    a.download = editor.fileName || editor.suggestedFileName || `${editor.preset?.tag === 'kit' ? 'KIT' : 'SYNTH'}.XML`
    a.click()
    URL.revokeObjectURL(url)
  }
  const kind = $derived(editor.preset?.tag === 'kit' ? 'Kit' : editor.preset ? 'Synth' : 'Editor')
  /*
   * New must not silently discard unsaved work: with edits pending it asks
   * first, in the same dialog a preset dropped over one uses. Clean, it just
   * goes — a fresh template over an unedited one loses nothing.
   */
  function startNew(what: 'synth' | 'kit'): void {
    const run = () => (what === 'synth' ? editor.newSynth() : editor.newKit())
    if (editor.preset && editor.changeCount > 0) {
      confirm.ask({ question: `Discard changes to ${loadedName()}? A new ${what} replaces it${changesNote()}.`, verb: 'Discard', run })
      return
    }
    run()
  }
  /** A kit, or any preset referencing external files, can share as a zip. */
  const showZip = $derived(
    editor.preset !== null && (editor.preset.tag === 'kit' || referencedSampleFiles(editor.preset).length > 0),
  )
  /** While a Deluge is connected the selector is locked to it: the device is the ground truth. */
  const fwLocked = $derived(card.status === 'connected' && editor.deviceFirmware !== null)
  /*
   * The pill gates controls and nothing else — a save keeps the file's own
   * `firmwareVersion` and `earliestCompatibleFirmware`, because those tell the
   * instrument which legacy conversions to run on the values (issue #28,
   * decisions.md). The tooltip says so rather than letting “target” be read as
   * a stamp the save applies.
   */
  const fwTitle = $derived(
    (fwLocked
      ? 'Firmware of the connected Deluge. A control this firmware can’t honour is omitted.'
      : 'Firmware the controls are shown for. A control this firmware can’t honour is omitted.') +
      ' Saving does not restamp the file — it keeps the version that wrote it.',
  )
  /*
   * The connected dot lives on the pill (issue #37): the pill is already what
   * a connection changes, since it locks to the device's firmware, so it is
   * where "a Deluge is here" belongs — and it is the one place that stays in
   * view when the commands fold into menus. Amber and pulsing during a
   * transfer, whether or not the card dialog is open.
   */
  const dotTitle = $derived(card.busy ? `Card transfer in progress: ${card.busy}…` : 'Connected to the Deluge over MIDI')
  const midiTitle = (does: string) =>
    card.busy ? `Card transfer in progress: ${card.busy}…` : card.supported ? `${does} (connects first if needed)` : 'Web MIDI needs Chrome or Edge'
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
    {#if card.status === 'connected'}<span class="dot" class:pulse={!!card.busy} data-testid="deluge-dot" title={dotTitle}></span>{/if}
    {#if fwLocked}
      <span class="fw" data-testid="firmware-locked">{editor.firmware}</span>
    {:else}
      <select data-testid="firmware" bind:value={editor.firmware}>
        {#each editor.firmwareChoices as v (v)}<option value={v}>{v}</option>{/each}
      </select>
    {/if}
  </label>
  <input bind:this={fileInput} type="file" accept=".xml,.XML,text/xml,application/xml" hidden data-testid="file-input" onchange={pick} />
  <!--
    The commands are grouped by verb (issue #37): ten buttons in a row left
    the file name no room. Only the modes stay out as buttons — Follow Mode
    and Changes carry live state, and a menu would hide exactly the thing you
    glance at.
  -->
  <Menu label="New" testid="menu-new" title="Start a preset from the Deluge's own templates, or roll one">
    <MenuItem label="Synth" testid="new-synth" title="Start a new synth from the Deluge's own init preset. Asks first if there are unsaved changes." onclick={() => startNew('synth')} />
    <MenuItem label="Kit" testid="new-kit" title="Start a kit from the Deluge's own blank kit — then drop a folder of WAVs on the page. Asks first if there are unsaved changes." onclick={() => startNew('kit')} />
    <!-- With nothing loaded it begins from the init synth and rolls that, so
         it never needs a preset first. The panel it opens is the patch
         generator; the arpeggiator's note Randomiser is a panel in the grid
         and shares no wording with it. -->
    <MenuItem
      label="Randomize"
      testid="randomize-button"
      title="Generate a random patch: intensity, which sections it may touch, and a seed you can write down. Every roll is an edit you can undo from Changes."
      onclick={() => { if (!editor.preset) editor.newSynth(); randomizer.open = true }}
    />
  </Menu>
  <Menu label="Open" testid="menu-open" title="Open a preset from this computer or from the Deluge">
    <MenuItem label="From this computer" testid="file-open-button" title="Open a preset XML from this computer" onclick={() => fileInput?.click()} />
    <MenuItem label="From Deluge" testid="card-open-button" title={midiTitle('Open a preset from the Deluge’s SD card over MIDI')} onclick={() => card.openPanel('open')} />
    <!-- The card's sample library lives under Open rather than as a fourth
         menu: issue #37 folded the commands into three so the file name has
         room, and a fourth costs exactly that room. It is set apart by a
         rule because it opens the card's samples, not a preset. -->
    <div class="sep" role="separator"></div>
    <MenuItem
      label="Sample Library on Deluge"
      testid="library-button"
      title={midiTitle('Browse SAMPLES/ on the card: see which songs, kits and synths use each sample, and rename, move or delete with those files updated to follow')}
      disabled={!card.supported || !!card.busy}
      onclick={() => void library.openPanel()}
    />
  </Menu>
  <!-- Save's items are disabled without a preset rather than the whole menu,
       so it still says what it would do. -->
  <Menu label="Save" testid="menu-save" title="Download the preset, or write it to the Deluge">
    <MenuItem label="Download XML" testid="download-xml" title="Just the preset file being edited" disabled={!editor.preset} onclick={download} />
    {#if showZip}
      <MenuItem label="Download Zip" testid="download-zip-top" title="Preset + samples + README, ready to share{editor.preset?.tag === 'kit' ? ' — credits are set in the Share section below' : ''}" onclick={() => kit.downloadZip()} />
    {/if}
    <MenuItem label="To Deluge" testid="card-save-button" title={midiTitle('Write the current preset to the Deluge’s SD card')} disabled={!editor.preset} onclick={() => card.openPanel('save')} />
    <!-- Straight back to the file it came from or last went to, no browser:
         the hint is the path so the item says exactly what it overwrites.
         Disabled, not hidden, when the preset has no card path yet, so the
         command stays discoverable. Set apart by a rule: it is the one item
         here that acts on the card at a click, so a slip off To Deluge
         should not land on it. -->
    <div class="sep" role="separator"></div>
    <MenuItem
      label="To Deluge – Overwrite"
      testid="card-overwrite"
      hint={editor.cardPath ?? undefined}
      title={editor.cardPath
        ? midiTitle(`Write the preset straight back to ${editor.cardPath} — where it was opened from, or last saved — with no dialog`)
        : 'Open a preset from the Deluge, or save one there, and this writes it back to the same file'}
      disabled={!editor.cardPath || !!card.busy}
      onclick={() => void card.overwrite()}
    />
  </Menu>
  {#if follow.available}
    <!-- Firmware-gated like every other control: MIDI Follow does not exist
         below community 1.1.0 and on no official build, so the button is
         absent there rather than disabled (docs/decisions.md). -->
    <!-- Unlike the commands this one does not need a preset first: the mode
         is a reason to start one, not something you do to one you already
         have. With nothing loaded it opens the Deluge's own init synth for the
         CCs to land in, the same file New › Synth would give you. -->
    <button
      type="button"
      class="btn"
      class:on={follow.on}
      data-testid="follow-button"
      title="Mirror the Deluge’s own knob moves: shows only the parameters MIDI Follow can reach, and moves them as the instrument reports them. Starts a new synth if nothing is loaded."
      onclick={() => { if (!editor.preset) editor.newSynth(); void follow.toggle() }}
    >
      {#if follow.status === 'listening'}<span class="dot pulse"></span>{/if}Follow Mode
    </button>
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
  /* When the row is tight the firmware note gives way before the name loses a pixel: the name is what the bar is about. */
  .name { flex: 0 0 auto; max-width: 100%; color: #efe6d7; font-family: var(--cond); font-size: 19px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .path { flex: 0 1 auto; min-width: 0; font-family: var(--mono); font-size: 10.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 6px 0 10px; border-radius: 12px; border: 1px solid #2f4a2c; background: #0e1410; flex: none; }
  /* Locked to the connected device: same face as the select, but it is just text. */
  .pill .fw { color: #a9d9a1; font-family: var(--cond); font-size: 12px; letter-spacing: .09em; text-transform: uppercase; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #67c45c; box-shadow: 0 0 6px #67c45c; flex: none; }
  .btn .dot { margin-right: 6px; vertical-align: 1px; }
  /* A transfer is running (even with the dialog closed), or Follow is listening: amber, pulsing. */
  .dot.pulse { background: #e8b06a; box-shadow: 0 0 6px #e8b06a; animation: cardbusy 1s ease-in-out infinite; }
  @keyframes cardbusy { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
  .pill select { background: transparent; border: 0; color: #a9d9a1; font-family: var(--cond); font-size: 12px; letter-spacing: .09em; text-transform: uppercase; cursor: pointer; }
  .pill select:focus { outline: none; }
  /* Rendered inside the menu's list (the snippet compiles here, so the style reaches it). */
  .sep { height: 1px; margin: 4px 6px; background: var(--edge-hi); }
</style>
