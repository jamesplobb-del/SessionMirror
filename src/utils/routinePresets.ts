import { getInstrumentProfile } from './instrumentProfiles'
import {
  blankDesk,
  createRoutine,
  createStep,
  type Routine,
  type RoutineStep,
  type RoutineStepKind,
  type RoutineTopic,
} from './practiceRoutines'
import type { DeskSnapshot } from './workspaceDesks'
import type { LabsRoute } from '../components/labs/LabsOverlay'

/**
 * Step templates and starter routines, grouped the way players actually think
 * about a session: warm up, tone, flexibility or scales, technique, then music.
 *
 * Titles are deliberately broad — "Long tones", not a book. A book is offered
 * only after a step is chosen, as one of several common choices, and nothing
 * about the step depends on which book (if any) the player uses.
 */

export type PresetFamily = 'brass' | 'woodwind' | 'strings' | 'voice' | 'keys' | 'general'

export function presetFamilyFor(instrumentId: string | null): PresetFamily {
  if (!instrumentId) return 'general'
  if (instrumentId === 'voice') return 'voice'
  if (instrumentId === 'piano') return 'keys'
  if (instrumentId === 'other') return 'general'
  const profile = getInstrumentProfile(instrumentId)
  switch (profile?.family) {
    case 'Brass':
      return 'brass'
    case 'Woodwind':
      return 'woodwind'
    case 'Strings':
      return 'strings'
    default:
      return 'general'
  }
}

/** Concert pitch class the instrument most often tunes or plays long tones on. */
export function homePitchClass(instrumentId: string | null): number | null {
  switch (instrumentId) {
    case 'french-horn':
      return 5 // F
    case 'guitar':
    case 'bass-guitar':
      return 4 // E
    case 'piano':
      return null
    default: {
      const family = presetFamilyFor(instrumentId)
      if (family === 'brass' || family === 'woodwind') return 10 // B♭
      if (family === 'strings' || family === 'voice') return 9 // A
      return 9
    }
  }
}

function homeOctave(instrumentId: string | null): number {
  switch (instrumentId) {
    case 'tuba':
    case 'double-bass':
    case 'bass-guitar':
    case 'bari-sax':
    case 'bass-clarinet':
      return 2
    case 'trombone':
    case 'euphonium':
    case 'cello':
    case 'bassoon':
    case 'tenor-sax':
    case 'guitar':
    // Concert B♭3 is written middle C on a B♭ instrument.
    case 'trumpet':
    case 'clarinet':
      return 3
    case 'flute':
    case 'piccolo':
    case 'violin':
      return 5
    default:
      return 4
  }
}

interface DeskOptions {
  mode?: DeskSnapshot['mode']
  bpm?: number
  meter?: DeskSnapshot['metronome']['meter']
  drone?: boolean
  pitch?: boolean
  handsFree?: boolean
}

/** Build a desk for an instrument from a few switches. */
export function deskFor(instrumentId: string | null, options: DeskOptions): DeskSnapshot {
  const desk = blankDesk(options.mode ?? 'audio')
  if (options.bpm) {
    desk.showMetronome = true
    desk.metronome = { bpm: options.bpm, meter: options.meter ?? '4/4', subdivision: 'off' }
  }
  if (options.drone) {
    desk.showDrone = true
    desk.drone = { pitchClass: homePitchClass(instrumentId), octave: homeOctave(instrumentId) }
  }
  if (options.pitch) desk.pitchTrackerEnabled = true
  if (options.handsFree) desk.autoSoundRecording = true
  return desk
}

export interface StepTemplate {
  id: string
  title: string
  topic: RoutineTopic
  kind: RoutineStepKind
  minutes: number
  /** Short line under the title in the picker. */
  hint: string
  desk: (instrumentId: string | null) => DeskSnapshot | null
  gameRoute?: LabsRoute
}

const common = {
  piece: (minutes: number): StepTemplate => ({
    id: 'piece',
    title: 'One phrase of the piece',
    topic: 'piece',
    kind: 'focus',
    minutes,
    hint: 'Reference loads, hands-free records each attempt.',
    desk: (id) => deskFor(id, { mode: 'audio', handsFree: true, pitch: true }),
  }),
  etude: (minutes: number): StepTemplate => ({
    id: 'etude',
    title: 'Etude',
    topic: 'etude',
    kind: 'record',
    minutes,
    hint: 'Audio, hands-free, so you can hear it back.',
    desk: (id) => deskFor(id, { mode: 'audio', handsFree: true }),
  }),
  sightReading: (): StepTemplate => ({
    id: 'sight-reading',
    title: 'Sight-reading',
    topic: 'sight-reading',
    kind: 'game',
    minutes: 3,
    hint: 'Staff Jumper — pitch, and rhythm when the click is on.',
    desk: () => null,
    gameRoute: 'staff-jumper',
  }),
  balance: (): StepTemplate => ({
    id: 'balance',
    title: 'Hold the centre',
    topic: 'long-tones',
    kind: 'game',
    minutes: 3,
    hint: 'Balance — how long can you hold a note dead centre?',
    desk: () => null,
    gameRoute: 'balance',
  }),
  cooldown: (): StepTemplate => ({
    id: 'cooldown',
    title: 'Cool-down',
    topic: 'cooldown',
    kind: 'tune',
    minutes: 2,
    hint: 'Soft and low against the drone.',
    desk: (id) => deskFor(id, { drone: true }),
  }),
  free: (): StepTemplate => ({
    id: 'free',
    title: 'Anything else',
    topic: 'other',
    kind: 'free',
    minutes: 5,
    hint: 'A line on the list with nothing to open.',
    desk: () => null,
  }),
}

