export type OnboardingCardId = 'welcome' | 'instrument' | 'routine' | 'closing'

export type CoachMarkId =
  | 'record-camera-take'
  | 'pin-current-as-best'
  | 'record-comparison-take'
  | 'swap-take-cards'
  | 'move-take-cards'
  | 'open-overlays'
  | 'close-overlays'
  | 'discover-multitrack'
  | 'open-expand-view'
  | 'resize-expand-view'
  | 'close-expand-view'
  | 'switch-to-practice'
  | 'visit-metronome'
  | 'visit-tuner'
  | 'visit-games'
  | 'return-to-audio'
  | 'open-practice-home'
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
  | 'multitrack'
  | 'practice-games'
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
  /** Label on the card's forward control. */
  cta: string
  highlights?: string[]
}

export interface CoachMarkContent {
  id: CoachMarkId
  title: string
  body: string
  selector: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  advance: CoachMarkAdvance
  continueHint: string
  icon?: 'overlays' | 'multitrack'
  instructions?: string[]
  requiresSplitView?: 'open' | 'closed'
  requiresRecordingMode?: 'video' | 'audio'
  requiresAudioPracticeTab?: 'audio' | 'metronome' | 'tuner' | 'practice' | 'games'
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
    body: 'Take a tour.',
    cta: 'Begin tour',
  },
  {
    id: 'instrument',
    title: 'What do you play?',
    body: 'So the tuner shows your written notes, not concert pitch.',
    cta: 'Continue',
  },
  {
    id: 'routine',
    title: 'Lay out your daily routine',
    body: 'A short checklist. Each step opens the right tool, set the way you want it.',
    cta: 'Skip for now',
  },
  {
    id: 'closing',
    title: 'Record your best take',
    body: 'Then beat it.',
    cta: 'Start tour',
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
    title: 'Move a Take Card',
    body: 'Use the picture area of the card for this gesture. The text label is for swapping takes.',
    selector: '[data-movable-take-card="true"]',
    placement: 'top',
    advance: 'take-card-layout-finished',
    continueHint: 'Keep your finger down until step 3.',
    instructions: [
      'Press and hold the picture without moving.',
      'Wait for the vibration and wiggle.',
      'Keep holding, then drag the card to a new spot.',
      'Lift your finger and tap outside the cards.',
    ],
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
  {
    id: 'open-overlays',
    title: 'Open Workspace',
    body: 'The stacked-layers icon opens quick controls for the recorder and comparison layout.',
    selector: '[data-tutorial="overlays-button"]',
    placement: 'top',
    advance: 'overlays-opened',
    continueHint: 'Tap Workspace.',
    icon: 'overlays',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
  },
  {
    id: 'discover-multitrack',
    title: 'Build a Multitrack',
    body: 'Multitrack now lives here in Workspace, ready when you want to layer separate performances into one project.',
    selector: '[data-tutorial="multitrack-button"]',
    placement: 'top',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    icon: 'multitrack',
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
    body: 'Puts you back in Camera Mode.',
    selector: '[data-tutorial="best-take-collapse"]',
    placement: 'left',
    advance: 'split-view-close',
    continueHint: 'Tap the collapse button.',
    requiresSplitView: 'open',
    requiresRecordingMode: 'video',
  },
  {
    id: 'switch-to-practice',
    title: 'Open Tools',
    body: 'Tap Tools to open Audio, Metronome, Tuner, and Practice routines.',
    selector: '[data-tutorial="practice-button"]',
    placement: 'top',
    advance: 'audio-mode',
    continueHint: 'Tap Tools.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'video',
    requiresVault: 'closed',
  },
  {
    id: 'visit-metronome',
    title: 'Open the Metronome',
    body: 'Tempo, time signature, subdivision, and timed practice routines.',
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
    body: 'Live pitch and cents, plus drones you can hold under a passage.',
    selector: '[data-tutorial="audio-tab-tuner"]',
    placement: 'bottom',
    advance: 'audio-tab-tuner',
    continueHint: 'Tap Tuner.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'metronome',
  },
  {
    id: 'visit-games',
    title: 'Practice Games',
    body: 'Games opens Staff Jumper, Balance, and Learn for sight-reading, long tones, and fingerings.',
    selector: '[data-tutorial="audio-tab-games"]',
    placement: 'bottom',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'tuner',
  },
  {
    id: 'return-to-audio',
    title: 'Return to Record',
    body: 'Back to recording and comparing takes.',
    selector: '[data-tutorial="audio-tab-audio"]',
    placement: 'bottom',
    advance: 'audio-tab-audio',
    continueHint: 'Tap Record.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'tuner',
  },
  {
    id: 'open-practice-home',
    title: 'Practice Home',
    body: 'The house icon opens your hub: pick a practice mode, and reach the Take Vault holding every take you record.',
    selector: '[data-tutorial="home-button"]',
    placement: 'top',
    advance: 'tap-screen',
    continueHint: 'Tap anywhere to continue.',
    requiresSplitView: 'closed',
    requiresRecordingMode: 'audio',
    requiresAudioPracticeTab: 'audio',
    requiresVault: 'closed',
  },
  {
    id: 'open-settings',
    title: 'Open Settings',
    body: 'Your instrument, hands-free timing, and drone setup live here.',
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
    body: 'Put the tuner or metronome on your Lock Screen, Control Center, or Action Button.',
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
    body: 'Record video takes and compare them side by side.',
    bullets: [
      'Bottom pill: Practice Home, Workspace, Record, Tools, Settings',
      'Tap the full red Record button to start or stop a video take',
      'Drag a take label directly to swap Best and Current; hold the picture area to move the card',
      'Use Expand for a larger comparison or Multitrack to layer performances',
      'Tap Tools to move to the Audio workspace',
    ],
  },
  {
    id: 'audio-mode',
    title: 'Audio Mode',
    body: 'Record without video. Each take plays back the moment you stop.',
    bullets: [
      'Bottom pill: Practice Home, Workspace, Record, Camera, Settings',
      'Use Audio, Metronome, Tuner, and Games from the top tabs',
      'Open Program from Metronome to build a timed practice routine',
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
    title: 'Workspace',
    body: 'Tap the stacked-layers icon beside Record in Camera or Audio Mode to arrange the recorder and open related views.',
    bullets: [
      'Camera: Pitch Analysis, Take Cards, Metronome, Audio Enhancer, Hands-free, Expand View, and Multitrack',
      'Audio and tool tabs show the controls that fit the current workspace',
      'Tap a control to show, hide, or open it without visiting Settings',
      'Use the cog at the right end of the pill for full settings',
    ],
  },
  {
    id: 'multitrack',
    title: 'Multitrack',
    body: 'Open Workspace and tap Multitrack to layer separate performances into one project.',
    bullets: [
      'Record or assign a take to each performance panel',
      'Add a backing track, click, pitch guide, or sheet music when needed',
      'Balance the parts and align their starts before exporting',
    ],
  },
  {
    id: 'practice-games',
    title: 'Practice Games',
    body: 'Three games that listen to what you play. Nothing from the mic is saved.',
    bullets: [
      'Staff Jumper is sight-reading — pitch always, and rhythm against the click when the metronome is on',
      'Balance times how long you hold a note dead center',
      'Learn matches the written note to the real fingering, one note at a time',
    ],
  },
  {
    id: 'practice-sessions',
    title: 'Practice Routines',
    body: 'Open Program from the Metronome tab to build a passage or a whole program into timed sections you can run again.',
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
      'Open Workspace to show the draggable metronome in Camera or Audio Mode',
      'Pinch the floating metronome to resize; double-tap to reset its size',
    ],
  },
  {
    id: 'tuner-drones',
    title: 'Tuner & Drones',
    body: 'Live pitch on one side, a drone you can play against on the other.',
    bullets: [
      'Choose Voice, Strings, or Winds in Settings so detection suits your instrument',
      'Use Transpose on the right so the notes shown match what you read',
      'Play to see pitch direction and cents in real time',
      'Tap the large note to hold it as a drone; tap again to release',
      'Open Drone to scroll pitches, change octave, or build a major/minor chord',
      'Choose the drone waveform in Settings',
    ],
  },
  {
    id: 'pitch-insights',
    title: 'Pitch Insights',
    body: 'Shows where each of your notes actually tends to sit. Everything stays on your device.',
    bullets: [
      'Open Insights from the center button beneath the pitch graph',
      'Every stable note you hold in the tuner adds one reading, never audio',
      'A note needs a while before its tendency is worth trusting',
      'Open any note for its recent vs overall tendency and how consistent it is',
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
    body: 'Every recording saves here on its own, session by session.',
    bullets: [
      'Open Practice Home from the left end of the Camera or Audio pill, then tap Best Take Vault',
      'Search, sort, select, favorite, share, or delete takes',
      'Pin a take as Best Take or Current Take',
      'Open any recording full screen for focused review',
    ],
  },
  {
    id: 'take-cards',
    title: 'Take Cards',
    body: 'Two gestures on the same cards: drag the label to swap takes, hold the picture to move the card.',
    bullets: [
      'To swap takes, drag immediately from one card’s text label onto the other card',
      'To change the layout, press the picture area and hold still until the haptic and wiggle begin',
      'Keep your finger down after the wiggle, then drag the card to its new position',
      'In layout mode, drag either card anywhere within the screen and tap outside when finished',
      'Positions persist after closing the app; Reset restores the original layout',
    ],
  },
  {
    id: 'pinning-best-takes',
    title: 'Best Take Pinning',
    body: 'Pin a take as Best when you want something to beat on the next run.',
    bullets: [
      'Pin Current Take from its card or choose a take in the Vault',
      'Drag Current Take directly onto Best Take to promote it; the previous Best moves to Current',
    ],
  },
  {
    id: 'drag-to-best-take',
    title: 'Swap Best & Current',
    body: 'Drag straight from a take’s text label onto the other card.',
    bullets: [
      'Current onto Best promotes it, and the old Best drops to Current',
      'Best onto Current swaps them back the same way',
      'Dragging the picture area instead moves the card — wait for the wiggle',
    ],
  },
  {
    id: 'expand-mode',
    title: 'Expand View',
    body: 'A bigger split screen for takes, imported references, and YouTube.',
    bullets: [
      'Open Workspace and tap Expand View',
      'Drag the middle divider to give either side more room',
      'Load YouTube or upload audio and video references while expanded',
      'Tap the collapse control to return to the normal Camera layout',
    ],
  },
  {
    id: 'vault-settings',
    title: 'Vault Settings',
    body: 'Search, sort, and clean up a long session.',
    bullets: [
      'Use search and sort to narrow a long session',
      'Select multiple takes to act on them at once',
      'Deleting a take is usually permanent, so check before you confirm',
    ],
  },
  {
    id: 'media-youtube',
    title: 'Media & YouTube',
    body: 'Practice beside a reference recording without mixing it into your saved takes.',
    bullets: [
      'Open Expand View for the clearest side-by-side layout',
      'Load a YouTube play-along or upload an audio or video reference',
      'Use headphones, or the mic will pick up the reference along with you',
    ],
  },
  {
    id: 'reset-tutorials',
    title: 'Reset Tutorials',
    body: 'Run the intro cards and the guided tour again. Your recordings and settings are untouched.',
    bullets: [],
  },
]

// Versioned so users who completed the older interface tutorial see this revised walkthrough.
export const ONBOARDING_STORAGE_KEY = 'sessionmirror:tutorial:onboarding-complete-v7'
export const COACH_STORAGE_KEY = 'sessionmirror:tutorial:coach-seen-v8'
