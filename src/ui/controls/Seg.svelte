<script lang="ts" generics="T extends string | number">
  /**
   * A segmented control: one of a few, pressed. The envelope and LFO tabs,
   * the generator's intensity, Follow Mode's target and a cable's polarity are
   * all this — each button says `aria-pressed`, and an item can carry a dot
   * (a colour: this source has cables), read idle, or bring its own
   * attributes for tests.
   */
  interface Item {
    id: T
    label: string
    dot?: string
    idle?: boolean
    title?: string
    /** `data-*` and the like, spread onto the button. */
    attrs?: Record<string, string | undefined>
  }
  interface Props {
    items: Item[]
    selected: T
    onselect: (id: T) => void
    /** Names the group for assistive tech. */
    label?: string
    title?: string
    /** No top margin: the control sits in a row, not under a heading. */
    flush?: boolean
    /** The selection is a default the file does not hold: dimmed. */
    dim?: boolean
  }
  let { items, selected, onselect, label, title, flush = false, dim = false }: Props = $props()
</script>

<div class="seg" class:flush class:default={dim} role={label ? 'group' : undefined} aria-label={label} {title}>
  {#each items as it (it.id)}
    <button type="button" class:on={it.id === selected} class:idle={it.idle} aria-pressed={it.id === selected} title={it.title} {...it.attrs} onclick={() => onselect(it.id)}>
      {it.label}{#if it.dot}<i style="--d:{it.dot}"></i>{/if}
    </button>
  {/each}
</div>
