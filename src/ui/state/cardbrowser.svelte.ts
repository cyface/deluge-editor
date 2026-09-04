/**
 * A folder on the Deluge's card, browsed for samples: the kit builder, the
 * sample picker and the folder import each own one, on their own `Activity`,
 * so its listing shows as that panel's busy line and its failure as that
 * panel's error. Connects for the gesture — the "From Deluge…" button is
 * the gesture, and making the user find the preset panel first to enable it
 * is a puzzle, not a safeguard.
 *
 * Navigation supersedes: click a folder, then Up before it lands, and the
 * Up listing is the one that shows — the older reply is dropped when it
 * arrives, whichever order the card answers in (`Activity.run`, `live()`).
 */

import { joinPath, parentOf } from '../../core/library'
import { isDirectory } from '../../core/sysex'
import { CONNECTING } from '../copy'
import type { Activity } from './activity.svelte'
import { card } from './card.svelte'
import { isWav } from './wavfiles'

export interface BrowseEntry {
  name: string
  dir: boolean
}

export interface CardBrowserOptions {
  /** Up stops here; the first opening starts here. Default `/SAMPLES`. */
  root?: string
  /** After each listing lands — the picker drops its selection. */
  onListed?: () => void
  /** The card, or a stand-in under test: connected or throwing, and the listing. */
  connect?: () => Promise<void>
  list?: (path: string) => Promise<BrowseEntry[]>
}

const listCard = async (path: string): Promise<BrowseEntry[]> =>
  (await card.listPath(path)).map((e) => ({ name: e.name, dir: isDirectory(e) }))

export class CardBrowser {
  /** The folder on show; null while the browser is closed. */
  path = $state<string | null>(null)
  entries = $state.raw<BrowseEntry[]>([])
  /** Where the browser was last, for a caller that wants to reopen there (`open(browser.last)`). */
  last: string

  readonly root: string
  private readonly connect: () => Promise<void>
  private readonly list: (path: string) => Promise<BrowseEntry[]>
  private readonly onListed: (() => void) | undefined

  /** Whether the folder on show holds any WAV to take. */
  readonly hasWavs = $derived(this.entries.some((e) => !e.dir && isWav(e.name)))

  constructor(
    private readonly activity: Activity,
    opts: CardBrowserOptions = {},
  ) {
    this.root = opts.root ?? '/SAMPLES'
    this.last = this.root
    this.connect = opts.connect ?? (() => card.require())
    this.list = opts.list ?? listCard
    this.onListed = opts.onListed
  }

  /** Open the browser on `path` (the root by default), connecting first if need be. */
  async open(path = this.root): Promise<void> {
    const label = card.connected || this.list !== listCard ? `Reading ${path}` : CONNECTING
    await this.activity.run(
      label,
      async (live) => {
        await this.connect()
        if (live()) this.activity.step(`Reading ${path}`)
        const entries = await this.list(path)
        if (!live()) return // a newer listing has taken over
        this.path = path
        this.last = path
        this.entries = entries
        this.onListed?.()
      },
      { supersede: true },
    )
  }

  /** Into a folder of the one on show. */
  enter(name: string): void {
    if (this.path !== null) void this.open(joinPath(this.path, name))
  }

  up(): void {
    if (this.path === null || this.path === this.root) return
    void this.open(parentOf(this.path))
  }

  close(): void {
    this.path = null
    this.entries = []
  }
}
