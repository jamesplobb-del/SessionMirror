export type OnboardingCardId =
  | 'record-practice'
  | 'analyze-playing'
  | 'save-best-takes'
  | 'import-practice-media'

export type CoachMarkId =
  | 'take-cards'
  | 'best-take-box'
  | 'quick-settings'
  | 'record-button'
  | 'audio-mode'
  | 'metronome'
  | 'tuner'
  | 'expand-mode'
  | 'practice-media'
  | 'vault-take-card'
  | 'pin-best-take'
  | 'drag-to-best-take'
  | 'vault-expand-mode'
  | 'vault-settings'

export type HelpTopicId =
  | 'recording-modes'
  | 'hands-free-recording'
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
  placement?: 'top' | 'bottom'
}

export interface HelpTopic {
  id: HelpTopicId
  title: string
  body: string
  bullets: string[]
}

export const ONBOARDING_CARDS: OnboardingCard[] = [
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
    id: 'take-cards',
    title: 'Take Cards',
    body: 'Tap a take to play it. Long-press a take for more actions and organization tools.',
    selector: '[data-tutorial="pip-row"], [data-tutorial="audio-take-cards"]',
    placement: 'top',
  },
  {
    id: 'best-take-box',
    title: 'Best Take',
    body: 'Long-press and drag a take into this box to pin your current best performance.',
    selector: '[data-tutorial="best-take-box"]',
    placement: 'top',
  },
  {
    id: 'quick-settings',
    title: 'Quick Settings',
    body: 'Long-press the settings widget for additional controls and shortcuts.',
    selector: '[data-tutorial="settings-button"]',
    placement: 'top',
  },
  {
    id: 'record-button',
    title: 'Hands-Free Practice',
    body: 'Long-press the Record button in Camera or Audio Mode to enable hands-free recording.',
    selector: '[data-tutorial="record-controls"]',
    placement: 'top',
  },
  {
    id: 'audio-mode',
    title: 'Audio Mode',
    body: 'Focus on sound without video while using imported media, metronome tools, and practice recordings.',
    selector: '[data-tutorial="audio-mode-tabs"]',
    placement: 'bottom',
  },
  {
    id: 'metronome',
    title: 'Metronome',
    body: 'Choose time signatures, subdivisions, and tempo to build your practice routine.',
    selector: '[data-tutorial="audio-metronome-tab"]',
    placement: 'bottom',
  },
  {
    id: 'tuner',
    title: 'Tuner & Drones',
    body: 'Play a note to see your pitch in real time and use drones for intonation practice.',
    selector: '[data-tutorial="audio-tuner-tab"]',
    placement: 'bottom',
  },
  {
    id: 'expand-mode',
    title: 'Expand Mode',
    body: 'Expand the workspace to focus on imported media and detailed practice tools.',
    selector: '[data-tutorial="best-take-expand"]',
    placement: 'top',
  },
  {
    id: 'practice-media',
    title: 'Practice Media',
    body: 'Import YouTube audio and other media to practice alongside your favorite recordings.',
    selector: '[data-tutorial="best-take-youtube"]',
    placement: 'top',
  },
  {
    id: 'vault-take-card',
    title: 'Take Cards',
    body: 'Tap a take to play it. Long-press a take for more actions like renaming, pinning, and organizing your recordings.',
    selector: '[data-tutorial="vault-take-card"]',
    placement: 'bottom',
  },
  {
    id: 'pin-best-take',
    title: 'Pin Your Best Take',
    body: 'Mark your strongest performance so you can quickly find and compare it later.',
    selector: '[data-tutorial="vault-pin-best"]',
    placement: 'bottom',
  },
  {
    id: 'drag-to-best-take',
    title: 'Best Take Box',
    body: 'Long-press and drag any take into the Best Take box to make it your current featured recording.',
    selector: '[data-tutorial="best-take-box"]',
    placement: 'top',
  },
  {
    id: 'vault-expand-mode',
    title: 'Expand Mode',
    body: 'Expand a take to focus on playback, comparison tools, and imported media.',
    selector: '[data-tutorial="vault-expand"]',
    placement: 'bottom',
  },
  {
    id: 'vault-settings',
    title: 'Vault Settings',
    body: 'Long-press the settings widget inside the Take Vault to access additional organization and display options.',
    selector: '[data-tutorial="vault-settings"]',
    placement: 'bottom',
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
    body: 'Hands-free practice starts and stops around your playing so you can stay with your instrument.',
    bullets: ['Long-press Record in Audio Mode', 'Use Settings for Camera Mode', 'BestTake plays takes back automatically'],
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
    body: 'Expand Mode gives the practice workspace more room for media, playback, and comparison.',
    bullets: ['Use it for deeper review', 'Exit anytime', 'Great for imported references'],
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
    body: 'Practice with reference material directly beside your recordings.',
    bullets: ['Use YouTube for play-alongs', 'Upload files for references', 'Keep media separate from your takes'],
  },
  {
    id: 'metronome',
    title: 'Metronome',
    body: 'Build timing with tempo, time signatures, subdivisions, and click sounds.',
    bullets: ['Spin the tempo wheel', 'Use tap tempo', 'Choose subdivisions and accents'],
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
export const COACH_STORAGE_KEY = 'sessionmirror:tutorial:coach-seen-v1'
