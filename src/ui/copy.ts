/**
 * Sentences the UI says in more than one place, written once so the panels,
 * the dialogs and the stores cannot drift into three phrasings of one fact.
 * Tooltip copy for controls stays in `help.ts`,
 * keyed and cited; this file is for the sentences that recur — a status line,
 * a warning, a note appended to a knob's description.
 *
 * Shape: sentence case, no trailing period, unless the sentence is appended
 * after other sentences (`KIT_BUS_NOTE`, `SYNCED_NOTE`), where it keeps its
 * full stop so the join reads as prose.
 */

/** Suffix for a command that talks to the Deluge: the click connects if nothing is connected yet. */
export const CONNECTS_FIRST = '(connects first if needed)'

/** Why a Deluge command is unavailable in this browser: Web MIDI with SysEx is Chrome and Edge only. */
export const NEEDS_WEB_MIDI = 'Web MIDI needs Chrome or Edge'

/** Why the card-in-a-reader library is unavailable: the File System Access API is Chrome and Edge only. */
export const NEEDS_FOLDER_ACCESS = 'Opening a folder for writing needs Chrome or Edge'

/** Tooltip for a command that talks to the Deluge: what it does, and that it connects first — or why it cannot. */
export const midiTip = (does: string, supported: boolean): string => (supported ? `${does} ${CONNECTS_FIRST}` : NEEDS_WEB_MIDI)

/** The three sample browsers' "on the Deluge" button. */
export const browseSamplesTip = (supported: boolean): string => midiTip('Browse SAMPLES/ on the Deluge', supported)

/** A preview button for a sample the editor has no bytes for and no card to read them from. */
export const NOT_ON_THIS_COMPUTER = 'Sample is not on this computer — connect the Deluge to preview it'

/** A held sample the card does not have yet; `what` is the file that will be saved (kit, preset). */
export const notOnCardYet = (what: string): string => `Not on the card yet — saving the ${what} will copy it there`

/** A referenced sample the card does not have and the editor cannot supply; `part` is what stays silent (row, range). */
export const notOnCard = (what: string, part: string): string =>
  `Not on the card — the Deluge loads the ${what} anyway, but this ${part} will be silent`

/** Busy line while a command waits for the card connection. */
export const CONNECTING = 'Connecting to the Deluge'

/** The connection did not come up and the command needed it. */
export const UNREACHABLE = 'Could not reach the Deluge'

/** A folder offered as samples held nothing the Deluge plays; `where` names the folder. */
export const noWavs = (where: string): string => `No .wav files in ${where}`

/** Every WAV header read failed; the detail follows. */
export const NO_WAVS_READABLE = 'None of the WAV files could be read'

/** A dialog or import outlived the preset it was opened for. */
export const NO_LONGER_LOADED = 'The preset this was for is no longer loaded'

/**
 * A synced LFO's rate knob: the firmware never reads the stored value
 * (`Sound::getGlobalLFOPhaseIncrement`, `Voice::getLocalLFOPhaseIncrement`).
 */
export const SYNCED_NOTE = 'Disabled by tempo sync — the Deluge takes this LFO’s speed from the song, not from this value.'

/** Envelope 1 is the amplitude envelope (`Voice::render`, model/voice/voice.cpp); the tabs say so. */
export const ENV1_HARDWIRED = 'Envelope 1 is hardwired to volume'

/** Sentence added to a kit-bus control's tooltip, where the same knob exists on a sound. */
export const KIT_BUS_NOTE = 'On the kit bus it applies to every row at once, after they are summed.'

/**
 * Another Web MIDI client is on this Deluge (issue #8): a second tab, another
 * browser, another app. Nothing is blocked — a client cannot stop the other
 * one writing — but a verified write can be overwritten a second later.
 */
export const OTHER_EDITOR = 'Another editor is talking to this Deluge'
export const OTHER_EDITOR_WARNING = `${OTHER_EDITOR}. Writes from both overwrite each other — last one wins.`
/** Qualifies a "written" notice: `what` is what could be overwritten (it, them). */
export const otherEditorCould = (what: string): string =>
  `${OTHER_EDITOR.charAt(0).toLowerCase()}${OTHER_EDITOR.slice(1)} and could overwrite ${what}`
