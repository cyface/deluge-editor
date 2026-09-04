/**
 * Tooltip copy: what every control does, in a sentence or two (issue #20).
 *
 * Held to the same bar as `FEATURES` and `params/scale.ts` — a description
 * here says what *this firmware* does, not what a synth usually does, and an
 * entry that cannot be traced to firmware source or the firmware's own menu
 * documentation does not belong. The sources, once, so the entries can stay
 * short:
 *
 * - `docs/menus/**` in SynthstromAudible/DelugeFirmware (upstream/community
 *   bef6d9df) is the firmware's own menu documentation; entries drawn from it
 *   are marked `menu docs`.
 * - Everything else cites the file it came from, relative to the firmware's
 *   `src/deluge/`.
 *
 * Two key spaces, because the controls have two:
 *
 * - `PARAM_HELP` is keyed by *parameter name* — the string a patch cable's
 *   `destination` or a gold knob's `controlsParam` uses (`preset/params.ts`).
 *   `HexKnob` looks its own destination up here, so one entry covers the same
 *   parameter wherever it is shown, and the cable and gold-knob pickers name
 *   the same thing the same way.
 * - `HELP` is keyed by a slug for everything that is not a patchable
 *   parameter: selects, toggles, number fields, buttons, and the panels
 *   themselves (`panel.<group id>`).
 *
 * Keep them short. A tooltip is a hint, not a manual page — the test holds
 * every entry to two sentences' worth of characters.
 */

/** Sentence added to a kit-bus control's tooltip, where the same knob exists on a sound. */
export const KIT_BUS_NOTE = 'On the kit bus it applies to every row at once, after they are summed.'

/**
 * Help by parameter name. Envelope stages and LFO rates are handled by
 * `paramHelp` rather than spelled out four times each.
 */
