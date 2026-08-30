<script lang="ts">
  /** The raining-diamonds mark (public/deluge-mark.svg), inlined so it takes the current fill. */
  interface Props { size?: number; class?: string }
  let { size = 36, class: cls = '' }: Props = $props()
</script>

<svg class={cls} width={size} height={size} viewBox="0 0 234 234" aria-hidden="true">
  <path d="M89 45h18V27H89zM107 63h18V45h-18zM125 81h18V63h-18zM143 99h18V81h-18zM35 44h18V26H35zM53 62h18V44H53zM71 80h18V62H71zM89 98h18V80H89zM18 81h18V63H18zM36 99h18V81H36zM54 117h18V99H54zM72 135h18v-18H72zM35 153h18v-18H35zM53 171h18v-18H53zM71 189h18v-18H71zM89 207h18v-18H89zM109 135h18v-18h-18zM127 153h18v-18h-18zM145 171h18v-18h-18zM162 134h18v-18h-18zM180 152h18v-18h-18zM198 170h18v-18h-18zM108 173h18v-18h-18zM126 191h18v-18h-18zM144 209h18v-18h-18z" />
</svg>

<style>
  svg { fill: currentColor; shape-rendering: crispEdges; }
</style>
