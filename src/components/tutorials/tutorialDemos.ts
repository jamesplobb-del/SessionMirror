/**
 * The little moving pictures that show where a control is.
 *
 * A tip that says "open Workspace and pick a tool" still leaves a player
 * hunting for Workspace. These demos answer the only question the words cannot:
 * *where*. They are drawn in code rather than recorded, because a screen
 * recording of this app would be a file per tip that goes stale the first time
 * a control moves, costs megabytes in the bundle, and cannot follow the light
 * and dark rooms. A demo here is a handful of rectangles and a finger.
 *
 * Deliberately a diagram, not a mock screenshot: shapes are laid out like the
 * real screen so the player recognises the place, but nothing pretends to be a
 * pixel copy of a screen that will have changed by the next release.
 */

/** A box inside the stage, in percentages so it scales to any card width. */
export interface DemoShape {
  x: number
  y: number
  w: number
  h: number
  /** How it is drawn: the room's chrome, a tool ball, the page, the record orbit. */
  kind: 'bar' | 'ball' | 'page' | 'panel' | 'record'
  label?: string
  /** The one thing this scene is pointing at. */
  focus?: boolean
}

export interface DemoScene {
  /** One short line, in the same voice as the tip above it. */
  caption: string
  shapes: DemoShape[]
  /** Where the finger lands, in stage percentages. Omitted means no tap. */
  tap?: { x: number; y: number }
}

export interface TutorialDemo {
  id: TutorialId
  /** Title in the Settings library. The tip carries its own wording. */
  title: string
  summary: string
  scenes: DemoScene[]
}

export type TutorialId =
  | 'workspace-tools'
  | 'record-a-take'
  | 'hands-free'
  | 'turn-pages'
  | 'mark-the-music'
  | 'best-take'
  | 'take-library'

/* The room, reused so every demo puts the same furniture in the same place. */
const TABS: DemoShape = { x: 16, y: 6, w: 68, h: 12, kind: 'bar', label: 'Record  Tuner  Metronome' }
const DECK: DemoShape = { x: 16, y: 82, w: 68, h: 13, kind: 'bar', label: 'Workspace        Camera' }
const RECORD: DemoShape = { x: 44.5, y: 79, w: 11, h: 18, kind: 'record' }
const PAGE: DemoShape = { x: 12, y: 21, w: 76, h: 58, kind: 'page' }
const ball = (y: number, label: string, focus = false): DemoShape =>
  ({ x: 84, y, w: 11, h: 9, kind: 'ball', label, focus })