export const PARAM_HELP: Record<string, string> = {
  // --- Oscillators ---------------------------------------------------------
  // menu docs oscillator/volume.md, oscillator/pulse_width.md,
  // oscillator/wave_index.md.
  oscAVolume: 'Level of oscillator A in the mix. Ring mod ignores it — there the two oscillators multiply.',
  oscBVolume: 'Level of oscillator B in the mix. Ring mod ignores it — there the two oscillators multiply.',
  noiseVolume: 'Level of the noise source, mixed in alongside the oscillators.',
  oscAPhaseWidth: 'Pulse width, made by distorting playback of the wave — so it shapes any waveform, not only the square.',
  oscBPhaseWidth: 'Pulse width, made by distorting playback of the wave — so it shapes any waveform, not only the square.',
  oscAWavetablePosition: 'Position in the wavetable. Modulation reaches between the steps shown here; an LFO at depth 50 sweeps the whole table.',
  oscBWavetablePosition: 'Position in the wavetable. Modulation reaches between the steps shown here; an LFO at depth 50 sweeps the whole table.',
  // Pitch destinations are squared by PatchCableSet::getModifiedPatchCableAmount.
  pitch: 'Pitch of the whole voice. Only a cable destination: amounts to pitch are squared, so a pitch cable has to be far larger than a volume one to be heard.',
  oscAPitch: 'Pitch of oscillator A. Only a cable destination: amounts to pitch are squared, so they run much larger than a volume cable’s.',
  oscBPitch: 'Pitch of oscillator B. Only a cable destination: amounts to pitch are squared, so they run much larger than a volume cable’s.',
  // FM. renderSineWaveWithFeedback, model/voice/voice.cpp:1713.
  modulator1Volume: 'How hard modulator 1 drives its carrier — the FM depth. FM mode only.',
  modulator2Volume: 'How hard modulator 2 drives its carrier — the FM depth. FM mode only.',
  modulator1Pitch: 'Pitch of modulator 1, as a cable destination. Amounts are squared, like every pitch cable.',
  modulator2Pitch: 'Pitch of modulator 2, as a cable destination. Amounts are squared, like every pitch cable.',
  modulator1Feedback: 'Modulator 1 phase-modulating itself with its own last output, hard-clipped. Roughens the modulator before it reaches the carrier.',
  modulator2Feedback: 'Modulator 2 phase-modulating itself with its own last output, hard-clipped. Roughens the modulator before it reaches the carrier.',
  carrier1Feedback: 'Carrier 1 phase-modulating itself with its own last output, hard-clipped: brightens the sine towards a harsher tone.',
  carrier2Feedback: 'Carrier 2 phase-modulating itself with its own last output, hard-clipped: brightens the sine towards a harsher tone.',
  // dsp/filter/lpladder.h — a wavefolder folded in ahead of the filters.
  waveFold: 'Wavefolder on the oscillator mix, before the filters. Folds peaks back on themselves, adding harmonics without raising the level.',

  // --- Filters -------------------------------------------------------------
  // Morph is named for the mode it is in: SpecificFilter::getMorphName,
  // model/mod_controllable/filters/filter_config.h.
  lpfFrequency: 'Cutoff of the low-pass filter: everything above it is rolled off. The LPF mode sets the slope and the character.',
  lpfResonance: 'Emphasis around the low-pass cutoff. Higher settings ring at the cutoff and thin out the body below it.',
  lpfMorph: 'One knob whose job follows the LPF mode: Drive on the ladder modes, and on the SVF modes a morph from low-pass at 0 to high-pass at 50.',
  hpfFrequency: 'Cutoff of the high-pass filter: everything below it is rolled off.',
  hpfResonance: 'Emphasis around the high-pass cutoff.',
  hpfMorph: 'One knob whose job follows the HPF mode: on HP Ladder it is FM, the cutoff modulated by the audio itself; on the SVF modes a morph from high-pass at 0 to low-pass at 50.',

  // --- Voice ---------------------------------------------------------------
  portamento: 'Glide time between notes. Only heard when a new note starts while the last is still held.',

  // --- Output --------------------------------------------------------------
  volumePostFX: 'Level of the whole sound, after its effects. This is the knob the file stores as `volume`.',
  volume: 'Level of the voice itself, before the effects. The firmware never writes it, so it exists here only as a cable destination.',
  volumePostReverbSend: 'Level after the reverb send — the point the song’s sidechain ducks. A cable here from Sidechain is the ducking amount.',
  pan: 'Position in the stereo field, centre at CTR and ±25 to either side.',
  // ModControllableAudio::processFX, model/mod_controllable/mod_controllable_audio.cpp:168.
  bass: 'Low shelf: cut below centre, boost above. Centred, the EQ is bypassed and the Bass Freq knob does nothing.',
  treble: 'High shelf: cut below centre, boost above. Centred, the EQ is bypassed and the Treble Freq knob does nothing.',
  bassFreq: 'Corner frequency of the bass shelf. It only takes effect once Bass is moved off centre.',
  trebleFreq: 'Corner frequency of the treble shelf. It only takes effect once Treble is moved off centre.',
  reverbAmount: 'How much of this sound is sent to the song’s reverb. The reverb itself is set on the song, not here.',

  // --- Distortion ----------------------------------------------------------
  // Bit masking and the resampler: mod_controllable_audio.cpp:283-340.
  bitcrushAmount: 'Bit crush: masks off the low bits of every sample. Past halfway the firmware also drops the output level to keep the crushing clean.',
  sampleRateReduction: 'Decimation: resamples the sound down to a lower rate, aliasing as it goes. Independent of the bit crush.',

  // --- Mod FX --------------------------------------------------------------
  // Offset and Feedback exist only for some types, and Grain renames all
  // three: mod_fx/offset.h, mod_fx/feedback.h, modfx::getParamName
  // (model/global_effectable/global_effectable.cpp:1192).
  modFXRate: 'Speed of the mod FX — the LFO inside the chorus, flanger, phaser or warble.',
  modFXDepth: 'How far the mod FX moves. On Grain this knob is Grain Amount.',
  modFXOffset: 'Delay the modulation sweeps around. Chorus, Stereo Chorus, Grain, Warble and Dimension only, and on Grain it is Grain Density.',
  modFXFeedback: 'How much of the effect is fed back into itself, sharpening the sweep. Flanger, Phaser, Grain and Warble only, and on Grain it is Grain Randomness.',

  // --- Delay ---------------------------------------------------------------
  delayRate: 'Delay time. With Sync set this follows the tempo, and the knob picks the note length’s neighbourhood instead.',
  delayFeedback: 'How much of the delay output is fed back in — how many repeats there are before the tail dies away.',

  // --- Sidechain and compressor -------------------------------------------
  // SideChain::render, modulation/sidechain/sidechain.cpp:126.
  compressorShape: 'Curve of the ducking recovery: low is a straight line back up, high bends it into a slow, squishy release.',
  // AudioCompressor: menu docs compressor/threshold.md.
  compressorThreshold: 'Level the compressor starts working at. 0 is 0 dBFS — no compression — and 50 is about −90 dBFS.',
  // GlobalEffectableForClip::renderOutput passes it to sidechain.render.
  sidechainCompressorVolume: 'How far the song’s sidechain ducks this output.',

  // --- Stutter -------------------------------------------------------------
  stutterRate: 'Length of the stuttered slice. With Quantise on it snaps to 4ths, 8ths, 16ths, 32nds or 64ths of the tempo.',

  // --- Arpeggiator ---------------------------------------------------------
  // Sound::render passes the gate as a threshold on the arp phase
  // (processing/sound/sound.cpp:2447); the rest is modulation/arpeggiator.cpp.
  arpRate: 'Speed of the arpeggiator, when Sync is off. With Sync set the note length comes from the tempo instead.',
  arpGate: 'How much of each arp step the note holds before it is released — short is staccato, long is legato.',
  sequenceLength: 'How many steps the arp plays before it starts the sequence again. At 0 the sequence runs its natural length.',
  rhythm: 'Picks a rhythm pattern; the steps the pattern leaves out are silent, so the arp gets a groove instead of an even run.',
  ratchetProbability: 'Chance that a step bursts into a ratchet instead of sounding once.',
  ratchetAmount: 'How many notes a ratchet bursts into. The two fastest sync levels cap it — there is no room to subdivide further.',
  chordPolyphony: 'How many notes a chord step plays at once.',

  // --- Randomiser ----------------------------------------------------------
  // The arp-off branch still applies note probability, velocity spread and
  // reverse (arpeggiator.cpp ~197 drums / ~361 synths); the rest need the arp.
  noteProbability: 'Chance that a note sounds at all. Rolled on every note-on, arpeggiator or not.',
  spreadVelocity: 'Randomises each note’s velocity around the one played. Applies with the arpeggiator off as well as on.',
  reverseProbability: 'Chance that a note plays its sample backwards. Applies with the arpeggiator off as well as on.',
  bassProbability: 'Chance that an arp step plays the lowest held note instead of the next one in the sequence.',
  chordProbability: 'Chance that an arp step plays a chord rather than a single note.',
  glideProbability: 'Chance that an arp step glides into the next one instead of retriggering.',
  swapProbability: 'Chance that an arp step jumps to a random held note, at a random octave in range, instead of the next in the sequence.',
  spreadGate: 'Randomises how long each arp step holds, around the Gate setting.',
  spreadOctave: 'Randomises which octave each arp step lands in, within the octave range.',

  // --- Song-level ----------------------------------------------------------
  pitchAdjust: 'Master tuning offset for everything this preset plays.',
}

