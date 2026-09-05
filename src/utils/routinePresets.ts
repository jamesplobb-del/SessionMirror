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

export function getStepTemplates(instrumentId: string | null): StepTemplate[] {
  return TEMPLATES[presetFamilyFor(instrumentId)]
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

export function getRoutinePresets(instrumentId: string | null): RoutinePreset[] {
  return PRESETS[presetFamilyFor(instrumentId)]
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
      S('Stamp — Warm-ups and Studies'),
      S('Cichowicz — Flow Studies'),
      S('Schlossberg — Daily Drills, first pages'),
      S('Remington long tones', ['trombone', 'euphonium', 'tuba']),
    ],
    flexibility: [
      S('Irons — 27 Groups of Exercises'),
      S('Colin — Advanced Lip Flexibilities'),
      S('Bai Lin — Lip Flexibilities'),
      S('Schlossberg lip slurs'),
    ],
    scales: [
      S('Arban — scales section'),
      S('One key per day, full range'),
      S('Clarke — Technical Studies No. 2 and 3'),
    ],
    technique: [
      S('Clarke — Technical Studies'),
      S('Arban — Complete Method, intervals and arpeggios'),
      S('Kopprasch — 60 Studies', ['french-horn', 'tuba', 'trombone']),
    ],
    articulation: [
      S('Arban — single, double and triple tonguing'),
      S('Clarke — Characteristic Studies'),
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
      S('Finger patterns across the break'),
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
    cooldown: [S('Soft low long tones'), S('Reed and swab, then a breath')],
  },
  strings: {
    warmup: [
      S('Open strings, whole bows, listen for the ring'),
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
      S('One key per day, three octaves'),
    ],
    technique: [
      S('Ševčík — Op. 1, Op. 8 for shifting', ['violin', 'viola']),
      S('Schradieck — School of Violin Technique', ['violin', 'viola']),
      S('Cossmann — studies', ['cello']),
      S('Popper — High School of Cello Playing', ['cello']),
      S('Giuliani — 120 Right-Hand Studies', ['guitar']),
      S('Slow double stops against the drone', ['violin', 'viola', 'cello']),
    ],
    articulation: [
      S('Ševčík — Op. 2 bowing variations', ['violin', 'viola']),
      S('Kreutzer No. 2 with bowing variants', ['violin', 'viola']),
      S('One bow stroke per day: spiccato, martelé, sautillé'),
    ],
    etude: [
      S('Kreutzer — 42 Studies', ['violin', 'viola']),
      S('Dont — Op. 37', ['violin']),
      S('Duport — 21 Études', ['cello']),
      S('Storch–Hrabě — 57 Studies', ['double-bass']),
      S('Sor — Studies (Segovia selection)', ['guitar']),
      S('Villa-Lobos — 12 Études', ['guitar']),
    ],
    piece: [S('Your current piece or orchestral part'), S('One passage, slow, with the reference')],
    cooldown: [S('Slow bows on open strings'), S('Stretch hands and shoulders')],
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
