export type OnboardingCardId =
  | 'welcome'
  | 'capture'
  | 'practice-tools'
  | 'take-vault'

export type CoachMarkId =
  | 'camera-recording'
  | 'hands-free-recording'
  | 'switch-to-audio'
  | 'audio-workspace'
  | 'visit-metronome'
  | 'visit-tuner'
  | 'open-take-vault'
  | 'take-vault-overview'
  | 'close-take-vault'
  | 'quick-settings'

export type TutorialActionId =
  | 'youtube-opened'
  | 'media-touched'
  | 'branch-widget-selected'
  | 'hands-free-toggled'

export type CoachMarkAdvance =
  | 'tap-screen'
  | 'audio-mode'
  | 'audio-tab-metronome'
  | 'audio-tab-tuner'
  | 'vault-open'
  | 'vault-close'

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
  requiresVault?: 'open' | 'closed'
}

export interface HelpTopic {
  id: HelpTopicId
  title: string
  body: string
  bullets: string[]
}

export const ONBOARDING_CARDS: OnboardingCard[] = [
  {
    id: 'welcome',
    title: 'Welcome to BestTake',
    body: 'A focused practice space for capturing performances, hearing the details, and keeping the takes that move you forward.',
  },
  {
    id: 'capture',
    title: 'Easy Recording and Playback',
    body: 'Record with video when technique matters, or switch to Audio for fast listening. Long-press Record when you want hands-free practice.',
  },
  {
    id: 'practice-tools',
    title: 'Tools That Stay Close',
    body: 'Move between the metronome, tuner, drones, and practice timeline without leaving your session.',
  },
  {
    id: 'take-vault',
    title: 'Build Your Take Vault',
    body: 'Every take is saved automatically. Compare performances, pin your best, trim recordings, and return to any session later.',
  },
]

export const COACH_MARKS: CoachMarkContent[] = [
  {
    id: 'camera-recording',
    title: 'Record a Take',
    body: 'Tap once to record, then tap again to stop. Camera captures technique and movement; Audio keeps repetitions fast and focused.',
    selector: '[data-tutorial="record-controls"]',
    placement: 'top',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    requiresSplitView: 'closed',
  },
  {
    id: 'hands-free-recording',
    title: 'Hands-Free Practice',
    body: 'Long-press Record to listen for your playing, capture the full first note with pre-roll, and play each take back automatically.',
    selector: '[data-tutorial="record-controls"]',
    placement: 'top',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    requiresSplitView: 'closed',
  },
  {
    id: 'switch-to-audio',
    title: 'Switch to Audio',
    body: 'Audio Mode is built for quick listening and focused repetitions. Open it now to see the practice tools.',
    selector: '[data-tutorial-mode="audio"]',
    placement: 'top',
    advance: 'audio-mode',
    continueHint: 'Tap the Audio button to continue.',
    requiresSplitView: 'closed',
  },
  {
    id: 'audio-workspace',
    title: 'Your Audio Workspace',
    body: 'These tabs keep recording, timing, tuning, and structured practice together in one place.',
    selector: '[data-tutorial="audio-mode-tabs"]',
    placement: 'bottom',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
  },
  {
    id: 'visit-metronome',
    title: 'Meet the Metronome',
    body: 'Set tempo, meter, subdivision, beat grouping, accents, and click sound from the full metronome workspace.',
    selector: '[data-tutorial="audio-tab-metronome"]',
    placement: 'bottom',
    advance: 'audio-tab-metronome',
    continueHint: 'Tap Metronome to continue.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
  },
  {
    id: 'visit-tuner',
    title: 'Tune and Build Intonation',
    body: 'The Tuner gives you live pitch feedback, instrument-aware note guidance, and a radial drone wheel.',
    selector: '[data-tutorial="audio-tab-tuner"]',
    placement: 'bottom',
    advance: 'audio-tab-tuner',
    continueHint: 'Tap Tuner to continue.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
  },
  {
    id: 'open-take-vault',
    title: 'Open the Take Vault',
    body: 'All of your recordings are stored here, ready to search, compare, favorite, trim, or share.',
    selector: '[data-tutorial="vault-button"]',
    placement: 'top',
    advance: 'vault-open',
    continueHint: 'Tap the Take Vault button to continue.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresVault: 'closed',
  },
  {
    id: 'take-vault-overview',
    title: 'Everything You Record, Organized',
    body: 'Takes stay grouped with your session. Search, select, pin a reference performance, or open any take full screen.',
    selector: '[data-tutorial="vault-sheet"]',
    placement: 'bottom',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    requiresVault: 'open',
  },
  {
    id: 'close-take-vault',
    title: 'Back to Practice',
    body: 'Close the Vault whenever you are ready. Your takes remain saved and waiting for you.',
    selector: '[data-tutorial="vault-close"]',
    placement: 'left',
    advance: 'vault-close',
    continueHint: 'Tap Close to continue.',
    requiresVault: 'open',
  },
  {
    id: 'quick-settings',
    title: 'One Last Shortcut',
    body: 'Tap Settings for the full menu, or long-press it for quick access to the tools you use most.',
    selector: '[data-tutorial="settings-button"]',
    placement: 'left',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to finish.',
    requiresSplitView: 'closed',
    requiresVault: 'closed',
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