const TEMPLATES: Record<PresetFamily, StepTemplate[]> = {
  brass: [
    {
      id: 'buzzing',
      title: 'Buzzing & breathing',
      topic: 'warmup',
      kind: 'metro',
      minutes: 3,
      hint: 'Slow click for breath counts and sirens.',
      desk: (id) => deskFor(id, { bpm: 60 }),
    },
    {
      id: 'long-tones',
      title: 'Long tones',
      topic: 'long-tones',
      kind: 'tune',
      minutes: 5,
      hint: 'Tuner open, drone on your home note.',
      desk: (id) => deskFor(id, { drone: true, pitch: true }),
    },
    {
      id: 'flow',
      title: 'Flow studies',
      topic: 'long-tones',
      kind: 'tune',
      minutes: 5,
      hint: 'Tuner with a gentle click behind it.',
      desk: (id) => deskFor(id, { drone: false, bpm: 72, pitch: true }),
    },
    {
      id: 'slurs',
      title: 'Lip slurs',
      topic: 'flexibility',
      kind: 'metro',
      minutes: 4,
      hint: 'Easy range, soft, in time.',
      desk: (id) => deskFor(id, { bpm: 72 }),
    },
    {
      id: 'scales',
      title: 'Scales & arpeggios',
      topic: 'scales',
      kind: 'metro',
      minutes: 5,
      hint: 'One key a day beats all of them badly.',
      desk: (id) => deskFor(id, { bpm: 80 }),
    },
    {
      id: 'technique',
      title: 'Technique',
      topic: 'technique',
      kind: 'record',
      minutes: 5,
      hint: 'Click on, hands-free, so evenness is audible.',
      desk: (id) => deskFor(id, { bpm: 84, handsFree: true }),
    },
    {
      id: 'articulation',
      title: 'Articulation',
      topic: 'articulation',
      kind: 'metro',
      minutes: 4,
      hint: 'Single, then multiple tonguing at a steady click.',
      desk: (id) => deskFor(id, { bpm: 88 }),
    },
    common.etude(6),
    common.piece(6),
    common.sightReading(),
    common.balance(),
    common.cooldown(),
    common.free(),
  ],
  woodwind: [
    {
      id: 'breathing',
      title: 'Breathing & harmonics',
      topic: 'warmup',
      kind: 'tune',
      minutes: 3,
      hint: 'Tuner open. Overtones or slow register slurs.',
      desk: (id) => deskFor(id, { pitch: true }),
    },
    {
      id: 'long-tones',
      title: 'Long tones',
      topic: 'long-tones',
      kind: 'tune',
      minutes: 5,
      hint: 'Drone on your home note, tuner watching.',
      desk: (id) => deskFor(id, { drone: true, pitch: true }),
    },
    {
      id: 'scales',
      title: 'Scales & arpeggios',
      topic: 'scales',
      kind: 'metro',
      minutes: 6,
      hint: 'Full range, click on.',
      desk: (id) => deskFor(id, { bpm: 76 }),
    },
    {
      id: 'technique',
      title: 'Technique',
      topic: 'technique',
      kind: 'record',
      minutes: 5,
      hint: 'Finger patterns, recorded hands-free.',
      desk: (id) => deskFor(id, { bpm: 80, handsFree: true }),
    },
    {
      id: 'articulation',
      title: 'Articulation',
      topic: 'articulation',
      kind: 'metro',
      minutes: 4,
      hint: 'Staccato and legato patterns at one tempo.',
      desk: (id) => deskFor(id, { bpm: 84 }),
    },
    common.etude(6),
    common.piece(6),
    common.sightReading(),
    common.balance(),
    common.cooldown(),
    common.free(),
  ],
  strings: [
    {
      id: 'bow-warmup',
      title: 'Open strings & slow bows',
      topic: 'warmup',
      kind: 'tune',
      minutes: 3,
      hint: 'Drone on A, tuner open. Sound before notes.',
      desk: (id) => deskFor(id, { drone: true, pitch: true }),
    },
    {
      id: 'scales',
      title: 'Scales & arpeggios',
      topic: 'scales',
      kind: 'metro',
      minutes: 6,
      hint: 'Three octaves if you have them, click on.',
      desk: (id) => deskFor(id, { bpm: 60 }),
    },
    {
      id: 'intonation',
      title: 'Intonation drill',
      topic: 'technique',
      kind: 'tune',
      minutes: 4,
      hint: 'Double stops or a slow passage against the drone.',
      desk: (id) => deskFor(id, { drone: true, pitch: true }),
    },
    {
      id: 'shifting',
      title: 'Shifting & left hand',
      topic: 'technique',
      kind: 'record',
      minutes: 5,
      hint: 'Click on, hands-free, listen back for clean arrivals.',
      desk: (id) => deskFor(id, { bpm: 66, handsFree: true }),
    },
    {
      id: 'bowing',
      title: 'Bow strokes',
      topic: 'articulation',
      kind: 'metro',
      minutes: 4,
      hint: 'Spiccato, martelé, string crossings at a click.',
      desk: (id) => deskFor(id, { bpm: 72 }),
    },
    common.etude(6),
    {
      ...common.piece(6),
      desk: (id) => deskFor(id, { mode: 'video', handsFree: true }),
      hint: 'Reference loads, camera on for bow arm and posture.',
    },
    common.sightReading(),
    common.cooldown(),
    common.free(),
  ],
  voice: [
    {
      id: 'body',
      title: 'Body & breath',
      topic: 'warmup',
      kind: 'metro',
      minutes: 3,
      hint: 'Slow click for hiss counts and stretches.',
      desk: (id) => deskFor(id, { bpm: 60 }),
    },
    {
      id: 'sirens',
      title: 'Lip trills & sirens',
      topic: 'warmup',
      kind: 'tune',
      minutes: 3,
      hint: 'Tuner open to watch the glide.',
      desk: (id) => deskFor(id, { pitch: true }),
    },
    {
      id: 'sustained',
      title: 'Sustained vowels',
      topic: 'long-tones',
      kind: 'tune',
      minutes: 4,
      hint: 'Drone under a single vowel, tuner watching.',
      desk: (id) => deskFor(id, { drone: true, pitch: true }),
    },
    {
      id: 'vocalises',
      title: 'Vocalises',
      topic: 'scales',
      kind: 'metro',
      minutes: 5,
      hint: 'Five-note patterns up and down at a click.',
      desk: (id) => deskFor(id, { bpm: 72 }),
    },
    {
      id: 'agility',
      title: 'Agility & diction',
      topic: 'articulation',
      kind: 'record',
      minutes: 4,
      hint: 'Recorded hands-free so consonants can be checked.',
      desk: (id) => deskFor(id, { bpm: 84, handsFree: true }),
    },
    {
      ...common.piece(7),
      title: 'One phrase of the song',
      desk: (id) => deskFor(id, { mode: 'video', handsFree: true }),
      hint: 'Reference loads, camera on for posture and face.',
    },
    common.sightReading(),
    common.cooldown(),
    common.free(),
  ],
  keys: [
    {
      id: 'warmup',
      title: 'Warm-up patterns',
      topic: 'warmup',
      kind: 'metro',
      minutes: 4,
      hint: 'Five-finger patterns, slow click.',
      desk: (id) => deskFor(id, { bpm: 60 }),
    },
    {
      id: 'scales',
      title: 'Scales & arpeggios',
      topic: 'scales',
      kind: 'metro',
      minutes: 6,
      hint: 'Hands together, four octaves, click on.',
      desk: (id) => deskFor(id, { bpm: 72 }),
    },
    {
      id: 'technique',
      title: 'Technique',
      topic: 'technique',
      kind: 'record',
      minutes: 6,
      hint: 'Recorded hands-free; listen for evenness.',
      desk: (id) => deskFor(id, { bpm: 80, handsFree: true }),
    },
    common.etude(6),
    {
      ...common.piece(8),
      desk: (id) => deskFor(id, { mode: 'video', handsFree: true }),
      hint: 'Reference loads, camera on for the hands.',
    },
    {
      id: 'sight-reading',
      title: 'Sight-reading',
      topic: 'sight-reading',
      kind: 'metro',
      minutes: 4,
      hint: 'Something new, slow, click on, no stopping.',
      desk: (id) => deskFor(id, { bpm: 56 }),
    },
    common.free(),
  ],
  general: [
    {
      id: 'warmup',
      title: 'Warm-up',
      topic: 'warmup',
      kind: 'metro',
      minutes: 4,
      hint: 'Slow click, easy range.',
      desk: (id) => deskFor(id, { bpm: 60 }),
    },
    {
      id: 'long-tones',
      title: 'Long tones',
      topic: 'long-tones',
      kind: 'tune',
      minutes: 5,
      hint: 'Tuner open, drone on.',
      desk: (id) => deskFor(id, { drone: true, pitch: true }),
    },
    {
      id: 'scales',
      title: 'Scales',
      topic: 'scales',
      kind: 'metro',
      minutes: 5,
      hint: 'Click on.',
      desk: (id) => deskFor(id, { bpm: 76 }),
    },
    {
      id: 'technique',
      title: 'Technique',
      topic: 'technique',
      kind: 'record',
      minutes: 5,
      hint: 'Recorded hands-free.',
      desk: (id) => deskFor(id, { bpm: 80, handsFree: true }),
    },
    common.etude(6),
    common.piece(6),
    common.sightReading(),
    common.balance(),
    common.free(),
  ],
}

