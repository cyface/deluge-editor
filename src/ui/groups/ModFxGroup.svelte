<script lang="ts">
  /**
   * Mod FX: one slot, eight things it can be, and four knobs of which most
   * types read only two.
   *
   * The knobs follow the firmware's own menu relevance
   * (`src/core/params/modfx.ts`) rather than a list of our own, for the same
   * reason pulse width does: a knob that turns and changes nothing is worse
   * than one that is not there (docs/decisions.md). So a flanger shows no
   * Depth, a chorus no Feedback, and with the type off the panel is the type
   * alone. The values stay in the file and round-trip either way.
   */
  import { modFxKnobLabel, modFxOffered, MOD_FX_KNOB_ATTR, type ModFxKnob } from '../../core/params/modfx'
  import { SOUND_ATTR_ORDER, SOUND_PARAM_ATTRS, type SoundElement } from '../../core/preset'
  import type { ModFxType } from '../../core/preset/enums'
  import { ensureParams, params } from '../../core/preset/sound'
  import { setAttr } from '../../core/xml'
  import HexKnob from '../controls/HexKnob.svelte'
  import Select from '../controls/Select.svelte'
  import { HELP } from '../help'
  import { modFxOptions } from '../options'
  import { editor } from '../state/editor.svelte'
  interface Props { sound: SoundElement }
  let { sound }: Props = $props()
  const P = () => ensureParams(sound)

  const KNOBS: ModFxKnob[] = ['rate', 'depth', 'offset', 'feedback']
  const type = $derived((sound.attrs.modFXType ?? 'none') as ModFxType)
  const shown = $derived(KNOBS.filter((k) => modFxOffered(type, k)))
</script>

<div class="fields">
  <Select label="Type" name="modFXType" value={sound.attrs.modFXType} options={modFxOptions(editor.supports)} title={HELP['sound.modFXType']} onchange={(v) => setAttr(sound, 'modFXType', v, SOUND_ATTR_ORDER)} />
</div>
{#if shown.length}
  <div class="knobrow">
    {#each shown as k (k)}
      <HexKnob
        el={params(sound)}
        ensure={P}
        attr={MOD_FX_KNOB_ATTR[k]}
        label={modFxKnobLabel(type, k)}
        order={SOUND_PARAM_ATTRS}
        {sound}
      />
    {/each}
  </div>
{:else}
  <p class="off">Mod FX is off. Pick a type to get its controls.</p>
{/if}

<style>
  .off { margin: 8px 0 0; font-size: 11px; color: var(--faint); }
</style>
