/**
 * The cable source picker (issue #13): right-clicking a patchable control
 * asks "what should modulate this?". One instance, positioned at the click;
 * `CablePicker.svelte` renders it and creates (or reveals) the cable.
 */

export interface PickerRequest {
  /** Cable destination the new cable will modulate. */
  destination: string
  /** The control's label, for the popup header. */
  label: string
  x: number
  y: number
}

class Picker {
  request = $state<PickerRequest | null>(null)

  show(destination: string, label: string, x: number, y: number): void {
    this.request = { destination, label, x, y }
  }
  hide(): void {
    this.request = null
  }
}

export const picker = new Picker()