const tuned = (id: string, title: string, topic: RoutineTopic, hint: string, drone = false): StepTemplate => ({
  id, title, topic, kind: 'tune', minutes: 4, hint,
  desk: instrumentId => deskFor(instrumentId, { drone, pitch: true }),
})
const clicked = (id: string, title: string, topic: RoutineTopic, hint: string, bpm = 72): StepTemplate => ({
  id, title, topic, kind: 'metro', minutes: 4, hint,
  desk: instrumentId => deskFor(instrumentId, { bpm }),
})
const heard = (id: string, title: string, topic: RoutineTopic, hint: string, bpm?: number): StepTemplate => ({
  id, title, topic, kind: 'record', minutes: 5, hint,
  desk: instrumentId => deskFor(instrumentId, { mode: 'audio', bpm, handsFree: true }),
})
const seen = (id: string, title: string, topic: RoutineTopic, hint: string): StepTemplate => ({
  id, title, topic, kind: 'record', minutes: 5, hint,
  desk: instrumentId => deskFor(instrumentId, { mode: 'video', handsFree: true }),
})

/**
 * The first cards are instrument-specific. The family list still supplies
 * universal work such as repertoire, etudes, and sight-reading below them.
 * Sources for these distinctions are recorded in FOCUSED_PRACTICE.md.
 */
