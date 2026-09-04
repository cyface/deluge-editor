<script lang="ts">
  /** One command in a `Menu`. Focus is roving (the menu moves it), so it is not in the tab order itself. */
  interface Props {
    label: string
    testid?: string
    title?: string
    disabled?: boolean
    /** Small mono note after the label — a keyboard hint, a status. */
    hint?: string
    /** A colour swatch before the label — a modulation source's. */
    dot?: string
    onclick: () => void
  }
  let { label, testid, title, disabled = false, hint, dot, onclick }: Props = $props()
</script>

<button type="button" role="menuitem" tabindex="-1" data-testid={testid} {title} {disabled} {onclick}>
  {#if dot}<i class="dot" style="background: {dot}" aria-hidden="true"></i>{/if}
  <span class="label">{label}</span>
  {#if hint}<span class="hint">{hint}</span>{/if}
</button>

<style>
  button {
    display: flex; align-items: center; gap: 12px; width: 100%; padding: 5px 8px;
    background: transparent; border: 0; border-radius: 3px; cursor: pointer;
    font-family: var(--cond); font-size: 12.5px; letter-spacing: .05em; color: var(--text-list); text-align: left; white-space: nowrap;
  }
  button:hover:not(:disabled), button:focus-visible { background: #2a2419; color: var(--brass-hi); outline: none; }
  button:disabled { opacity: .4; cursor: default; }
  .label { flex: 1; }
  .hint { font-family: var(--mono); font-size: 9.5px; color: var(--faint); letter-spacing: .03em; }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; margin-right: -5px; }
</style>
