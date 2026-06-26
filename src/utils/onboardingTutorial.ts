const STORAGE_KEY = 'sessionmirror:onboarding-complete'

export type TutorialIconId =
  | 'welcome'
  | 'record'
  | 'review'
  | 'vault'
  | 'auto'
  | 'expand'
  | 'youtube'
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
  body: string
  target: TutorialTargetId | null
  panelDock: TutorialPanelDock
  /** Auto-advance when this action fires; `manual` = button only. */
  completeOn: TutorialActionId | 'manual'
  primaryCta?: string
  hint?: string
}

export const INTERACTIVE_TUTORIAL_STEPS: InteractiveTutorialStep[] = [
  {
    id: 'welcome',
    icon: 'welcome',
    title: 'Welcome to BestTake',
    body: 'Record multiple takes, review your playing, and keep only your best performances.',
    target: null,
    panelDock: 'center',
    completeOn: 'manual',
    primaryCta: 'Continue',
  },
  {
    id: 'record',
    icon: 'record',
    title: 'Record a take',
    body: 'Tap Record to capture a take. BestTake automatically organizes everything into your project.',
    target: 'record-controls',
    panelDock: 'top',
    completeOn: 'recording-started',
    primaryCta: 'Next',
    hint: 'Try tapping the red record button',
  },
  {
    id: 'review',
    icon: 'review',
    title: 'Review Mode',
    body: 'Review your takes side-by-side and compare performances to find your strongest version.',
    target: 'review-mode-button',
    panelDock: 'bottom',
    completeOn: 'review-opened',
    primaryCta: 'Next',
    hint: 'Tap a take card to open Review Mode',
  },
  {
    id: 'vault',
    icon: 'vault',
    title: 'Take Vault',
    body: 'All of your recordings stay organized here so you can revisit and compare them anytime.',
    target: 'vault-button',
    panelDock: 'top',
    completeOn: 'vault-opened',
    primaryCta: 'Next',
    hint: 'Tap the folder button',
  },
  {
    id: 'auto-record',
    icon: 'auto',
    title: 'Hands-free practice',
    body: 'In Audio mode, turn on Auto Record to capture when you start playing and hear playback when you stop—no need to tap Record between reps.',
    target: 'auto-record-toggle',
    panelDock: 'top',
    completeOn: 'auto-record-enabled',
    primaryCta: 'Next',
    hint: 'Swipe to Audio, then tap the waveform button',
  },
  {
    id: 'expand',
    icon: 'expand',
    title: 'Expand view',
    body: 'Tap expand on Best Take for side-by-side compare with your live camera—great for posture, timing, and framing while you play.',
    target: 'best-take-expand',
    panelDock: 'bottom',
    completeOn: 'split-opened',
    primaryCta: 'Next',
    hint: 'Tap the expand icon on Best Take',
  },
  {
    id: 'youtube',
    icon: 'youtube',
    title: 'Play along',
    body: 'Paste a YouTube link on Best Take to practice along with any reference track or performance video.',
    target: 'best-take-youtube',
    panelDock: 'bottom',
    completeOn: 'youtube-opened',
    primaryCta: 'Next',
    hint: 'Tap YouTube on an empty Best Take slot',
  },
  {
    id: 'done',
    icon: 'done',
    title: "You're ready to practice!",
    body: 'Use BestTake like your camera app—but built specifically for musicians.',
    target: null,
    panelDock: 'center',
    completeOn: 'finish',
    primaryCta: 'Get Started',
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
