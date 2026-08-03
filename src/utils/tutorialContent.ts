export type OnboardingCardId = 'welcome'

export type CoachMarkId =
  | 'record-camera-take'
  | 'pin-current-as-best'
  | 'record-comparison-take'
  | 'swap-take-cards'
  | 'move-take-cards'
  | 'open-expand-view'
  | 'resize-expand-view'
  | 'close-expand-view'
  | 'switch-to-practice'
  | 'visit-metronome'
  | 'visit-tuner'
  | 'visit-practice'
  | 'return-to-audio'
  | 'open-take-vault'
  | 'close-take-vault'
  | 'open-settings'
  | 'open-quick-tools'

export type TutorialActionId =
  | 'youtube-opened'
  | 'media-touched'
  | 'branch-widget-selected'
  | 'camera-take-stopped'
  | 'current-take-pinned'
  | 'take-card-transfer-completed'
  | 'take-card-layout-entered'
  | 'take-card-layout-finished'
  | 'split-divider-dragged'
  | 'hands-free-enabled'
  | 'hands-free-disabled'
  | 'overlays-opened'
  | 'overlays-closed'
  | 'metronome-tempo-tapped'
  | 'tuner-drone-opened'
  | 'tuner-drone-closed'
  | 'quick-tools-opened'
  | 'quick-tools-metronome-selected'
  | 'quick-tool-setup-opened'
  | 'quick-tool-setup-closed'
  | 'practice-section-added'
  | 'practice-section-finished'

export type CoachMarkAdvance =
  | TutorialActionId
  | 'tap-screen'
  | 'recording-start'
  | 'recording-stop'
  | 'audio-mode'
  | 'audio-tab-audio'
  | 'audio-tab-metronome'
  | 'audio-tab-tuner'
  | 'audio-tab-practice'
  | 'split-view-open'
  | 'split-view-close'
  | 'vault-open'
  | 'vault-close'
  | 'settings-open'
  | 'settings-close'

export type HelpTopicId =
  | 'camera-mode'
  | 'audio-mode'
  | 'hands-free-recording'
  | 'overlays'
  | 'practice-sessions'
  | 'metronome'
  | 'tuner-drones'
  | 'pitch-insights'
  | 'quick-tools-access'
  | 'take-vault'
  | 'take-cards'
  | 'pinning-best-takes'
  | 'drag-to-best-take'
  | 'expand-mode'
  | 'vault-settings'
  | 'media-youtube'
  | 'reset-tutorials'

export interface OnboardingCard {
  id: OnboardingCardId
  kicker?: string
  title: string
  body: string
  highlights: string[]
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
  requiresAudioPracticeTab?: 'audio' | 'metronome' | 'tuner' | 'practice'
  requiresVault?: 'open' | 'closed'
  requiresSettings?: 'open' | 'closed'
  requiresCurrentTake?: boolean
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
    body: 'This short guided tour will walk you through Camera, comparison, Practice, Take Vault, and the iPhone quick tools.',
    highlights: ['Use each control to continue', 'Skip the tour at any time'],
  },
]