const SPECIALTIES: Record<string, StepTemplate[]> = {
  trumpet: [
    clicked('buzzing', 'Breathing & mouthpiece', 'warmup', 'Breath patterns, easy buzzes, then transfer the sound to the horn.', 60),
    tuned('long-tones', 'Long tones', 'long-tones', 'Begin in the middle register; keep air and sound steady.', true),
    clicked('slurs', 'Lip slurs', 'flexibility', 'Easy harmonic patterns with uninterrupted air.', 68),
    clicked('technique', 'Valve coordination', 'technique', 'Clarke-style finger patterns, clean and even.', 80),
    clicked('articulation', 'Single & multiple tonguing', 'articulation', 'Match every attack without closing the air.', 84),
  ],
  'french-horn': [
    heard('buzzing', 'Breathing & mouthpiece', 'warmup', 'Hear the pitch first, then place clean, centered entrances.'),
    tuned('long-tones', 'Long tones & entrances', 'long-tones', 'Note, rest, note: center each entrance against a drone.', true),
    clicked('slurs', 'Lip slurs & trills', 'flexibility', 'Connect overtones cleanly with energized air.', 64),
    tuned('stopped-horn', 'Stopped horn', 'technique', 'Check pitch, resistance, and a steady stopped sound.', true),
    clicked('transposition', 'Transposition', 'sight-reading', 'Short lines in a different horn key each day.', 60),
  ],
  trombone: [
    clicked('buzzing', 'Breathing & mouthpiece', 'warmup', 'Free air, easy buzz, then connect it to the slide.', 60),
    tuned('long-tones', 'Remington long tones', 'long-tones', 'Sustain a centered sound through every register.', true),
    clicked('slurs', 'Lip slurs', 'flexibility', 'Move through the harmonic series without excess motion.', 66),
    clicked('technique', 'Slide coordination', 'technique', 'Move early and match tongue, air, and slide.', 72),
    heard('legato', 'Legato tonguing', 'articulation', 'Record smooth connections without glissandi.', 68),
  ],
  euphonium: [
    clicked('buzzing', 'Breathing & mouthpiece', 'warmup', 'Full relaxed breaths and an easy, resonant buzz.', 60),
    tuned('long-tones', 'Long tones', 'long-tones', 'Match a drone through the middle and low register.', true),
    clicked('slurs', 'Lip slurs', 'flexibility', 'Even harmonic patterns with relaxed airflow.', 66),
    heard('lyrical', 'Lyrical studies', 'etude', 'Record a Bordogni-style phrase and listen for line.'),
    clicked('articulation', 'Articulation', 'articulation', 'Keep single and multiple tonguing resonant.', 80),
  ],
  tuba: [
    clicked('buzzing', 'Breathing & mouthpiece', 'warmup', 'Large relaxed breaths, buzzes, and easy first notes.', 56),
    tuned('long-tones', 'Low-register long tones', 'long-tones', 'Start notes cleanly and sustain a resonant core.', true),
    clicked('slurs', 'Lip slurs', 'flexibility', 'Slow harmonic patterns without forcing.', 60),
    clicked('technique', 'Valve & scale patterns', 'technique', 'Coordinate air and valves across the full range.', 68),
    clicked('articulation', 'Low-register articulation', 'articulation', 'Make each low attack speak without heaviness.', 68),
  ],
  flute: [
    tuned('breathing', 'Headjoint & tone', 'warmup', 'Find the center of the air stream before adding fingers.'),
    tuned('long-tones', 'Long tones', 'long-tones', 'Shape dynamics and color without losing the core.', true),
    tuned('harmonics', 'Harmonics', 'flexibility', 'Overblow low notes and keep the embouchure free.'),
    clicked('technique', 'Finger patterns', 'technique', 'Even fingers through awkward combinations.', 76),
    clicked('articulation', 'Single & multiple tonguing', 'articulation', 'Vary slurs and tongue patterns while the pulse stays steady.', 80),
  ],
  piccolo: [
    tuned('breathing', 'Tone preparation', 'warmup', 'Begin in a comfortable register with a small, supported air stream.'),
    tuned('long-tones', 'Soft dynamics & intonation', 'long-tones', 'Hold pitch through soft entrances and releases.', true),
    tuned('register', 'Upper-register control', 'flexibility', 'Connect octaves cleanly without pinching.'),
    clicked('technique', 'Finger patterns', 'technique', 'Light fingers and compact motion.', 72),
    clicked('articulation', 'Light articulation', 'articulation', 'Short attacks that keep the sound alive.', 80),
  ],
  clarinet: [
    tuned('breathing', 'Mouthpiece & barrel tone', 'warmup', 'Set air and voicing before assembling the full instrument.'),
    tuned('long-tones', 'Long tones & voicing', 'long-tones', 'Keep a resonant core in chalumeau and clarion.', true),
    tuned('register-slurs', 'Register slurs', 'flexibility', 'Match twelfths without biting or changing the air.'),
    clicked('technique', 'Crossing the break', 'technique', 'Coordinate thumb, index finger, and right hand inside a slur.', 66),
    clicked('articulation', 'Tongue & fingers', 'articulation', 'Keep the reed response and fingers together.', 76),
  ],
  'bass-clarinet': [
    tuned('breathing', 'Low-register response', 'warmup', 'Start low notes with focused air and relaxed voicing.'),
    tuned('long-tones', 'Low-register long tones', 'long-tones', 'Build the low-note concept against a drone.', true),
    tuned('register-slurs', 'Register slurs & voicing', 'flexibility', 'Connect registers without an undertone.'),
    clicked('technique', 'Breaks & little-finger patterns', 'technique', 'Practice register changes and alternate little fingers.', 66),
    clicked('articulation', 'Articulation through registers', 'articulation', 'Match response from low to clarion.', 72),
  ],
  'soprano-sax': [
    tuned('breathing', 'Mouthpiece pitch & voicing', 'warmup', 'Stabilize the embouchure and hear the pitch center.'),
    tuned('long-tones', 'Long tones & intonation', 'long-tones', 'Balance pitch and tone across the horn.', true),
    tuned('overtones', 'Overtones', 'flexibility', 'Match overtones to fingered notes without biting.'),
    clicked('technique', 'Palm-key coordination', 'technique', 'Keep upper-register fingers close and even.', 72),
    heard('articulation', 'Articulation & vibrato', 'articulation', 'Record attacks, releases, and an even vibrato.', 76),
  ],
  'alto-sax': [
    tuned('breathing', 'Mouthpiece pitch & voicing', 'warmup', 'Set a consistent embouchure and air stream.'),
    tuned('long-tones', 'Long tones & dynamics', 'long-tones', 'Crescendo and diminuendo without moving the pitch.', true),
    tuned('overtones', 'Overtones & voicing', 'flexibility', 'Match overtone tone quality to fingered notes.'),
    clicked('technique', 'Finger technique', 'technique', 'Even side-key and palm-key connections.', 76),
    heard('articulation', 'Articulation & time', 'articulation', 'Record accents, legato tongue, and clean releases.', 80),
  ],
  'tenor-sax': [
    tuned('breathing', 'Mouthpiece pitch & voicing', 'warmup', 'Start with supported air and a free, resonant setup.'),
    tuned('long-tones', 'Full-range long tones', 'long-tones', 'Connect the low register to palm keys evenly.', true),
    tuned('overtones', 'Overtones & voicing', 'flexibility', 'Build register control from low fundamentals.'),
    clicked('technique', 'Finger technique', 'technique', 'Coordinate octave-key and side-key patterns.', 74),
    heard('articulation', 'Articulation & subtone', 'articulation', 'Compare attack, release, and low-register color.', 76),
  ],
  'bari-sax': [
    tuned('breathing', 'Low-note response', 'warmup', 'Move enough air for a clean, immediate low register.'),
    tuned('long-tones', 'Low-register long tones', 'long-tones', 'Keep low notes resonant and in tune.', true),
    tuned('overtones', 'Overtones & voicing', 'flexibility', 'Use low fundamentals to stabilize the upper register.'),
    clicked('technique', 'Low-key coordination', 'technique', 'Keep the large keywork light and synchronized.', 68),
    heard('articulation', 'Articulation & groove', 'articulation', 'Record attacks against the beat and check placement.', 76),
  ],
  oboe: [
    tuned('breathing', 'Reed response & air', 'warmup', 'Check the reed, then connect air, embouchure, and first attack.'),
    tuned('long-tones', 'Long tones & dynamics', 'long-tones', 'Shape a full dynamic arc while keeping pitch stable.', true),
    heard('response', 'Attack & release', 'articulation', 'Record clean starts and resonant releases.'),
    clicked('technique', 'Finger coordination', 'technique', 'Work forked, side, and half-hole connections slowly.', 68),
    clicked('scales', 'Scales in patterns', 'scales', 'Stepwise, thirds, and fourths across the range.', 72),
  ],
  bassoon: [
    tuned('breathing', 'Reed response & long tones', 'warmup', 'Connect air, embouchure, and a stable first sound.', true),
    tuned('tenor-register', 'Tenor-register stability', 'long-tones', 'Tune and stabilize the tenor register against a drone.', true),
    clicked('flicking', 'Flicking & venting', 'technique', 'Coordinate speaker keys on clean register entrances.', 60),
    clicked('technique', 'Finger patterns & half-hole', 'technique', 'Slow patterns for half-hole and thumb coordination.', 66),
    heard('articulation', 'Articulation', 'articulation', 'Record single and double tongue for consistent response.', 72),
  ],
  violin: [
    seen('bow-warmup', 'Open strings & whole bows', 'warmup', 'Use camera to check a straight path and relaxed setup.'),
    tuned('intonation', 'Scales & intonation', 'scales', 'Hear ringing intervals and tune against a drone.', true),
    heard('shifting', 'Shifting & left hand', 'technique', 'Listen for relaxed, accurate arrivals.', 60),
    seen('bowing', 'Bow strokes & crossings', 'articulation', 'Check contact point, level changes, and bow distribution.'),
    tuned('double-stops', 'Double stops', 'technique', 'Tune intervals slowly from the lower voice upward.', true),
  ],
  viola: [
    seen('bow-warmup', 'Open strings & whole bows', 'warmup', 'Use camera to check weight, contact point, and a free shoulder.'),
    tuned('intonation', 'Scales & intonation', 'scales', 'Build a ringing C-string-to-A-string frame.', true),
    heard('shifting', 'Shifting & left hand', 'technique', 'Record position changes and listen for clean arrivals.', 58),
    seen('bowing', 'Bow strokes & string crossings', 'articulation', 'Check bow levels and sustained weight.'),
    tuned('double-stops', 'Double stops', 'technique', 'Tune intervals without squeezing the left hand.', true),
  ],
  cello: [
    seen('bow-warmup', 'Open strings & bow path', 'warmup', 'Check contact point, weight, and level changes.'),
    tuned('intonation', 'Scales & intonation', 'scales', 'Tune extensions and positions against a drone.', true),
    heard('shifting', 'Shifting & extensions', 'technique', 'Listen for smooth motion and accurate arrival notes.', 58),
    seen('bowing', 'Bow distribution & crossings', 'articulation', 'Match bow speed to the phrase and string level.'),
    tuned('thumb-position', 'Thumb position', 'technique', 'Establish a balanced hand frame and reliable pitch.', true),
  ],
  'double-bass': [
    seen('bow-warmup', 'Open strings & bow weight', 'warmup', 'Check contact point and a relaxed right arm.'),
    tuned('intonation', 'Positions & intonation', 'scales', 'Map positions slowly against a drone.', true),
    heard('shifting', 'Shifting', 'technique', 'Record position changes and listen for secure arrivals.', 54),
    clicked('bowing', 'Bow strokes & crossings', 'articulation', 'Coordinate large string crossings with the pulse.', 60),
    heard('pizzicato', 'Pizzicato time', 'rhythm', 'Record note length and placement against the beat.', 72),
  ],
  guitar: [
    seen('warmup', 'Posture & hand position', 'warmup', 'Use camera to check wrist, thumb, and instrument position.'),
    clicked('scales', 'Scales & position shifts', 'scales', 'Alternate cleanly and connect positions in time.', 72),
    clicked('right-hand', 'Right-hand arpeggios', 'technique', 'Giuliani-style patterns with even tone.', 66),
    heard('slurs', 'Slurs & left hand', 'technique', 'Record hammer-ons, pull-offs, and clean releases.', 60),
    clicked('chords', 'Chord changes & rhythm', 'rhythm', 'Change early and keep the pulse continuous.', 76),
  ],
  'bass-guitar': [
    seen('warmup', 'Posture & muting', 'warmup', 'Check fretting pressure and both-hand muting.'),
    clicked('scales', 'Scales & arpeggios', 'scales', 'Connect shapes to chord tones across the neck.', 72),
    heard('groove', 'Groove & note length', 'rhythm', 'Record with the click and judge placement and space.', 80),
    seen('technique', 'Fingerstyle, pick or slap', 'technique', 'Check motion, string crossing, and consistency.'),
    heard('transcription', 'Transcription & vocabulary', 'ear', 'Learn a short line by ear, then record it with the reference.'),
  ],
  ukulele: [
    seen('warmup', 'Posture & fretting', 'warmup', 'Check thumb, wrist, and light fretting pressure.'),
    clicked('chords', 'Chord changes', 'technique', 'Move between shapes without losing the beat.', 72),
    clicked('strumming', 'Strumming patterns', 'rhythm', 'Keep down-up motion and accents steady.', 80),
    heard('fingerpicking', 'Fingerpicking', 'technique', 'Record even tone and independent fingers.', 68),
    clicked('scales', 'Scales & fretboard', 'scales', 'Learn one key and its chord tones.', 70),
  ],
  voice: [
    seen('body', 'Body & breath', 'warmup', 'Use camera to check easy alignment and unforced breathing.'),
    tuned('sirens', 'SOVT, lip trills & sirens', 'warmup', 'Glide easily through the range without pushing.'),
    tuned('sustained', 'Sustained vowels & resonance', 'long-tones', 'Keep pitch and vowel stable on an easy note.', true),
    heard('registers', 'Register blend', 'flexibility', 'Record smooth transitions through the passaggio.'),
    heard('agility', 'Agility & diction', 'articulation', 'Check consonant clarity without interrupting the phrase.', 72),
  ],
  piano: [
    seen('warmup', 'Five-finger patterns & alignment', 'warmup', 'Use camera to check relaxed wrists and economical motion.'),
    clicked('scales', 'Scales', 'scales', 'Even tone, reliable fingering, and a steady pulse.', 72),
    clicked('arpeggios', 'Arpeggios', 'scales', 'Connect thumb crossings without accents.', 66),
    heard('chords', 'Chords, cadences & voicing', 'technique', 'Record balance and harmonic direction.', 60),
    heard('independence', 'Hand independence', 'technique', 'Listen for separate layers and even coordination.', 60),
  ],
}

