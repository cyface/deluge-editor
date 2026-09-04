<script lang="ts">
  /**
   * One status line: what is happening (`busy`), what went wrong (`err`, an
   * alert), what just happened (`ok`, `notice`), or what to watch out for
   * (`caution`). The faces are `theme.css`'s `.msg.*`, so every panel and
   * dialog says these things the same way.
   */
  import type { Snippet } from 'svelte'
  interface Props {
    kind: 'busy' | 'err' | 'ok' | 'notice' | 'caution'
    testid?: string
    children: Snippet
  }
  let { kind, testid, children }: Props = $props()
</script>

<p class="msg {kind}" role={kind === 'err' ? 'alert' : undefined} data-testid={testid}>{@render children()}</p>
