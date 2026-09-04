<script lang="ts">
  import { referencedSampleFiles } from '../core/preset'
  import { card } from './state/card.svelte'
  import { changesNote, confirm, loadedName } from './state/confirm.svelte'
  import { editor } from './state/editor.svelte'
  import { follow } from './state/follow.svelte'
  import { kit } from './state/kit.svelte'
  import { library } from './state/library.svelte'
  import { canMountCard } from './localcard'
  import { randomizer } from './state/randomize.svelte'
  import Mark from './Mark.svelte'
  import Menu from './controls/Menu.svelte'
  import MenuItem from './controls/MenuItem.svelte'
  import { midiTip, NEEDS_FOLDER_ACCESS } from './copy'
  import { UI_HELP } from './help'
  import { takeFiles } from './filepick'
  import { saveBlob } from './saveblob'

  let fileInput: HTMLInputElement | undefined = $state()
  async function pick(e: Event) {
    const [f] = takeFiles(e)
    if (f) editor.load(await f.text(), f.name)
  }
  function download() {
    saveBlob(
      editor.fileName || editor.suggestedFileName || `${editor.preset?.tag === 'kit' ? 'KIT' : 'SYNTH'}.XML`,
      new Blob([editor.output], { type: 'application/xml' }),
    )
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
  const fwTitle = $derived(fwLocked ? UI_HELP['ui.firmware.device'] : UI_HELP['ui.firmware.chosen'])
  /*
   * The connected dot lives on the pill (issue #37): the pill is already what
   * a connection changes, since it locks to the device's firmware, so it is
   * where "a Deluge is here" belongs — and it is the one place that stays in
   * view when the commands fold into menus. Amber and pulsing during a
   * transfer, whether or not the card dialog is open.
   */
  const transferring = $derived(card.busy ? `Card transfer in progress: ${card.busy}…` : null)
  const dotTitle = $derived(transferring ?? UI_HELP['ui.deluge.connected'])
  const midiTitle = (key: string) => transferring ?? midiTip(UI_HELP[key], card.supported)
</script>

<div class="bar">
  <div class="logo"><Mark size={34} /><b>Deluge <span>{kind}</span></b></div>
  <div class="namewrap">
    {#if editor.preset}
      <span class="name" data-testid="file-name">{editor.fileName || '(unnamed)'}</span>
      {#if editor.preset.attrs.firmwareVersion}<span class="path">saved by firmware {editor.preset.attrs.firmwareVersion}</span>{/if}
    {:else}
      <span class="path">no preset loaded</span>
    {/if}
  </div>
  <label class="pill" title={fwTitle}>
    {#if card.status === 'connected'}<span class="dot" class:amber={!!card.busy} class:pulse={!!card.busy} data-testid="deluge-dot" title={dotTitle}></span>{/if}
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
  <Menu label="New" testid="menu-new" title={UI_HELP['ui.menu.new']}>
    <MenuItem label="Synth" testid="new-synth" title={UI_HELP['ui.new.synth']} onclick={() => startNew('synth')} />
    <MenuItem label="Kit" testid="new-kit" title={UI_HELP['ui.new.kit']} onclick={() => startNew('kit')} />
    <!-- With nothing loaded it begins from the init synth and rolls that, so
         it never needs a preset first. The panel it opens is the patch
         generator; the arpeggiator's note Randomizer is a panel in the grid
         and shares no wording with it. -->
    <MenuItem
      label="Randomize"
      testid="randomize-button"
      title={UI_HELP['ui.new.randomize']}
      onclick={() => { if (!editor.preset) editor.newSynth(); randomizer.open = true }}
    />
  </Menu>
  <!-- An ellipsis marks the items that need more from you before they act —
       a file or folder picker, a save dialog with a name to type. The card
       browsers act on the click that picks a file, so they have none. -->
  <Menu label="Open" testid="menu-open" title={UI_HELP['ui.menu.open']}>
    <MenuItem label="From this computer…" testid="file-open-button" title={UI_HELP['ui.open.file']} onclick={() => fileInput?.click()} />
    <MenuItem label="From Deluge" testid="card-open-button" title={midiTitle('ui.open.card')} onclick={() => card.openPanel('open')} />
    <!-- The card's sample library lives under Open rather than as a fourth
         menu: issue #37 folded the commands into three so the file name has
         room, and a fourth costs exactly that room. It is set apart by a
         rule because it opens the card's samples, not a preset. -->
    <div class="sep" role="separator"></div>
    <MenuItem
      label="Sample library on Deluge"
      testid="library-button"
      title={midiTitle('ui.open.library')}
      disabled={!card.supported || !!card.busy}
      onclick={() => void library.openPanel()}
    />
    <!-- The same library over a card in a reader: the browser's folder
         picker grants the write access, and a card of songs indexes in
         seconds instead of minutes. Chrome and Edge only, like Web MIDI. -->
    <MenuItem
      label="Sample library on a card in this computer…"
      testid="library-mounted-button"
      title={canMountCard() ? UI_HELP['ui.open.mounted'] : NEEDS_FOLDER_ACCESS}
      disabled={!canMountCard() || !!library.busy}
      onclick={() => void library.openMounted()}
    />
  </Menu>
  <!-- Save's items are disabled without a preset rather than the whole menu,
       so it still says what it would do. -->
  <Menu label="Save" testid="menu-save" title={UI_HELP['ui.menu.save']}>
    <MenuItem label="Download XML" testid="download-xml" title={UI_HELP['ui.save.xml']} disabled={!editor.preset} onclick={download} />
    {#if showZip}
      <MenuItem label="Download zip" testid="download-zip-top" title={UI_HELP[editor.preset?.tag === 'kit' ? 'ui.save.zipKit' : 'ui.save.zip']} onclick={() => kit.downloadZip()} />
    {/if}
    <MenuItem label="To Deluge…" testid="card-save-button" title={midiTitle('ui.save.card')} disabled={!editor.preset} onclick={() => card.openPanel('save')} />
    <!-- Straight back to the file it came from or last went to, no browser:
         the hint is the path so the item says exactly what it overwrites.
         Disabled, not hidden, when the preset has no card path yet, so the
         command stays discoverable. Set apart by a rule: it is the one item
         here that acts on the card at a click, so a slip off To Deluge
         should not land on it. -->
    <div class="sep" role="separator"></div>
    <MenuItem
      label="To Deluge — Overwrite"
      testid="card-overwrite"
      hint={editor.cardPath ?? undefined}
      title={editor.cardPath ? midiTitle('ui.save.overwrite') : UI_HELP['ui.save.overwriteNone']}
      disabled={!editor.cardPath || !!card.busy}
      onclick={() => void card.overwrite()}
    />
  </Menu>
  {#if follow.available}
    <!-- Firmware-gated like every other control: Midi-Follow does not exist
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
      title={UI_HELP['ui.follow.toggle']}
      onclick={() => { if (!editor.preset) editor.newSynth(); void follow.toggle() }}
    >
      {#if follow.status === 'listening'}<span class="dot amber pulse"></span>{/if}Follow Mode
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
  /* The dot is theme.css's; a transfer running (even with the dialog closed), or Follow listening, is amber and pulsing. */
  .btn .dot { margin-right: 6px; vertical-align: 1px; }
  .pill select { background: transparent; border: 0; color: #a9d9a1; font-family: var(--cond); font-size: 12px; letter-spacing: .09em; text-transform: uppercase; cursor: pointer; }
  .pill select:focus { outline: none; }
  /* Rendered inside the menu's list (the snippet compiles here, so the style reaches it). */
  .sep { height: 1px; margin: 4px 6px; background: var(--edge-hi); }
</style>
