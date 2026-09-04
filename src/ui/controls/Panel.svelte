<script lang="ts">
  /**
   * A section of the editor: the header line — title, one-line summary,
   * actions — over its content. A flow block passes its `group`, which names
   * it, colours its stripe and hangs the help line on the heading; the
   * page's other panels (the kit's rows and builder, the range editor) pass a
   * `title` instead and sit in the flow rather than a masonry column.
   */
  import type { Snippet } from 'svelte'
  import type { Group } from '../groups'
  import { panelHelp } from '../help'

  interface Props {
    group?: Group
    /** In place of a group's name. */
    title?: string
    /** The one-line summary, as text… */
    sub?: string
    /** …or as markup. */
    subtitle?: Snippet
    /** Buttons at the header's right edge. */
    actions?: Snippet
    /** The stripe colour, for a panel without a group (`var(--osc)`). */
    color?: string
    /** In the page flow (margin above) rather than a masonry column (margin below). */
    flow?: boolean
    testid?: string
    children: Snippet
  }
  let { group, title, sub, subtitle, actions, color, flow = false, testid, children }: Props = $props()
  const stripe = $derived(group ? `var(${group.color})` : color)
</script>

<section
  class="panel"
  class:flow
  id={group ? `panel-${group.id}` : undefined}
  data-group={group?.id}
  data-testid={testid}
  style:--c={stripe}
>
  <div class="ph">
    <!-- The block's own line, for someone who does not yet know what the
         section is for (issue #20). On the heading, not the whole panel: a
         tooltip over every control in the section would fight with theirs. -->
    <h2 title={group ? panelHelp(group.id) : undefined}>{group ? group.name : title}</h2>
    {#if subtitle}<span class="sub">{@render subtitle()}</span>
    {:else if sub}<span class="sub">{sub}</span>{/if}
    {#if actions}<span class="acts">{@render actions()}</span>{/if}
  </div>
  {@render children()}
</section>

<style>
  .panel {
    break-inside: avoid-column; margin: 0 0 9px; background: linear-gradient(180deg, var(--panel2), var(--panel)); border: 1px solid var(--edge);
    border-radius: 4px; padding: 9px 11px 12px; position: relative; overflow: hidden;
  }
  .panel.flow { margin: 10px 0 0; }
  .panel::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--c, var(--edge-hi)); }
</style>