export const TUTORIAL_DEMOS: Record<TutorialId, TutorialDemo> = {
  'workspace-tools': {
    id: 'workspace-tools',
    title: 'Bring tools onto the page',
    summary: 'Where Workspace lives, and how a tool becomes a circle you can move.',
    scenes: [
      {
        caption: 'Tap Workspace on the deck.',
        shapes: [TABS, PAGE, { ...DECK, focus: true }, RECORD],
        tap: { x: 27, y: 88 },
      },
      {
        caption: 'Choose Pitch, Metronome, Drone or Takes.',
        shapes: [
          TABS, PAGE, DECK, RECORD,
          { x: 22, y: 38, w: 56, h: 26, kind: 'panel', label: 'Pitch  Metronome  Drone  Takes', focus: true },
        ],
        tap: { x: 36, y: 51 },
      },
      {
        caption: 'It parks as a circle. Tap to open, drag to move.',
        shapes: [TABS, PAGE, DECK, RECORD, ball(30, 'Pitch', true), ball(42, 'Takes')],
        tap: { x: 89, y: 34 },
      },
    ],
  },

  'record-a-take': {
    id: 'record-a-take',
    title: 'Record a take',
    summary: 'One tap starts, one tap stops, and the take saves itself.',
    scenes: [
      { caption: 'Tap Record to start.', shapes: [TABS, PAGE, DECK, { ...RECORD, focus: true }], tap: { x: 50, y: 88 } },
      { caption: 'Play. Tap again to stop.', shapes: [TABS, PAGE, DECK, { ...RECORD, focus: true }], tap: { x: 50, y: 88 } },
      {
        caption: 'Your take lands in the Takes box.',
        shapes: [TABS, PAGE, DECK, RECORD, { x: 22, y: 34, w: 56, h: 22, kind: 'panel', label: 'Current Take', focus: true }],
      },
    ],
  },

  'hands-free': {
    id: 'hands-free',
    title: 'Hands-free practice',
    summary: 'Recording that starts when you play and stops when you stop.',
    scenes: [
      {
        caption: 'Press and hold Record to arm hands-free.',
        shapes: [TABS, PAGE, DECK, { ...RECORD, focus: true }],
        tap: { x: 50, y: 88 },
      },
      {
        caption: 'It listens. Start playing and it records.',
        shapes: [TABS, PAGE, DECK, RECORD, { x: 26, y: 33, w: 48, h: 14, kind: 'panel', label: 'Listening…', focus: true }],
      },
      {
        caption: 'Stop playing and your take plays straight back.',
        shapes: [TABS, PAGE, DECK, RECORD, { x: 26, y: 33, w: 48, h: 14, kind: 'panel', label: 'Playing back', focus: true }],
      },
    ],
  },

  'turn-pages': {
    id: 'turn-pages',
    title: 'Turn the page',
    summary: 'Tap either edge of the part. Half turns keep the bottom line in view.',
    scenes: [
      {
        caption: 'Tap the right edge to go forward.',
        shapes: [TABS, { ...PAGE, focus: true }, DECK, RECORD],
        tap: { x: 82, y: 50 },
      },
      {
        caption: 'Tap the left edge to go back.',
        shapes: [TABS, { ...PAGE, focus: true }, DECK, RECORD],
        tap: { x: 18, y: 50 },
      },
      {
        caption: 'With half turns on, the line you are playing stays up.',
        shapes: [
          TABS, DECK, RECORD,
          { x: 12, y: 21, w: 76, h: 28, kind: 'page', label: 'bottom of this page' },
          { x: 12, y: 51, w: 76, h: 28, kind: 'page', label: 'top of the next', focus: true },
        ],
      },
    ],
  },

  'mark-the-music': {
    id: 'mark-the-music',
    title: 'Mark your music',
    summary: 'A marker in two colours, an eraser, and a saved copy with the marks in it.',
    scenes: [
      {
        caption: 'Open the Music circle and pick a colour.',
        shapes: [TABS, PAGE, DECK, RECORD, ball(30, 'Music', true)],
        tap: { x: 89, y: 34 },
      },
      {
        caption: 'Draw on the part. Erase rubs a whole mark out.',
        shapes: [TABS, { ...PAGE, focus: true }, DECK, RECORD, { x: 34, y: 40, w: 30, h: 12, kind: 'panel', label: 'Black  Red  Erase' }],
        tap: { x: 48, y: 60 },
      },
      {
        caption: 'Save PDF writes the marks into the file.',
        shapes: [TABS, PAGE, DECK, RECORD, { x: 30, y: 38, w: 40, h: 12, kind: 'panel', label: 'Save PDF', focus: true }],
        tap: { x: 50, y: 44 },
      },
    ],
  },

  'best-take': {
    id: 'best-take',
    title: 'Keep a best take',
    summary: 'Pin one take so the next one has something to beat.',
    scenes: [
      {
        caption: 'Tap Best Take on the take you want to keep.',
        shapes: [TABS, PAGE, DECK, RECORD, { x: 22, y: 30, w: 56, h: 20, kind: 'panel', label: 'Current Take   ⬤ Best Take', focus: true }],
        tap: { x: 68, y: 36 },
      },
      {
        caption: 'It stays beside your next recording.',
        shapes: [
          TABS, PAGE, DECK, RECORD,
          { x: 22, y: 26, w: 56, h: 16, kind: 'panel', label: 'Best Take', focus: true },
          { x: 22, y: 45, w: 56, h: 16, kind: 'panel', label: 'Current Take' },
        ],
      },
      { caption: 'Play each one to hear the difference.', shapes: [TABS, PAGE, DECK, RECORD, { x: 22, y: 26, w: 56, h: 16, kind: 'panel', label: '▶ Best Take', focus: true }], tap: { x: 28, y: 33 } },
    ],
  },

  'take-library': {
    id: 'take-library',
    title: 'Find your recordings',
    summary: 'Everything you record is kept in the Take library.',
    scenes: [
      { caption: 'Open the Take library above the deck.', shapes: [TABS, PAGE, { x: 38, y: 74, w: 24, h: 8, kind: 'bar', label: 'Take library', focus: true }, DECK, RECORD], tap: { x: 50, y: 78 } },
      { caption: 'Listen, rename or share any take.', shapes: [TABS, { x: 12, y: 21, w: 76, h: 58, kind: 'panel', label: 'Takes', focus: true }, DECK, RECORD] },
      { caption: 'Clearing a take from the screen keeps it here.', shapes: [TABS, { x: 12, y: 21, w: 76, h: 58, kind: 'panel', label: 'Takes', focus: true }, DECK, RECORD] },
    ],
  },
}

export const TUTORIAL_ORDER: TutorialId[] = [
  'record-a-take',
  'hands-free',
  'best-take',
  'take-library',
  'workspace-tools',
  'turn-pages',
  'mark-the-music',
]

/** How long each scene holds before the demo moves on. */
export const SCENE_MS = 2400