/**
 * The four envelope stages and the LFO rates, which read the same for each
 * numbered copy. Envelope times are table indices, not seconds — knob 20 is
 * about 1.6 s of release, 50 about 27 s (`lookupReleaseRate`,
 * `util/functions.cpp`); menu docs envelope/*.md for the ends of the range.
 */
const ENV_STAGE_HELP: Record<string, string> = {
  attack: 'How long the envelope takes to reach full. 0 is near-instant and can click; 1 is a safer floor.',
  decay: 'How long the envelope takes to fall from full to the sustain level.',
  sustain: 'The level the envelope holds at while the note is held. 0 decays away to nothing, 50 never decays.',
  release: 'How long the envelope takes to fall away after the note is let go. 0 can click; 50 is around 27 seconds.',
}

const ENV_ROLE = 'Envelope 1 is hardwired to the voice’s volume; the others do nothing until a cable takes them somewhere.'
const LFO_GLOBAL = 'Speed of this LFO. It runs once per sound, so it can reach global parameters and lock to the tempo.'
const LFO_VOICE = 'Speed of this LFO. It runs per voice, so each note gets its own, starting when that note does.'

/**
 * Help for a parameter, by the name a cable or gold knob uses for it. The
 * numbered families are matched rather than listed: `env3Decay` reads like
 * `env1Decay`, `lfo4Rate` like `lfo2Rate`.
 */
