/**
 * The MPE zones a Deluge has configured on its inputs, from
 * `SETTINGS/MIDIDevices.XML` (`MIDIDeviceManager::writeDevicesToFile`,
 * `MIDIPort::writeToFile`, `beta` e7bae539):
 *
 *   <midiDevices>
 *     <dinPorts><input><mpeLowerZone numMemberChannels="7"/></input></dinPorts>
 *     <upstreamUSBDevice …><input>…</input><output>…</output></upstreamUSBDevice>
 *   </midiDevices>
 *
 * The block is written only when a zone exists, so an absent `<input>` — or an
 * absent file, which the firmware deletes when there is nothing worth
 * writing — means no zones at all. That is the fact that decides whether a
 * follow channel set to a zone can ever match anything.
 *
 * The one oddity is that `numMemberChannels` is not the same quantity in the
 * two zones. For the lower it is `mpeLowerZoneLastMemberChannel` outright; for
 * the upper it is `15 - mpeUpperZoneLastMemberChannel`, a count.
 */

import { child } from '../xml/element'
import { parseTree } from '../xml/parse'

export interface MpeZones {
  /** Last member channel of the lower zone, 0-based. 0 means no lower zone. */
  lowerLast: number
  /** First member channel of the upper zone, 0-based. 15 means no upper zone. */
  upperFirst: number
}

export const hasLowerZone = (z: MpeZones): boolean => z.lowerLast !== 0

/** Input zones per cable, keyed by the tag the firmware writes for that cable. */
export function parseMpeInputs(xml: string): Record<string, MpeZones> {
  const [root] = parseTree(xml)
  const out: Record<string, MpeZones> = {}
  for (const cable of root.children) {
    const input = child(cable, 'input')
    if (input === undefined) continue
    const lower = child(input, 'mpeLowerZone')
    const upper = child(input, 'mpeUpperZone')
    const lowerLast = Number(lower?.attrs.numMemberChannels ?? 0)
    const upperCount = Number(upper?.attrs.numMemberChannels ?? 0)
    out[cable.tag] = {
      lowerLast: Number.isFinite(lowerLast) ? lowerLast : 0,
      upperFirst: 15 - (Number.isFinite(upperCount) ? upperCount : 0),
    }
  }
  return out
}

/**
 * The zones on the cable this editor is talking over. A browser reaches the
 * Deluge as its upstream USB connection, so that is the port whose zones
 * decide whether a CC sent from here can match an MPE follow channel.
 */
export function usbInputZones(byCable: Record<string, MpeZones>): MpeZones {
  return byCable.upstreamUSBDevice ?? byCable.upstreamUSBDevice2 ?? { lowerLast: 0, upperFirst: 15 }
}

/**
 * The MPE zones each of the Deluge's three USB cables starts with.
 *
 * This is the fact that makes the whole thing confusing, and it is not in any
 * file: **cable 2 has MPE zones and the other two do not.** The cables are
 * constructed as `upstreamUSBMIDICable1{0, false, true}`,
 * `upstreamUSBMIDICable2{1, true, false}` and
 * `upstreamUSBMIDICable3{2, false, false}` (`midi_device_manager.cpp`), and
 * the middle argument is `mpe`, which in `MIDICableUSBUpstream`'s constructor
 * (`io/midi/cable_types/usb_device_cable.h`) sets every port's
 * `mpeLowerZoneLastMemberChannel` to 7 and `mpeUpperZoneLastMemberChannel` to
 * 8.
 *
 * So on Deluge Port 2, MIDI channel 1 is not channel 1: `channelToZone` maps
 * it into the lower zone, and a follow channel set to a plain 1 will never
 * match it. On Ports 1 and 3 the reverse holds — channel 1 is channel 1, and a
 * follow channel set to the MPE lower zone will never match. Which port the
 * editor sends on therefore decides which follow settings can work, and
 * picking the first Deluge output in the list is picking one at random.
 *
 * `SETTINGS/MIDIDevices.XML` overrides these when it exists, but it is only
 * written when there is something worth writing, so these defaults are what an
 * untouched Deluge is running.
 */
export const DEFAULT_CABLE_ZONES: Readonly<Record<number, MpeZones>> = {
  1: { lowerLast: 0, upperFirst: 15 },
  2: { lowerLast: 7, upperFirst: 8 },
  3: { lowerLast: 0, upperFirst: 15 },
}

/** The tag `MIDIDeviceManager::writeDevicesToFile` uses for each USB port. */
const CABLE_TAG: Readonly<Record<number, string>> = {
  1: 'upstreamUSBDevice',
  2: 'upstreamUSBDevice2',
}

/** The zones on one USB port: the file's if it says, otherwise the built-in default. */
export function cableZones(port: number, byCable?: Record<string, MpeZones>): MpeZones {
  const tag = CABLE_TAG[port]
  const fromFile = tag === undefined ? undefined : byCable?.[tag]
  return fromFile ?? DEFAULT_CABLE_ZONES[port] ?? { lowerLast: 0, upperFirst: 15 }
}

/** `MIDIPort::channelToZone`, on a 0-based channel. 16 is the lower zone, 17 the upper. */
export function channelToZone(channel0: number, z: MpeZones): number {
  if (z.lowerLast !== 0 && z.lowerLast >= channel0) return 16
  if (z.upperFirst < 15 && z.upperFirst <= channel0) return 17
  return channel0
}

/** `MIDIPort::isMasterChannel`. */
export function isMasterChannel(channel0: number, z: MpeZones): boolean {
  if (z.lowerLast !== 0 && channel0 === 0) return true
  return z.upperFirst < 15 && channel0 === 15
}