const FRETTED_IDS = new Set(['guitar', 'bass-guitar', 'ukulele'])

export function getStepTemplates(instrumentId: string | null): StepTemplate[] {
  const family = presetFamilyFor(instrumentId)
  let base = TEMPLATES[family]
  if (instrumentId && FRETTED_IDS.has(instrumentId)) {
    base = base.filter(template => !['bow-warmup', 'intonation', 'shifting', 'bowing', 'cooldown'].includes(template.id))
  }
  const specific = instrumentId ? SPECIALTIES[instrumentId] ?? [] : []
  return [...specific, ...base.filter(template => !specific.some(item => item.id === template.id))]
}

export function stepFromTemplate(template: StepTemplate, instrumentId: string | null): RoutineStep {
  return createStep({
    title: template.title,
    minutes: template.minutes,
    kind: template.kind,
    topic: template.topic,
    desk: template.desk(instrumentId),
    gameRoute: template.gameRoute ?? null,
  })
}

/* ---- Starter routines ---------------------------------------------------- */

export interface RoutinePreset {
  id: 'quick' | 'standard'
  name: string
  blurb: string
  templateIds: string[]
}

const PRESETS: Record<PresetFamily, RoutinePreset[]> = {
  brass: [
    {
      id: 'quick',
      name: 'Quick',
      blurb: 'Buzz, tone, slurs, one phrase.',
      templateIds: ['buzzing', 'long-tones', 'slurs', 'piece'],
    },
    {
      id: 'standard',
      name: 'Full',
      blurb: 'The classic order: tone, flexibility, technique, music.',
      templateIds: ['buzzing', 'long-tones', 'slurs', 'technique', 'articulation', 'etude', 'piece'],
    },
  ],
  woodwind: [
    {
      id: 'quick',
      name: 'Quick',
      blurb: 'Tone, scales, one phrase.',
      templateIds: ['long-tones', 'scales', 'piece'],
    },
    {
      id: 'standard',
      name: 'Full',
      blurb: 'Breath and tone first, then fingers, then music.',
      templateIds: ['breathing', 'long-tones', 'scales', 'technique', 'articulation', 'etude', 'piece'],
    },
  ],
  strings: [
    {
      id: 'quick',
      name: 'Quick',
      blurb: 'Bows, scales, one phrase.',
      templateIds: ['bow-warmup', 'scales', 'piece'],
    },
    {
      id: 'standard',
      name: 'Full',
      blurb: 'Sound, scales, intonation, technique, music.',
      templateIds: ['bow-warmup', 'scales', 'intonation', 'shifting', 'etude', 'piece'],
    },
  ],
  voice: [
    {
      id: 'quick',
      name: 'Quick',
      blurb: 'Breath, sirens, one phrase.',
      templateIds: ['body', 'sirens', 'sustained', 'piece'],
    },
    {
      id: 'standard',
      name: 'Full',
      blurb: 'Body, glide, sustain, vocalises, text.',
      templateIds: ['body', 'sirens', 'sustained', 'vocalises', 'agility', 'piece'],
    },
  ],
  keys: [
    {
      id: 'quick',
      name: 'Quick',
      blurb: 'Warm up, scales, one phrase.',
      templateIds: ['warmup', 'scales', 'piece'],
    },
    {
      id: 'standard',
      name: 'Full',
      blurb: 'Warm-up, scales, technique, etude, piece.',
      templateIds: ['warmup', 'scales', 'technique', 'etude', 'piece'],
    },
  ],
  general: [
    {
      id: 'quick',
      name: 'Quick',
      blurb: 'Warm up, tone, one phrase.',
      templateIds: ['warmup', 'long-tones', 'piece'],
    },
    {
      id: 'standard',
      name: 'Full',
      blurb: 'Warm-up, tone, scales, technique, music.',
      templateIds: ['warmup', 'long-tones', 'scales', 'technique', 'etude', 'piece'],
    },
  ],
}

