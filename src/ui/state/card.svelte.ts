/**
 * Card access over Web MIDI: connection to the Deluge's SysEx port, the
 * directory being browsed, and load/save. All protocol work happens in
 * `src/core/sysex`; this store only wires it to a MIDI port and to the
 * editor. One instance, like `editor`.
 */

import { supports } from '../../core/firmware/features'
import { parseVersion } from '../../core/firmware/version'
import {
  IDENTITY_REQUEST,
  isDirectory,
  parseIdentityReply,
  SmsClient,
  type DirEntry,
} from '../../core/sysex'
import { editor } from './editor.svelte'

/** Deluge port 3 is the SysEx port; any Deluge port answers, port 3 is just quietest. */
const portScore = (name: string): number =>
  /deluge/i.test(name) ? (/(^|\D)3(\D|$)|sysex/i.test(name) ? 2 : 1) : 0

const pickPort = <T extends { name: string | null }>(ports: T[]): T | undefined =>
  ports
    .filter((p) => portScore(p.name ?? '') > 0)
    .sort((a, b) => portScore(b.name ?? '') - portScore(a.name ?? ''))[0]

class Card {
  open = $state(false)
  status = $state<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  portName = $state('')
  /** Firmware version from the universal device inquiry, e.g. "1.3.0". */
  identity = $state<string | null>(null)
  path = $state('/SYNTHS')
  entries = $state<DirEntry[]>([])
  saveName = $state('')
  busy = $state<string | null>(null)
  progress = $state(0)
  saved = $state<string | null>(null)
  error = $state<string | null>(null)
  /** Path armed for overwrite: the first Save click on an existing name only arms. */
  armed = $state<string | null>(null)

  private client: SmsClient | null = null

  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  /** null until the device answered the inquiry; then whether its firmware has smSysex. */
  readonly firmwareOk = $derived.by(() => {
    if (this.identity === null) return null
    try {
      return supports(parseVersion(`c${this.identity}`), 'smSysex')
    } catch {
      return null
    }
  })

  toggle(): void {
    this.open = !this.open
    if (this.open && this.status === 'idle') void this.connect()
  }

  async connect(): Promise<void> {
    if (!this.supported) {
      this.status = 'error'
      this.error = 'Web MIDI is not available here — use Chrome or Edge.'
      return
    }
    this.status = 'connecting'
    this.error = null
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true })
      const output = pickPort([...access.outputs.values()])
      const input = pickPort([...access.inputs.values()])
      if (!output || !input) {
        const seen = [...access.outputs.values()].map((o) => o.name).filter(Boolean)
        throw new Error(
          `no Deluge MIDI port found${seen.length ? ` (saw: ${seen.join(', ')})` : ''} — connect the Deluge over USB`,
        )
      }
      this.portName = output.name ?? 'Deluge'
      const client = new SmsClient((bytes) => output.send(bytes))
      input.onmidimessage = (e) => {
        const data = e.data
        if (!data) return
        const id = parseIdentityReply(data)
        if (id) {
          this.identity = `${id.major}.${id.minor}.${id.patch}`
          return
        }
        client.receive(data)
      }
      this.client = client
      output.send(IDENTITY_REQUEST)
      await client.ping()
      this.status = 'connected'
      this.path = editor.preset?.tag === 'kit' ? '/KITS' : '/SYNTHS'
      this.saveName = editor.fileName || ''
      await this.refresh()
    } catch (e) {
      this.status = 'error'
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  async refresh(): Promise<void> {
    await this.run('Reading directory', async () => {
      this.entries = (await this.client!.listDirectory(this.path)).toSorted(
        (a, b) => Number(isDirectory(b)) - Number(isDirectory(a)) || a.name.localeCompare(b.name),
      )
    })
  }

  async enter(name: string): Promise<void> {
    this.path = this.path === '/' ? `/${name}` : `${this.path}/${name}`
    await this.refresh()
  }

  async up(): Promise<void> {
    if (this.path === '/') return
    const cut = this.path.lastIndexOf('/')
    this.path = cut === 0 ? '/' : this.path.slice(0, cut)
    await this.refresh()
  }

  async loadFile(name: string): Promise<void> {
    await this.run(`Reading ${name}`, async () => {
      const data = await this.client!.readFile(this.join(name), (d, t) => (this.progress = t ? d / t : 0))
      editor.load(new TextDecoder().decode(data), name)
      this.saveName = name
      if (!editor.error) this.open = false
    })
  }

  async save(): Promise<void> {
    const name = this.saveName.trim()
    if (!name || !this.client || !editor.preset) return
    const path = this.join(name)
    const exists = this.entries.some((e) => !isDirectory(e) && e.name.toUpperCase() === name.toUpperCase())
    if (exists && this.armed !== path) {
      this.armed = path // first click on an existing name arms; the second overwrites
      return
    }
    this.armed = null
    await this.run(`Writing ${name}`, async () => {
      await this.client!.writeFile(path, new TextEncoder().encode(editor.output), (d, t) => (this.progress = d / t))
      this.saved = `${name} written and read back byte-identical`
      await this.list()
    })
  }

  private join(name: string): string {
    return this.path === '/' ? `/${name}` : `${this.path}/${name}`
  }

  /** refresh() without clobbering `saved`/`busy` bookkeeping of the caller. */
  private async list(): Promise<void> {
    this.entries = (await this.client!.listDirectory(this.path)).toSorted(
      (a, b) => Number(isDirectory(b)) - Number(isDirectory(a)) || a.name.localeCompare(b.name),
    )
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    this.busy = label
    this.progress = 0
    this.saved = null
    this.error = null
    try {
      await fn()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.busy = null
    }
  }
}

export const card = new Card()
