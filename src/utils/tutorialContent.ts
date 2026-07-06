export type OnboardingCardId =
  | 'record-two-videos'
  | 'pin-first-best'
  | 'record-practice'
  | 'analyze-playing'
  | 'save-best-takes'
  | 'import-practice-media'

export type CoachMarkId =
  | 'expand-mode'
  | 'practice-media'
  | 'close-expand'
  | 'quick-settings'
  | 'youtube-opened'
  | 'media-touched'
  | 'branch-widget-selected'
  | 'hands-free-toggled'

export type CoachMarkAdvance =
  | 'dismiss'
  | 'split-open'
  | 'split-close'
  | 'branch-widget-or-hands-free'

export type HelpTopicId =
  | 'recording-modes'
  | 'hands-free-recording'
  | 'quick-settings-widgets'
  | 'audio-mode'
  | 'take-vault'
  | 'take-cards'
  | 'pinning-best-takes'
  | 'drag-to-best-take'
  | 'expand-mode'
  | 'vault-settings'
  | 'media-youtube'
  | 'metronome'
  | 'tuner-drones'
  | 'reset-tutorials'

export interface OnboardingCard {
  id: OnboardingCardId
  title: string
  body: string
}

export interface CoachMarkContent {
  id: CoachMarkId
  title: string
  body: string
  selector: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  advance: CoachMarkAdvance
  continueHint: string
  requiresSplitView?: 'open' | 'closed'
  requiresRecordingMode?: 'video' | 'audio'
}

export interface HelpTopic {
  id: HelpTopicId
  title: string
  body: string
  bullets: string[]
}

export const ONBOARDING_CARDS: OnboardingCard[] = [
  {
    id: 'record-two-videos',
    title: 'Record Two Quick Takes',
    body: 'Tap Record, say something quick, then tap Record again to stop. Do that twice. It can be literally anything, just enough to fill Current Take and Best Take.',
  },
  {
    id: 'pin-first-best',
    title: 'Move One Into Best Take',
    body: 'After the second take, long-press Current Take and drag it into Best Take. You can also use Make Best from the Vault later.',
  },
  {
    id: 'record-practice',
    title: 'Record Your Practice',
    body: 'Use Camera Mode for video practice or Audio Mode for focused listening. Long-press Record for hands-free sessions.',
  },
  {
    id: 'analyze-playing',
    title: 'Analyze Your Playing',
    body: 'Practice with the metronome, tuner, drones, and pitch analysis tools built into the app.',
  },
  {
    id: 'save-best-takes',
    title: 'Save Your Best Takes',
    body: 'Every recording is stored automatically. Pin and organize your favorite performances in the Take Vault.',
  },
  {
    id: 'import-practice-media',
    title: 'Import Practice Media',
    body: 'Use YouTube and other media sources alongside your practice sessions and expand your workspace when needed.',
  },
]