export const COACH_MARKS: CoachMarkContent[] = [
  {
    id: 'record-camera-take',
    title: 'Record a Take',
    body: 'Tap Record, capture a few seconds, then tap it again to stop. Your take saves automatically.',
    selector: '[data-tutorial="record-controls"]',
    placement: 'top',
    advance: 'camera-take-stopped',
    continueHint: 'Record and stop a short take.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
  {
    id: 'pin-current-as-best',
    title: 'Choose Your Best Take',
    body: 'Pin the Current Take as your Best Take before arranging the comparison cards.',
    selector: '[data-tutorial="pin-current-as-best"]',
    placement: 'top',
    advance: 'current-take-pinned',
    continueHint: 'Tap the pin on Current Take.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
    requiresCurrentTake: true,
  },
  {
    id: 'record-comparison-take',
    title: 'Record One More Take',
    body: 'Record and stop a second short take so you have a Current Take to compare with your Best Take.',
    selector: '[data-tutorial="record-controls"]',
    placement: 'top',
    advance: 'camera-take-stopped',
    continueHint: 'Record and stop one more take.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
  {
    id: 'swap-take-cards',
    title: 'Swap Takes',
    body: 'Drag the Current Take label directly onto Best Take. The previous Best moves to Current. Dragging the other way swaps them back.',
    selector: '[data-tutorial="drag-current-to-best"]',
    placement: 'top',
    advance: 'take-card-transfer-completed',
    continueHint: 'Drag Current Take directly onto Best Take.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
    requiresCurrentTake: true,
  },
  {
    id: 'move-take-cards',
    title: 'Arrange the Take Cards',
    body: 'This is a different gesture: press and hold a card until it wiggles, then reposition it. Tap an empty area when done.',
    selector: '[data-movable-take-card="true"]',
    placement: 'top',
    advance: 'take-card-layout-finished',
    continueHint: 'Hold for the haptic, move, then tap outside.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
  {
    id: 'open-expand-view',
    title: 'Easy Comparison',
    body: 'Tap Expand View to open the larger Best Take and Current Camera layout.',
    selector: '[data-tutorial="expand-view-button"]',
    placement: 'top',
    advance: 'split-view-open',
    continueHint: 'Tap Expand View.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
  {
    id: 'resize-expand-view',
    title: 'Resize the Comparison',
    body: 'Drag the middle handle up or down to resize the two areas.',
    selector: '[data-tutorial="split-divider"]',
    placement: 'right',
    advance: 'split-divider-dragged',
    continueHint: 'Drag the middle handle.',
    requiresSplitView: 'open',
    requiresRecordingMode: 'video',
  },
  {
    id: 'close-expand-view',
    title: 'Close Expand View',
    body: 'Tap the collapse button to return to Camera Mode.',
    selector: '[data-tutorial="best-take-collapse"]',
    placement: 'left',
    advance: 'split-view-close',
    continueHint: 'Tap the collapse button.',
    requiresSplitView: 'open',
    requiresRecordingMode: 'video',
  },
  {
    id: 'switch-to-practice',
    title: 'Open Practice',
    body: 'Tap Practice to open Audio, Metronome, Tuner, and Practice routines.',
    selector: '[data-tutorial="practice-button"]',
    placement: 'top',
    advance: 'audio-mode',
    continueHint: 'Tap Practice.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
    requiresVault: 'closed',
  },
  {
    id: 'visit-metronome',
    title: 'Open the Metronome',
    body: 'Tap Metronome.',
    selector: '[data-tutorial="audio-tab-metronome"]',
    placement: 'bottom',
    advance: 'audio-tab-metronome',
    continueHint: 'Tap Metronome.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'audio',
  },
  {
    id: 'visit-tuner',
    title: 'Try the Tuner',
    body: 'Tap Tuner for live pitch feedback and reference drones.',
    selector: '[data-tutorial="audio-tab-tuner"]',
    placement: 'bottom',
    advance: 'audio-tab-tuner',
    continueHint: 'Tap Tuner.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'metronome',
  },
  {
    id: 'visit-practice',
    title: 'See Practice Routines',
    body: 'Tap Practice to build reusable routines from timed sections.',
    selector: '[data-tutorial="audio-tab-practice"]',
    placement: 'bottom',
    advance: 'audio-tab-practice',
    continueHint: 'Tap Practice.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'tuner',
  },
  {
    id: 'return-to-audio',
    title: 'Return to Audio',
    body: 'Tap Audio to return to recording and take comparison.',
    selector: '[data-tutorial="audio-tab-audio"]',
    placement: 'bottom',
    advance: 'audio-tab-audio',
    continueHint: 'Tap Audio.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'practice',
  },
  {
    id: 'open-take-vault',
    title: 'Open the Take Vault',
    body: 'Tap Take Vault to see saved recordings.',
    selector: '[data-tutorial="vault-button"]',
    placement: 'top',
    advance: 'vault-open',
    continueHint: 'Tap Take Vault.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'audio',
    requiresVault: 'closed',
  },
  {
    id: 'close-take-vault',
    title: 'Close the Take Vault',
    body: 'Search, sort, pin, trim, and share takes here. Tap Close to continue.',
    selector: '[data-tutorial="vault-close"]',
    placement: 'left',
    advance: 'vault-close',
    continueHint: 'Tap Close.',
    requiresVault: 'open',
  },
  {
    id: 'open-settings',
    title: 'Open Settings',
    body: 'Tap the cog to open Settings.',
    selector: '[data-tutorial="settings-button"]',
    placement: 'top',
    advance: 'settings-open',
    continueHint: 'Tap the cog.',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'audio',
    requiresVault: 'closed',
    requiresSettings: 'closed',
  },
  {
    id: 'open-quick-tools',
    title: 'iPhone Quick Tools',
    body: 'Open Quick Tools Access. Tuner and Metronome each include setup for the Action Button, Lock Screen widget/control, and Control Center.',
    selector: '[data-tutorial="quick-tools-access"]',
    placement: 'bottom',
    advance: 'quick-tools-opened',
    continueHint: 'Tap Quick Tools Access.',
    requiresSettings: 'open',
  },
]

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'camera-mode',
    title: 'Camera Mode',
    body: 'Camera Mode keeps visual technique, quick comparison, and the controls you use most in one view.',
    bullets: [
      'Bottom pill: Take Vault, Overlays, Record, Practice, Settings',
      'Tap the full red Record button to start or stop a video take',
      'Drag a take label directly to swap Best and Current; hold a card to move its layout',
      'Use Expand View directly above Record for a larger comparison',
      'Tap Practice to move to the Audio workspace',
    ],
  },
  {
    id: 'audio-mode',
    title: 'Audio Mode',
    body: 'Audio Mode is the fast-listening home inside Practice, with a calm idle waveform and immediate playback after each take.',
    bullets: [
      'Bottom pill: Take Vault, Overlays, Record, Camera, Settings',
      'Use Audio, Metronome, Tuner, and Practice from the top tabs',
      'Tap Camera to return to video recording',
      'Best Take and Current Take stay ready for quick comparison',
    ],
  },
  {
    id: 'hands-free-recording',
    title: 'Hands-Free Recording',
    body: 'Press and hold Record to toggle practice that starts and stops around your playing.',
    bullets: [
      'Works with both Camera and Audio recording',
      'Pre-roll helps preserve the beginning of the first note',
      'Recording stops after the silence duration set in Settings',
      'BestTake plays each completed take back automatically',
    ],
  },
  {
    id: 'overlays',
    title: 'Overlays',
    body: 'Tap Overlays beside Record in Camera or Audio Mode to open the centered on-screen tools menu.',
    bullets: [
      'Camera: Pitch Analysis, Take Cards, Metronome, and Audio Enhancer',
      'Audio and tool tabs show the overlays that fit the current workspace',
      'Tap an overlay to show or hide it without opening Settings',
      'Use the cog at the right end of the pill for full settings',
    ],
  },
  {
    id: 'practice-sessions',
    title: 'Practice Routines',
    body: 'The Practice tab turns a difficult passage or full program into a reusable sequence of timed sections.',
    bullets: [
      'Add sections with bars, tempo, time signature, feel, and repeats',
      'Drag section cards to reorder the routine',
      'Use count-ins, looping, tempo changes, and meter patterns',
      'Enable recording before Start Practice to save the run as a take',
    ],
  },
  {
    id: 'metronome',
    title: 'Metronome',
    body: 'Use the full Metronome tab for detailed timing work, or show its floating overlay while recording.',
    bullets: [
      'Swipe vertically on BPM, use +/−, type a tempo, or tap it in',
      'Choose Time, Rhythm, pulse, beat grouping, accents, and Sound',
      'Open Overlays to show the draggable metronome in Camera or Audio Mode',
      'Pinch the floating metronome to resize; double-tap to reset its size',
    ],
  },
  {
    id: 'tuner-drones',
    title: 'Tuner & Drones',
    body: 'The Tuner tab combines responsive live pitch with sustained reference tones for intonation practice.',
    bullets: [
      'Choose Voice, Strings, or Winds in Settings for note guidance',
      'Use Transpose on the right so displayed notes match your instrument’s written pitch',
      'Play to see pitch direction and cents in real time',
      'Tap drone notes on or off, or combine notes into chords',
      'Adjust drone volume and waveform in Settings',
    ],
  },
  {
    id: 'pitch-insights',
    title: 'Pitch Insights',
    body: 'Pitch Insights learns where your stable notes tend to sit while you use the tuner. Everything stays on your device.',
    bullets: [
      'Open Insights from the center button beneath the pitch graph',
      'BestTake saves one derived observation per stable held note—not raw audio or tuner frames',
      'Each note moves from Collecting Data to Early and Established tendencies as evidence grows',
      'Open a note for recent versus overall tendency, consistency, and a lightweight trend',
    ],
  },
  {
    id: 'quick-tools-access',
    title: 'Quick Tuner & Metronome',
    body: 'Open either lightweight tool directly from iOS. In BestTake, open Settings › Quick Tools Access and select Tuner or Metronome for the full setup guides.',
    bullets: [
      'Lock Screen widget/control (iOS 18+): customize a bottom control slot and search BestTake',
      'Control Center (iOS 18+): Add a Control, search BestTake, then place Quick Tuner or Metronome',
      'Action Button: choose Controls or Shortcut in iOS Settings, then select the BestTake tool',
      'Siri, Shortcuts, and long-press app icon actions can also open either tool directly',
    ],
  },
  {
    id: 'take-vault',
    title: 'Take Vault',
    body: 'The Take Vault saves recordings automatically and keeps each session’s references and new work together.',
    bullets: [
      'Open it from the left end of the Camera or Audio pill',
      'Search, sort, select, favorite, trim, share, or delete takes',
      'Pin a take as Best Take or Current Take',
      'Open any recording full screen for focused review',
    ],
  },
  {
    id: 'take-cards',
    title: 'Take Cards',
    body: 'Best Take and Current Take support two distinct gestures: a direct take swap and a held layout move.',
    bullets: [
      'To swap takes, drag immediately from one card’s text label onto the other card',
      'To change the layout, hold a card until the haptic and wiggle begin, then move it',
      'In layout mode, drag either card anywhere within the screen and tap outside when finished',
      'Positions persist after closing the app; Reset restores the original layout',
    ],
  },
  {
    id: 'pinning-best-takes',
    title: 'Best Take Pinning',
    body: 'Pin a performance as Best Take when you want a stable reference for the repetitions that follow.',
    bullets: [
      'Pin Current Take from its card or choose a take in the Vault',
      'Drag Current Take directly onto Best Take to promote it; the previous Best moves to Current',
      'Pinning does not duplicate or remove the original recording',
    ],
  },
  {
    id: 'drag-to-best-take',
    title: 'Swap Best & Current',
    body: 'Drag immediately from a take’s text label to the other card. This is intentionally different from holding a card to rearrange the layout.',
    bullets: [
      'Current to Best promotes the new reference and moves the previous Best to Current',
      'Best to Current performs the same two-way swap in reverse',
      'For layout changes, wait for the haptic and wiggle before dragging',
      'Swapping never deletes either recording from the Take Vault',
    ],
  },
  {
    id: 'expand-mode',
    title: 'Expand View',
    body: 'Expand View creates a larger split comparison for takes, imported references, and YouTube practice material.',
    bullets: [
      'In Camera Mode, tap Expand View directly above Record',
      'Drag the middle divider to give either side more room',
      'Load YouTube or upload audio and video references while expanded',
      'Tap the collapse control to return to the normal Camera layout',
    ],
  },
  {
    id: 'vault-settings',
    title: 'Vault Settings',
    body: 'Vault controls keep organization, selection, and cleanup actions close to saved recordings.',
    bullets: [
      'Use search and sort to narrow a long session',
      'Select multiple takes for batch actions',
      'Use destructive actions carefully; deleted takes cannot always be recovered',
    ],
  },
  {
    id: 'media-youtube',
    title: 'Media & YouTube',
    body: 'Practice beside a reference recording without mixing it into your saved takes.',
    bullets: [
      'Open Expand View for the clearest side-by-side layout',
      'Load a YouTube play-along or upload an audio or video reference',
      'Reference media stays separate from your Take Vault recordings',
      'Use headphones to reduce reference sound bleeding into the microphone',
    ],
  },
  {
    id: 'reset-tutorials',
    title: 'Reset Tutorials',
    body: 'Replay the updated introduction and contextual coach marks whenever you want a fresh walkthrough.',
    bullets: [
      'Restarts the onboarding cards',
      'Restarts the guided Camera and Practice tour',
      'Does not change recordings, routines, or app settings',
    ],
  },
]

// Versioned so users who completed the older interface tutorial see this revised walkthrough.
export const ONBOARDING_STORAGE_KEY = 'sessionmirror:tutorial:onboarding-complete-v5'
export const COACH_STORAGE_KEY = 'sessionmirror:tutorial:coach-seen-v6'
