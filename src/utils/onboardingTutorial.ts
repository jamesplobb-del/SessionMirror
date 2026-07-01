const STORAGE_KEY = 'sessionmirror:native-guide-complete-v2'

export type TutorialIconId =
  | 'welcome'
  | 'camera'
  | 'takes'
  | 'expand'
  | 'media'
  | 'handsfree'
  | 'audio'
  | 'tools'
  | 'settings'
  | 'done'

export type TutorialTargetId =
  | 'record-controls'
  | 'review-mode-button'
  | 'vault-button'
  | 'auto-record-toggle'
  | 'best-take-expand'
  | 'best-take-youtube'

export type TutorialActionId =
  | 'recording-started'
  | 'review-opened'
  | 'vault-opened'
  | 'auto-record-enabled'
  | 'split-opened'
  | 'youtube-opened'
  | 'finish'

export type TutorialPanelDock = 'top' | 'bottom' | 'center'

export interface InteractiveTutorialStep {
  id: string
  icon: TutorialIconId
  title: string
  eyebrow: string
  body: string
  bullets: string[]
  visual: 'camera' | 'takes' | 'split' | 'media' | 'handsfree' | 'audio' | 'tools' | 'settings' | 'done'
  target: TutorialTargetId | null
  panelDock: TutorialPanelDock
  completeOn: TutorialActionId | 'manual'
  primaryCta?: string
  hint?: string
}

export const INTERACTIVE_TUTORIAL_STEPS: InteractiveTutorialStep[] = [
  {
    id: 'welcome',
    icon: 'welcome',
    eyebrow: 'BestTake guide',
    title: 'A camera app for musicians',
    body: 'BestTake is built around quick recording, fast comparison, and simple practice tools so you can stay focused on playing.',
    bullets: ['Record video or audio takes', 'Compare Current Take against Best Take', 'Open tools without leaving your practice flow'],
    visual: 'camera',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Start Tour',
  },
  {
    id: 'camera-takes',
    icon: 'takes',
    eyebrow: 'Camera Mode',
    title: 'Use the take boxes as your workspace',
    body: 'The two boxes are the heart of Camera Mode. Current Take is the thing you just recorded. Best Take is the reference you want to compare against.',
    bullets: ['Drag or pin a take into Best Take', 'Tap a take to review it fullscreen', 'Use the Vault when you want to pull older takes back in'],
    visual: 'takes',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'expand-mode',
    icon: 'expand',
    eyebrow: 'Compare',
    title: 'Expand Mode gives you a bigger comparison view',
    body: 'Expand opens a cleaner split view for checking posture, framing, timing, and performance differences without changing how takes are stored.',
    bullets: ['Best Take stays on top', 'Current Take stays below', 'Exit anytime to return to the normal camera screen'],
    visual: 'split',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'media-youtube',
    icon: 'media',
    eyebrow: 'References',
    title: 'Add YouTube or media references',
    body: 'Best Take can hold more than recordings. Add a YouTube reference or upload media when you want to practice against something specific.',
    bullets: ['Use YouTube for play-along references', 'Upload media from your files', 'Keep references separate from the original take data'],
    visual: 'media',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'handsfree-camera',
    icon: 'handsfree',
    eyebrow: 'Hands-free',
    title: 'Practice without touching the screen',
    body: 'Hands-free practice listens for your playing, records when you begin, and plays back when you stop so you can repeat takes naturally.',
    bullets: ['Use it in Camera Mode for video practice', 'Use it in Audio Mode for quick reps', 'Long-press Record in Audio Mode to toggle it'],
    visual: 'handsfree',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'audio-mode',
    icon: 'audio',
    eyebrow: 'Audio Mode',
    title: 'Audio Mode is built for focused practice',
    body: 'Audio Mode keeps recording, review, and the best/current take flow in one clean screen with audio-first playback.',
    bullets: ['Record with the mic button', 'Review Current Take and Best Take instantly', 'Use the same Vault and Settings controls'],
    visual: 'audio',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'metronome-tuner',
    icon: 'tools',
    eyebrow: 'Practice tools',
    title: 'Metronome and Tuner live inside Audio Mode',
    body: 'Switch tabs to use the metronome, tuner, pitch graph, drone tools, and take playback without leaving the audio practice screen.',
    bullets: ['Metronome: tempo wheel, tap tempo, subdivisions, sounds', 'Tuner: pitch graph, drone wheel, note feedback', 'Take pills can help review while tuning'],
    visual: 'tools',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'settings',
    icon: 'settings',
    eyebrow: 'Customize',
    title: 'Settings shape the app around your setup',
    body: 'Settings hold the musician-focused options: audio enhancement, mic preference, dark mode, take card behavior, tuner profile, and experimental tools.',
    bullets: ['Choose iPhone mic or headphone mic behavior', 'Adjust Enhanced Audio for your instrument or voice', 'Turn dark mode and visual preferences on or off'],
    visual: 'settings',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Next',
  },
  {
    id: 'done',
    icon: 'done',
    eyebrow: 'Ready',
    title: 'You are ready to practice',
    body: 'Record, compare, analyze, and share without turning your practice session into an editing session.',
    bullets: ['Camera for visual practice', 'Audio for fast reps', 'Creator tools when you are ready to share'],
    visual: 'done',
    target: null,
    panelDock: 'center',
    completeOn: 'finish',
    primaryCta: 'Start Practicing',
  },
]

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* private mode / quota */
  }
}

export function resetOnboardingComplete(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode / quota */
  }
}

export function getTutorialTargetSelector(target: TutorialTargetId): string {
  return `[data-tutorial="${target}"]`
}