const tailoredPresets = (
  quick: string[], full: string[], quickBlurb: string, fullBlurb: string,
): RoutinePreset[] => [
  { id: 'quick', name: 'Quick essentials', blurb: quickBlurb, templateIds: quick },
  { id: 'standard', name: 'Complete session', blurb: fullBlurb, templateIds: full },
]

const INSTRUMENT_PRESETS: Record<string, RoutinePreset[]> = {
  trumpet: tailoredPresets(['buzzing', 'long-tones', 'slurs', 'piece'], ['buzzing', 'long-tones', 'slurs', 'technique', 'articulation', 'etude', 'piece'], 'Air, centered sound, flexibility, music.', 'Sound, valves, tongue, study, and repertoire.'),
  'french-horn': tailoredPresets(['buzzing', 'long-tones', 'slurs', 'piece'], ['buzzing', 'long-tones', 'slurs', 'stopped-horn', 'transposition', 'etude', 'piece'], 'Entrances, tone, slurs, music.', 'Accuracy, flexibility, stopped horn, and transposition.'),
  trombone: tailoredPresets(['buzzing', 'long-tones', 'legato', 'piece'], ['buzzing', 'long-tones', 'slurs', 'technique', 'legato', 'etude', 'piece'], 'Air, sound, legato, music.', 'Sound, flexibility, slide, legato, and repertoire.'),
  euphonium: tailoredPresets(['buzzing', 'long-tones', 'lyrical', 'piece'], ['buzzing', 'long-tones', 'slurs', 'articulation', 'lyrical', 'etude', 'piece'], 'Air, resonant tone, lyrical line.', 'Tone, flexibility, tongue, and lyrical repertoire.'),
  tuba: tailoredPresets(['buzzing', 'long-tones', 'slurs', 'piece'], ['buzzing', 'long-tones', 'slurs', 'technique', 'articulation', 'etude', 'piece'], 'Air, low response, flexibility, music.', 'Low sound, valves, articulation, and repertoire.'),
  flute: tailoredPresets(['breathing', 'long-tones', 'technique', 'piece'], ['breathing', 'long-tones', 'harmonics', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Tone, fingers, one musical phrase.', 'Tone color, harmonics, fingers, tongue, and repertoire.'),
  piccolo: tailoredPresets(['breathing', 'long-tones', 'piece'], ['breathing', 'long-tones', 'register', 'scales', 'technique', 'articulation', 'piece'], 'Easy tone, soft pitch, music.', 'Register, intonation, fingers, articulation, and music.'),
  clarinet: tailoredPresets(['breathing', 'long-tones', 'register-slurs', 'piece'], ['breathing', 'long-tones', 'register-slurs', 'technique', 'scales', 'articulation', 'etude', 'piece'], 'Voicing, sound, registers, music.', 'Tone, break, fingers, tongue, and repertoire.'),
  'bass-clarinet': tailoredPresets(['breathing', 'long-tones', 'register-slurs', 'piece'], ['breathing', 'long-tones', 'register-slurs', 'technique', 'scales', 'articulation', 'etude', 'piece'], 'Low response, resonance, registers.', 'Low sound, voicing, fingerings, and repertoire.'),
  'soprano-sax': tailoredPresets(['breathing', 'long-tones', 'overtones', 'piece'], ['breathing', 'long-tones', 'overtones', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Pitch center, intonation, overtones.', 'Voicing, fingers, articulation, and repertoire.'),
  'alto-sax': tailoredPresets(['breathing', 'long-tones', 'overtones', 'piece'], ['breathing', 'long-tones', 'overtones', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Setup, tone, overtones, music.', 'Tone, voicing, fingers, time, and repertoire.'),
  'tenor-sax': tailoredPresets(['breathing', 'long-tones', 'overtones', 'piece'], ['breathing', 'long-tones', 'overtones', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Air, full-range tone, voicing.', 'Registers, fingers, color, and repertoire.'),
  'bari-sax': tailoredPresets(['breathing', 'long-tones', 'overtones', 'piece'], ['breathing', 'long-tones', 'overtones', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Low response, tone, voicing.', 'Low register, keywork, groove, and repertoire.'),
  oboe: tailoredPresets(['breathing', 'long-tones', 'response', 'piece'], ['breathing', 'long-tones', 'response', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Air, reed response, stable sound.', 'Air, face, tongue, fingers, and repertoire.'),
  bassoon: tailoredPresets(['breathing', 'tenor-register', 'flicking', 'piece'], ['breathing', 'tenor-register', 'flicking', 'scales', 'technique', 'articulation', 'etude', 'piece'], 'Response, tenor register, flicking.', 'Tone, registers, fingerings, tongue, and repertoire.'),
  violin: tailoredPresets(['bow-warmup', 'intonation', 'shifting', 'piece'], ['bow-warmup', 'intonation', 'shifting', 'bowing', 'double-stops', 'etude', 'piece'], 'Bow, intonation, shifting, music.', 'Sound, pitch, left hand, bowing, and repertoire.'),
  viola: tailoredPresets(['bow-warmup', 'intonation', 'shifting', 'piece'], ['bow-warmup', 'intonation', 'shifting', 'bowing', 'double-stops', 'etude', 'piece'], 'Bow weight, intonation, shifting.', 'C-string sound, pitch, bowing, and repertoire.'),
  cello: tailoredPresets(['bow-warmup', 'intonation', 'shifting', 'piece'], ['bow-warmup', 'intonation', 'shifting', 'bowing', 'thumb-position', 'etude', 'piece'], 'Bow path, intonation, shifting.', 'Sound, extensions, thumb position, and repertoire.'),
  'double-bass': tailoredPresets(['bow-warmup', 'intonation', 'shifting', 'piece'], ['bow-warmup', 'intonation', 'shifting', 'bowing', 'pizzicato', 'etude', 'piece'], 'Bow weight, positions, shifting.', 'Pitch, shifts, bowing, time, and repertoire.'),
  guitar: tailoredPresets(['warmup', 'right-hand', 'chords', 'piece'], ['warmup', 'scales', 'right-hand', 'slurs', 'chords', 'etude', 'piece'], 'Hands, arpeggios, chords, music.', 'Fretboard, both hands, rhythm, and repertoire.'),
  'bass-guitar': tailoredPresets(['warmup', 'groove', 'piece'], ['warmup', 'scales', 'groove', 'technique', 'transcription', 'piece'], 'Hands, muting, groove, music.', 'Fretboard, time, technique, ears, and repertoire.'),
  ukulele: tailoredPresets(['warmup', 'chords', 'strumming', 'piece'], ['warmup', 'chords', 'strumming', 'fingerpicking', 'scales', 'piece'], 'Hands, chords, strum, song.', 'Rhythm, fingerpicking, fretboard, and music.'),
  voice: tailoredPresets(['body', 'sirens', 'sustained', 'piece'], ['body', 'sirens', 'sustained', 'registers', 'vocalises', 'agility', 'piece'], 'Body, easy glides, resonance, song.', 'Breath, registers, resonance, diction, and repertoire.'),
  piano: tailoredPresets(['warmup', 'scales', 'piece'], ['warmup', 'scales', 'arpeggios', 'chords', 'independence', 'sight-reading', 'piece'], 'Alignment, scales, one passage.', 'Scales, arpeggios, voicing, reading, and repertoire.'),
}

export function getRoutinePresets(instrumentId: string | null): RoutinePreset[] {
  return instrumentId ? INSTRUMENT_PRESETS[instrumentId] ?? PRESETS[presetFamilyFor(instrumentId)] : PRESETS.general
}

export function presetMinutes(preset: RoutinePreset, instrumentId: string | null): number {
  const templates = getStepTemplates(instrumentId)
  return preset.templateIds.reduce(
    (sum, id) => sum + (templates.find((template) => template.id === id)?.minutes ?? 0),
    0,
  )
}

export function buildPresetRoutine(preset: RoutinePreset, instrumentId: string | null): Routine {
  const templates = getStepTemplates(instrumentId)
  const steps = preset.templateIds
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is StepTemplate => Boolean(template))
    .map((template) => stepFromTemplate(template, instrumentId))
  return createRoutine(preset.name, steps, instrumentId)
}

/* ---- Common choices, offered after a step is chosen --------------------- */

interface Suggestion {
  text: string
  /** Restrict to these instrument ids. Absent means the whole family. */
  only?: string[]
}

const S = (text: string, only?: string[]): Suggestion => ({ text, only })

const SUGGESTIONS: Record<PresetFamily, Partial<Record<RoutineTopic, Suggestion[]>>> = {
  brass: {
    warmup: [
      S('Mouthpiece buzzing — sirens and glissandi'),
      S('Free buzzing, then mouthpiece, then horn'),
      S('The Breathing Gym (Pilafian & Sheridan)'),
    ],
    'long-tones': [
      S('Stamp — Warm-ups and Studies', ['trumpet']),
      S('Cichowicz — Flow Studies', ['trumpet']),
      S('Schlossberg — Daily Drills, first pages', ['trumpet']),
      S('Remington long tones', ['trombone', 'euphonium', 'tuba']),
    ],
    flexibility: [
      S('Irons — 27 Groups of Exercises', ['trumpet']),
      S('Colin — Advanced Lip Flexibilities', ['trumpet']),
      S('Bai Lin — Lip Flexibilities', ['trumpet']),
      S('Schlossberg lip slurs', ['trumpet']),
    ],
    scales: [
      S('Arban — scales section'),
      S('One key per day, full range'),
      S('Clarke — Technical Studies No. 2 and 3', ['trumpet']),
    ],
    technique: [
      S('Clarke — Technical Studies', ['trumpet']),
      S('Arban — Complete Method, intervals and arpeggios'),
      S('Kopprasch — 60 Studies', ['french-horn', 'tuba', 'trombone']),
    ],
    articulation: [
      S('Arban — single, double and triple tonguing'),
      S('Clarke — Characteristic Studies', ['trumpet']),
      S('Scale patterns in staccato, then legato'),
    ],
    etude: [
      S('Charlier — 36 Études transcendantes', ['trumpet']),
      S('Bordogni / Rochut — Melodious Etudes', ['trombone', 'euphonium', 'tuba']),
      S('Kopprasch — 60 Studies', ['french-horn', 'tuba']),
      S('Concone — Lyrical Studies'),
    ],
    piece: [S('Your current solo, excerpt, or band part'), S('Pick one phrase, not the whole piece')],
    cooldown: [S('Pedal tones, very soft'), S('Low long tones with the drone')],
  },
  woodwind: {
    warmup: [
      S('Breathing: long exhales on a hiss'),
      S('Overtone series on low B♭', ['soprano-sax', 'alto-sax', 'tenor-sax', 'bari-sax']),
      S('Register slurs, twelfths', ['clarinet', 'bass-clarinet']),
      S('Harmonics from low notes', ['flute', 'piccolo']),
    ],
    'long-tones': [
      S('Moyse — De la Sonorité', ['flute', 'piccolo']),
      S('Taffanel & Gaubert — long tones', ['flute', 'piccolo']),
      S('Rascher — Top-Tones, overtone exercises', ['soprano-sax', 'alto-sax', 'tenor-sax', 'bari-sax']),
      S('Chromatic long tones with the drone'),
    ],
    scales: [
      S('Taffanel & Gaubert — 17 Daily Exercises', ['flute', 'piccolo']),
      S('Baermann — Method, Part III', ['clarinet', 'bass-clarinet']),
      S('Klosé — scales and arpeggios', ['clarinet', 'bass-clarinet', 'soprano-sax', 'alto-sax', 'tenor-sax', 'bari-sax']),
      S('Barret — Oboe Method, scales', ['oboe']),
      S('Weissenborn — scales', ['bassoon']),
      S('One key per day, full range'),
    ],
    technique: [
      S('Reichert — 7 Daily Exercises', ['flute', 'piccolo']),
      S('Klosé — mechanism exercises', ['clarinet', 'bass-clarinet']),
      S('Hite — Melodious and Progressive Studies', ['soprano-sax', 'alto-sax', 'tenor-sax', 'bari-sax']),
      S('Milde — Scale and Chord Studies', ['bassoon']),
      S('Finger patterns across the break', ['clarinet', 'bass-clarinet']),
    ],
    articulation: [
      S('Scale patterns: staccato, then two slurred two tongued'),
      S('Andersen — Op. 33 for articulation', ['flute', 'piccolo']),
      S('Rose — 32 Études', ['clarinet', 'bass-clarinet']),
    ],
    etude: [
      S('Andersen — 24 Études, Op. 33', ['flute', 'piccolo']),
      S('Rose — 40 Studies', ['clarinet', 'bass-clarinet']),
      S('Ferling — 48 Études', ['oboe', 'soprano-sax', 'alto-sax', 'tenor-sax', 'bari-sax']),
      S('Milde — Concert Studies', ['bassoon']),
      S('Barret — Oboe Method, melodies', ['oboe']),
    ],
    piece: [S('Your current solo, excerpt, or band part'), S('Pick one phrase, not the whole piece')],
    cooldown: [S('Soft low long tones')],
  },
  strings: {
    warmup: [
      S('Open strings, whole bows, listen for the ring', ['violin', 'viola', 'cello', 'double-bass']),
      S('Left-hand finger patterns without the bow', ['violin', 'viola', 'cello', 'double-bass']),
      S('Chromatic "spider" across the neck', ['guitar', 'bass-guitar', 'ukulele']),
      S('Simon Fischer — Basics', ['violin', 'viola']),
    ],
    scales: [
      S('Flesch — Scale System', ['violin', 'viola']),
      S('Galamian — Contemporary Violin Technique', ['violin', 'viola']),
      S('Feuillard — Daily Exercises', ['cello']),
      S('Simandl — New Method', ['double-bass']),
      S('Segovia — Diatonic Major and Minor Scales', ['guitar']),
      S('One key per day, three octaves', ['violin', 'viola', 'cello']),
      S('Major scale and arpeggio shapes across the neck', ['bass-guitar']),
      S('One-octave scales and chord tones', ['ukulele']),
    ],
    technique: [
      S('Ševčík — Op. 1, Op. 8 for shifting', ['violin', 'viola']),
      S('Schradieck — School of Violin Technique', ['violin', 'viola']),
      S('Cossmann — studies', ['cello']),
      S('Popper — High School of Cello Playing', ['cello']),
      S('Giuliani — 120 Right-Hand Studies', ['guitar']),
      S('Slow double stops against the drone', ['violin', 'viola', 'cello']),
      S('Two-finger alternation and string crossing', ['bass-guitar']),
      S('Muting drill: play one string, silence the others', ['bass-guitar']),
      S('Chord-change loops with minimum finger motion', ['ukulele']),
      S('Fingerpicking: thumb, index, middle patterns', ['ukulele']),
    ],
    articulation: [
      S('Ševčík — Op. 2 bowing variations', ['violin', 'viola']),
      S('Kreutzer No. 2 with bowing variants', ['violin', 'viola']),
      S('One bow stroke per day: spiccato, martelé, sautillé', ['violin', 'viola', 'cello', 'double-bass']),
      S('Strumming subdivisions with accents', ['guitar', 'ukulele']),
      S('Groove placement and note length with a click', ['bass-guitar']),
    ],
    etude: [
      S('Kreutzer — 42 Studies', ['violin', 'viola']),
      S('Dont — Op. 37', ['violin']),
      S('Duport — 21 Études', ['cello']),
      S('Storch–Hrabě — 57 Studies', ['double-bass']),
      S('Sor — Studies (Segovia selection)', ['guitar']),
      S('Villa-Lobos — 12 Études', ['guitar']),
      S('Transcribe two bars from a favorite bassist', ['bass-guitar']),
      S('A song with two or three chord shapes', ['ukulele']),
    ],
    piece: [S('Your current piece or orchestral part'), S('One passage, slow, with the reference')],
    cooldown: [S('Slow bows on open strings', ['violin', 'viola', 'cello', 'double-bass']), S('Release the hands and shoulders')],
  },
  voice: {
    warmup: [
      S('Hiss counts: in for 4, out for 16'),
      S('Lip trills and hums through the range'),
      S('Straw phonation (semi-occluded)'),
    ],
    'long-tones': [S('Messa di voce on one pitch'), S('Sustained vowels: ee, eh, ah, oh, oo')],
    scales: [
      S('Vaccai — Metodo pratico'),
      S('Concone — 50 Lessons, Op. 9'),
      S('Marchesi — vocalises'),
      S('Five-note patterns, up by semitones'),
    ],
    articulation: [
      S('Staccato arpeggios on "ha"'),
      S('Text of the song spoken on pitch, in rhythm'),
      S('Tongue-twisters on a single note'),
    ],
    piece: [S('The song you are learning — one phrase'), S('Speak it, then sing it, then with the reference')],
    cooldown: [S('Descending sirens, quiet'), S('Humming down to your lowest easy note')],
  },
  keys: {
    warmup: [S('Hanon — first exercises, slow'), S('Five-finger patterns in every key'), S('Czerny — Op. 599')],
    scales: [S('Scales and arpeggios, hands together'), S('Contrary-motion scales'), S('Chromatic scale in octaves')],
    technique: [
      S('Hanon — Nos. 21–43'),
      S('Czerny — Op. 299, School of Velocity'),
      S('Brahms — 51 Exercises'),
      S('Dohnányi — Essential Finger Exercises'),
    ],
    etude: [
      S('Burgmüller — Op. 100'),
      S('Heller — Op. 45 and 46'),
      S('Cramer — 60 Studies'),
      S('Chopin — Études (one, slowly)'),
    ],
    'sight-reading': [S('Something two grades below your level'), S('Slow click, no stopping')],
    piece: [S('The piece you are learning — one phrase'), S('Hands separately, then together with the reference')],
  },
  general: {
    warmup: [S('Slow, easy range, soft')],
    'long-tones': [S('Long notes against the drone, watching the tuner')],
    scales: [S('One key per day')],
    technique: [S('Whatever your teacher assigned')],
    etude: [S('Your current study')],
    piece: [S('One phrase of your current piece')],
  },
}

export function getStepSuggestions(instrumentId: string | null, topic: RoutineTopic): string[] {
  const family = presetFamilyFor(instrumentId)
  const list = SUGGESTIONS[family][topic] ?? []
  return list
    .filter((item) => !item.only || (instrumentId !== null && item.only.includes(instrumentId)))
    .map((item) => item.text)
    .slice(0, 4)
}