export const COACH_MARKS: CoachMarkContent[] = [
  {
    id: 'expand-mode',
    title: 'Expand Mode',
    body: 'Tap expand to open a larger workspace for media, playback, and comparison.',
    selector: '[data-tutorial="best-take-expand"]',
    placement: 'left',
    advance: 'split-open',
    continueHint: 'Tap expand to continue.',
    requiresSplitView: 'closed',
  },
  {
    id: 'practice-media',
    title: 'Practice Media',
    body: 'Upload files or load YouTube play-alongs here while expand view is open.',
    selector: '[data-tutorial="best-take-youtube"], [data-tutorial="best-take-box"]',
    placement: 'top',
    advance: 'dismiss',
    continueHint: 'Tap X when you are ready to continue.',
    requiresSplitView: 'open',
  },
  {
    id: 'close-expand',
    title: 'Close Expand View',
    body: 'Tap the expand button again to return to the normal practice layout.',
    selector: '[data-tutorial="best-take-collapse"]',
    placement: 'top',
    advance: 'split-close',
    continueHint: 'Tap expand to close and continue.',
    requiresSplitView: 'open',
  },
  {
    id: 'quick-settings',
    title: 'Long-Press Shortcuts',
    body: 'In Camera Mode, long-press Settings to toggle widgets like Pitch Analysis, Take Cards, Metronome, and Audio Enhancer. Or long-press Record for hands-free practice.',
    selector: '[data-tutorial="settings-button"]',
    placement: 'left',
    advance: 'branch-widget-or-hands-free',
    continueHint: 'Long-press Settings and pick a widget, or long-press Record.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
]

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'recording-modes',
    title: 'Recording Modes',
    body: 'Use Camera Mode when posture, framing, or technique matters. Use Audio Mode when you want faster listening and focused sound.',
    bullets: ['Camera for video practice', 'Audio for quick reps', 'Switch modes from the record control'],
  },
  {
    id: 'hands-free-recording',
    title: 'Hands-Free Recording',
    body: 'Long-press Record to toggle hands-free practice that starts and stops around your playing.',
    bullets: [
      'Works in Camera Mode and Audio Mode',
      'BestTake plays takes back automatically',
      'Stay with your instrument between takes',
    ],
  },
  {
    id: 'quick-settings-widgets',
    title: 'Quick Settings Widgets',
    body: 'In Camera Mode, long-press the Settings button to open the widget wheel without leaving practice.',
    bullets: [
      'Toggle Pitch Analysis, Take Cards, Metronome, and Audio Enhancer',
      'Tap a widget to show or hide it on screen',
      'Tap Settings normally to open the full settings drawer',
    ],
  },
  {
    id: 'audio-mode',
    title: 'Audio Mode',
    body: 'Audio Mode keeps recording, playback, metronome, tuner, and take review in one focused practice space.',
    bullets: ['Record audio takes', 'Review Current and Best takes', 'Use tools without leaving practice'],
  },
  {
    id: 'take-vault',
    title: 'Take Vault',
    body: 'The Take Vault stores your recordings automatically and helps you find the ones worth keeping.',
    bullets: ['Search and sort takes', 'Pin favorites', 'Open takes fullscreen'],
  },
  {
    id: 'take-cards',
    title: 'Take Cards',
    body: 'Take cards are quick handles for playback, comparison, and organization.',
    bullets: ['Tap to open or play', 'Long-press for more actions', 'Use Current Take and Best Take together'],
  },
  {
    id: 'pinning-best-takes',
    title: 'Pinning Best Takes',
    body: 'Pinning marks a performance as your current reference so you can compare future takes against it.',
    bullets: ['Pin from cards or the Vault', 'Replace it anytime', 'Use it as your practice benchmark'],
  },
  {
    id: 'drag-to-best-take',
    title: 'Drag to Best Take',
    body: 'Long-press a take and drag it into Best Take when you want it featured on the main screen.',
    bullets: ['Works with saved takes', 'Keeps the original recording', 'Helps compare fast'],
  },
  {
    id: 'expand-mode',
    title: 'Expand Mode',
    body: 'Expand Mode gives Best Take more room for imported media, playback, and comparison.',
    bullets: [
      'Tap expand on Best Take to open split view',
      'Upload or load YouTube while expanded',
      'Tap expand again to return to normal view',
    ],
  },
  {
    id: 'vault-settings',
    title: 'Vault Settings',
    body: 'Vault settings keep organization and display controls close to your saved takes.',
    bullets: ['Long-press supported controls', 'Adjust how takes are shown', 'Keep cleanup actions nearby'],
  },
  {
    id: 'media-youtube',
    title: 'Media & YouTube',
    body: 'Practice with reference material directly beside your recordings. Open expand view for the easiest access.',
    bullets: [
      'Use YouTube for play-alongs',
      'Upload audio or video references',
      'Keep media separate from your takes',
    ],
  },
  {
    id: 'metronome',
    title: 'Metronome',
    body: 'Build timing with tempo, time signatures, subdivisions, and click sounds.',
    bullets: [
      'Spin the tempo wheel in Audio Mode',
      'Long-press Settings in Camera Mode to toggle the metronome widget',
      'Choose subdivisions and accents',
    ],
  },
  {
    id: 'tuner-drones',
    title: 'Tuner & Drones',
    body: 'Use the tuner to see pitch in real time and drones to practice intonation against a steady reference.',
    bullets: ['Play to see pitch', 'Tap drone notes on or off', 'Use chords for harmony practice'],
  },
  {
    id: 'reset-tutorials',
    title: 'Reset Tutorials',
    body: 'Bring back onboarding and coach marks whenever you want a fresh walkthrough.',
    bullets: ['Resets first-launch cards', 'Resets contextual tips', 'Does not affect recordings or settings'],
  },
]

export const ONBOARDING_STORAGE_KEY = 'sessionmirror:tutorial:onboarding-complete-v1'
export const COACH_STORAGE_KEY = 'sessionmirror:tutorial:coach-seen-v2'
