<script lang="ts">
  /**
   * The source picker a patchable control opens on right-click (issue #13):
   * pick what modulates the param and the cable is created at amount 0 —
   * or, when that exact source → destination pair already exists (the
   * firmware's matrix holds one entry per pair), the existing row is
   * revealed instead of duplicated.
   *
   * A menu in the WAI-ARIA sense, like the top bar's (`Menu.svelte`): focus
   * lands on the first item, the arrows move, Escape or a click outside
   * closes it and puts focus back where the right-click came from.
   */
  import { tick } from 'svelte'
  import { paramLabel, type ParamName, type PatchSource } from '../core/preset'
  import { addCable, cablesTo } from '../core/preset/sound'
  import MenuItem from './controls/MenuItem.svelte'
  import { menuItems, menuListKey } from './menukeys'
  import { sourceOptions } from './options'
  import { sourceColor } from './sources'
  import { editor } from './state/editor.svelte'
  import { picker } from './state/picker.svelte'

  const req = $derived(picker.request)
  const options = $derived(sourceOptions(editor.supports))

  // Keep the popup on screen: it opens at the pointer, flipped when close to an edge.
  const W = 172
  const pos = $derived(
    req === null
      ? null
      : {
          x: Math.min(req.x, window.innerWidth - W - 8),
          y: Math.min(req.y, window.innerHeight - (options.length * 26 + 40)),
        },
  )

  let list: HTMLDivElement | undefined = $state()
  let before: HTMLElement | null = null
  $effect(() => {
    if (req === null) return
    before = document.activeElement as HTMLElement | null
    void tick().then(() => menuItems(list)[0]?.focus())
    return () => before?.focus?.()
  })

  function pick(source: string): void {
    const sound = editor.sound
    const dest = req?.destination
    picker.hide()
    if (!sound || !dest) return
    const existing = cablesTo(sound, dest).find((c) => c.attrs.source === source)
    if (!existing) addCable(sound, source as PatchSource, dest as ParamName, 0)
    if (editor.focus.length && !editor.focus.includes('cables')) editor.focus = [...editor.focus, 'cables']
    editor.reveal = { source, destination: dest }
  }

  const onListKey = (e: KeyboardEvent): void => menuListKey(e, list, { onEscape: () => picker.hide(), onTab: () => picker.hide() })
</script>

{#if req && pos}
  <div class="backdrop" role="presentation" onpointerdown={() => picker.hide()} oncontextmenu={(e) => { e.preventDefault(); picker.hide() }}></div>
  <div class="menu" role="menu" tabindex="-1" aria-label="Patch source" data-testid="cable-picker" style="left: {pos.x}px; top: {pos.y}px;" bind:this={list} onkeydown={onListKey}>
    <div class="hd">Patch → {req.label || paramLabel(req.destination)}</div>
    {#each options as o (o.value)}
      <MenuItem label={o.label} dot={sourceColor(o.value)} onclick={() => pick(o.value)} />
    {/each}
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 90; }
  /* The same face as the top bar's menus (`Menu.svelte`): the app has one kind of menu. */
  .menu {
    position: fixed; z-index: 91; width: 172px; max-height: 78vh; overflow: auto; outline: none;
    background: var(--raised-hi); border: 1px solid var(--edge-hi); border-radius: 4px;
    box-shadow: 0 12px 34px rgba(0,0,0,.6); padding: 4px;
  }
  .hd {
    font-family: var(--cond); font-size: 10px; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; color: var(--brass-hi); padding: 4px 6px 5px; border-bottom: 1px solid var(--edge);
    margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