export function paramHelp(name: string | undefined): string | undefined {
  if (name === undefined) return undefined
  const direct = PARAM_HELP[name]
  if (direct !== undefined) return direct
  const env = /^env([1-4])(Attack|Decay|Sustain|Release)$/.exec(name)
  if (env) {
    const stage = ENV_STAGE_HELP[env[2].toLowerCase()]
    return env[1] === '1' ? `${stage} ${ENV_ROLE}` : stage
  }
  const lfo = /^lfo([1-4])Rate$/.exec(name)
  if (lfo) return lfo[1] === '1' || lfo[1] === '3' ? LFO_GLOBAL : LFO_VOICE
  return undefined
}

/** Help for a control that is not a patchable parameter, and for the panels. */
export const HELP: Record<string, string> = {
  // --- Panels --------------------------------------------------------------
  'panel.osc': 'The two oscillators, the noise source, and — in FM mode — the modulators that drive them.',
  'panel.voice': 'How notes take voices: how many sound at once, how they steal, and how the pitch glides between them.',
  'panel.filters': 'The low-pass and high-pass filters, and the wavefolder that sits in front of them.',
  'panel.modfx': 'One modulation effect over the whole sound: chorus, flanger, phaser, grain, warble or dimension.',
  'panel.dist': 'Bit crushing and sample-rate reduction, applied to the sound after its filters.',
  'panel.delay': 'The delay line and the send to the song’s reverb.',
  'panel.out': 'What leaves the sound: level and pan, the EQ, the sidechain ducking, the compressor, stutter and MIDI out.',
  'panel.mods': 'The four envelopes and four LFOs. Both do nothing on their own — a cable in the Matrix takes them somewhere.',
  'panel.cables': 'The modulation matrix: every patch cable in the preset, each from one source to one parameter.',
  'panel.arp': 'The arpeggiator: how held notes are spread into a sequence, and how fast it runs.',
  'panel.random': 'The device’s randomizer, beside the arpeggiator in its menu. Some of it rolls on every note; the rest needs the arp running.',
  'panel.gold': 'What the eight pages of gold encoders control on the device — two knobs a page, sixteen assignments.',

  // --- The patch generator ---------------------------------------------------
  // Not the device’s own randomizer: that is `panel.random`, the arpeggiator’s
  // note randomiser. These describe the editor’s own generator.
  'randomize.intensity': 'How far a roll strays. Mild nudges the sound; wild takes every knob to the edge of what still plays.',
  'randomize.scope': 'Which blocks a roll may touch. The rest of the preset is left exactly as it is.',
  'randomize.roll': 'Roll a new patch into the sections above. Values come from the firmware’s own menu ranges, and only the ones the selected firmware can honour.',
  'randomize.again': 'Roll the last seed again — the same patch, so a re-roll you liked less can be taken back.',
  'randomize.seed': 'The number behind a roll. Note one down to reproduce it exactly, or type one in before rolling.',
  'randomize.name': 'Name the preset after each roll, from what the roll produced. Turn it off to keep the name you have.',
  'panel.kit': 'The kit’s own filters, effects and sidechain, over the summed output of every row.',

  // --- Oscillators ---------------------------------------------------------
  // menu docs oscillator/type.md, sample/repeat.md, sample/pitch_speed.md,
  // sample/interpolation.md, sample/timestretch.md, retrigger_phase.md,
  // sync.md, modulator/transpose.md.
  'sound.mode': 'Subtractive is the usual pair of oscillators into the filters; FM makes them sine carriers driven by two modulators; ring mod multiplies the two oscillators together.',
  'osc.type': 'What this oscillator plays. Sample and Wavetable need a file loaded before they make a sound.',
  'osc.loopMode': 'What a sample does over the length of the note. Cut stops at note-off, Once plays the whole sample regardless, Loop repeats the loop region, Stretch fits the sample to the note.',
  'osc.transpose': 'Tuning offset for this oscillator, in semitones.',
  'osc.cents': 'Fine tuning for this oscillator, in cents.',
  'osc.retrigPhase': 'The phase the oscillator restarts at on a note-on or an oscillator sync. Off lets it run free, so every note starts somewhere different.',
  'osc2.oscillatorSync': 'Restarts oscillator B every time oscillator A completes a cycle, which locks its pitch to A and turns B’s tuning into a timbre control.',
  'osc.reversed': 'Plays the sample backwards.',
  'osc.timeStretchEnable': 'Linked, a sample changes length with pitch, as tape does. Independent runs the time stretcher instead, so speed and pitch move separately.',
  'osc.timeStretchAmount': 'Playback speed for the time stretcher. 0 is the sample’s own speed; below is slower, above faster.',
  'osc.linearInterpolation': 'Interpolation while time stretching. Linear is cheaper on the CPU, Sinc is cleaner.',
  'osc.dx7enginemode': 'Which of the DX7 engine’s variants renders this patch.',
  'osc.dx7randomdetune': 'Random detuning across the DX7 operators, for a thicker patch.',
  'modulator.transpose': 'Tuning of this FM modulator relative to the note, in semitones. Whole numbers keep the tone harmonic; anything else makes it bell-like.',
  'modulator.cents': 'Fine tuning of this FM modulator, in cents.',
  'modulator.retrigPhase': 'The phase this modulator restarts at on a note-on or oscillator sync.',
  'modulator2.toModulator1': 'Sends modulator 2 into modulator 1 rather than the carrier, stacking the two into a chain.',
  'osc.pickSample': 'Choose one sample for this oscillator.',
  'osc.editRanges': 'Open the key map: which sample plays where on the keyboard, and where each one’s boundaries fall.',
  'osc.fromFolder': 'Rebuild this oscillator’s ranges from a folder of samples, reading each file’s root note the way the device does.',

  // --- Voice ---------------------------------------------------------------
  // Voice::getPriorityRating, model/voice/voice.cpp:2521; the kit-wide choke
  // group is one per kit. Max Voices applies to Poly only (voice/polyphony.h).
  'sound.polyphonic': 'Poly plays several notes at once; Mono and Legato play one, Legato without retriggering; Auto is mono until you hold a second key; Choke silences every other choking row in the kit.',
  'sound.maxVoices': 'How many notes this sound may hold at once before it steals from itself. Poly only.',
  'sound.transpose': 'Tuning offset for the whole sound, in semitones.',
  'sound.voicePriority': 'Who loses a voice when the Deluge runs out. High is culled last, Low first — it outranks how old the note is.',
  'unison.num': 'How many copies of the oscillators each note plays.',
  // Sound::setupUnisonDetuners, sound.cpp:2984: the value is the whole spread
  // in cents (42949672 per cent, the centAdjustTableSmall step), 0–50
  // (kMaxUnisonDetune), centred on the played pitch; only an odd count keeps
  // its middle copy undetuned (`numUnison & 1`, line 2993).
  'unison.detune': 'How far the unison copies are spread in pitch, in cents, centred on the played pitch — at 50 the outer copies sit ±25 cents. With an odd count the middle copy stays in tune.',
  'unison.spread': 'How far the unison copies are spread across the stereo field.',

  // --- Filters -------------------------------------------------------------
  // menu docs filter/routing.md; hpfModeOptions starts at kFirstHPFMode.
  'sound.lpfMode': 'Character of the low-pass filter. The ladder modes are the classic ones, and turn the Morph knob into Drive; the SVF modes make Morph a low-pass to high-pass sweep.',
  'sound.hpfMode': 'Character of the high-pass filter. HP Ladder makes Morph an FM control; the SVF modes make it a morph back towards low-pass.',
  'sound.filterRoute': 'Which filter runs first. HPF→LPF is the default; Parallel runs both on the input and sums them.',

  // --- Modulators ----------------------------------------------------------
  // menu docs lfo/type.md; LFO 1 and 3 are global, 2 and 4 per voice.
  'lfo.type': 'Shape of the LFO. Sample & Hold jumps to a new random level each cycle, Random Walk steps on from where it already is, and Warbler glides smoothly to each new random target.',
  'lfo.syncLevel': 'Locks the LFO to the tempo at this note length. Off leaves it running at the Rate knob’s own speed.',
  'lfo.syncType': 'How the synced note length is counted: straight, triplet or dotted.',

  // --- Delay ---------------------------------------------------------------
  'delay.syncLevel': 'Locks the delay time to the tempo at this note length. Off leaves it on the Time knob alone.',
  'delay.syncType': 'How the synced delay time is counted: straight, triplet or dotted.',
  'delay.pingPong': 'Bounces the repeats between left and right instead of keeping them where the sound sits.',
  'delay.analog': 'Runs the delay as an analogue-style line: the repeats darken and distort as they decay, rather than staying clean.',

  // --- Mod FX --------------------------------------------------------------
  'sound.modFXType': 'Which modulation effect the Rate and Depth knobs drive. Offset and Feedback only apply to some of them, and Grain renames all three.',

  // --- Sidechain, compressor, stutter, MIDI --------------------------------
  // The device's VOLUME DUCKING knob is the sidechain → volumePostReverbSend
  // cable (sidechain::VolumeShortcut, gui/ui/menus.cpp:561); attack and
  // release follow the tempo once Sync is set (sidechain.cpp:94-120).
  'sidechain.ducking': 'How far this sound ducks when the song’s sidechain is hit. Stored as a patch cable from Sidechain, which is what the device’s VOLUME DUCKING knob edits.',
  'sidechain.attack': 'How fast the duck goes down when the sidechain fires.',
  'sidechain.release': 'How long the sound takes to come back up after the duck.',
  'sidechain.syncLevel': 'Ties the duck’s length to the tempo at this note length instead of to milliseconds.',
  'sidechain.syncType': 'How the synced duck length is counted: straight, triplet or dotted.',
  // menu docs compressor/*.md.
  'compressor.attack': 'How quickly the compressor clamps down once the threshold is crossed, from 1 to 64 ms.',
  'compressor.release': 'How long the compressor takes to let go again, from 50 to about 400 ms.',
  'compressor.ratio': 'How hard everything over the threshold is squashed, from 2:1 up to about 256:1.',
  'compressor.compHPF': 'High-pass on the compressor’s own detector. Raising it lets bass through without setting the compressor off.',
  'compressor.compBlend': 'Blends the compressed signal back against the dry one, 0 to 100%.',
  // StutterConfig.useSongStutter defaults true (model/fx/stutterer.h:28), so
  // these apply only to a sound whose own stutter is selected.
  'stutter.quantized': 'Snaps the stutter to 4ths, 8ths, 16ths, 32nds or 64ths of the tempo rather than the Rate knob’s free setting.',
  'stutter.reverse': 'Plays the stuttered slice backwards.',
  'stutter.pingPong': 'Alternates the stuttered slices between left and right.',
  'midiOutput.channel': 'MIDI channel this sound echoes its notes out on, alongside making its own sound. None sends nothing.',
  'midiOutput.noteForDrum': 'Note number to send instead of the one played — for a drum row, which always sounds the same note itself.',

  // --- Arpeggiator ---------------------------------------------------------
  'arp.arpMode': 'Turns the arpeggiator on. Held notes are then spread into a sequence instead of sounding together.',
  'arp.mode': 'Arpeggiator direction on this firmware: Off, Up, Down, Up & Down, or Random.',
  'arp.noteMode': 'The order the held notes are played in. As Played follows the order you pressed them; the Walk modes wander back and forth by chance.',
  'arp.octaveMode': 'How the sequence moves through the octaves once it has run through the notes.',
  'arp.syncLevel': 'Locks the arp to the tempo at this note length. Off leaves it on the Rate knob alone.',
  'arp.syncType': 'How the synced arp step is counted: straight, triplet or dotted.',
  'arp.numOctaves': 'How many octaves the sequence climbs through before it comes back.',
  'arp.mpeVelocity': 'Which MPE expression, if any, rewrites the velocity of each arp note as it plays.',
  'arp.chordType': 'Which chord shape a chord step spells out, as an index into the firmware’s chord table.',
  'arp.stepRepeat': 'How many times each step of the sequence repeats before the arp moves on.',
  'arp.randomizerLock': 'Rolls one cycle of random values and replays it, so the randomiser repeats instead of being different every pass.',

  // --- Matrix --------------------------------------------------------------
  // readPatchCablesFromFile, modulation/patch/patch_cable_set.cpp:827-833.
  'cable.source': 'What does the modulating: an envelope, an LFO, or something about the note itself.',
  'cable.destination': 'The parameter this cable moves. Only parameters the firmware can patch are offered.',
  'cable.amount': 'How far the source swings the parameter, ±50. Negative inverts the source.',
  'cable.polarity': 'Bipolar swings either side of the stored value, unipolar only upwards. Absent, the firmware reads bipolar — except from aftertouch, which reads unipolar.',
  'cable.remove': 'Remove this cable.',
  'cable.add': 'Add a cable. It lands on LPF Freq, and both ends stay editable here.',

  // --- Sample ranges -------------------------------------------------------
  // The file stores `transpose` = 60 − root (sample_holder_for_voice.cpp);
  // the last range omits its top note and catches everything above
  // (Sound::readSourceFromFile); endSamplePos 0 means "to the end"
  // (sample_holder.cpp); a loop only repeats under the Loop repeat mode.
  'range.root': 'The note this sample was recorded at. The file keeps it as the transpose that puts the sample back in tune — 60 minus this note.',
  'range.detune': 'Fine tuning for this sample, in cents, on top of its root note.',
  'range.topNote': 'The highest note this sample covers. The last range has no top note: it catches everything above the one before it.',
  'range.startSamplePos': 'Where in the file playback starts, in samples.',
  'range.endSamplePos': 'Where in the file playback stops, in samples. 0 means play to the end.',
  'range.startLoopPos': 'Start of the loop region, in samples. It only repeats under the Loop repeat mode; zero means no loop.',
  'range.endLoopPos': 'End of the loop region, in samples. It only repeats under the Loop repeat mode; zero means no loop.',

  // --- Kit rows ------------------------------------------------------------
  'row.channel': 'MIDI channel this row sends on. The row makes no sound of its own.',
  'row.note': 'MIDI note this row sends.',

  // --- Gold knobs ----------------------------------------------------------
  // ensureKnobReferencesCorrectVolume, processing/sound/sound.cpp:1317.
  'gold.slot': 'What this gold encoder does on this page. Click to change it.',
  'gold.param': 'The parameter this encoder controls.',
  'gold.source': 'Set a source and the encoder moves that source’s cable strength rather than the parameter itself.',
  'gold.secondSource': 'A second source modulating the depth of the cable this encoder controls.',

  // --- Follow Mode ---------------------------------------------------------
  // io/midi/midi_follow.cpp; the feedback channel is Settings › MIDI › Midi-Follow › Feedback › Channel,
  // which names one of the slots under Midi-Follow › Channel (l10n/english.json STRING_FOR_FOLLOW_*).
  'follow.channel': 'The channel to listen on. Any takes every channel, which is right unless another device sends CCs on the same port. The Deluge’s feedback channel is Settings › MIDI › Midi-Follow › Feedback › Channel.',
  'follow.target': 'Which half of a kit clip the CCs reach, mirroring AFFECT ENTIRE on the instrument: the kit bus, or the selected row’s own sound.',
  // MidiTakeover::calculateKnobPos; midiTakeover defaults to Jump. The menu is MIDI › Takeover (menus.cpp midiTakeoverMenu).
  'follow.send': 'Play moves made here back at the Deluge, into the sound it has live. Values land exactly only with Settings › MIDI › Takeover on Jump, its default.',
  'follow.sendChannel': 'The channel to send on. Heard is the channel the Deluge’s own feedback arrived on, which is right whether its follow channel is a number or an MPE zone.',
}

/** Help for a panel header, by group id. */
export const panelHelp = (id: string): string | undefined => HELP[`panel.${id}`]
