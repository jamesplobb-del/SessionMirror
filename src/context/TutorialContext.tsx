import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import {
  INTERACTIVE_TUTORIAL_STEPS,
  type InteractiveTutorialStep,
  type TutorialActionId,
} from '../utils/onboardingTutorial'

interface TutorialContextValue {
  active: boolean
  step: InteractiveTutorialStep
  stepIndex: number
  stepCount: number
  advanceStep: () => void
  previousStep: () => void
  notifyAction: (action: TutorialActionId) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export interface TutorialSignals {
  isRecording: boolean
  isReviewOpen: boolean
  isVaultOpen: boolean
  isSplitView: boolean
  autoSoundRecording: boolean
}

interface TutorialProviderProps {
  active: boolean
  stepIndex: number
  onStepIndexChange: (index: number) => void
  onComplete: () => void
  signals: TutorialSignals
  children: ReactNode
}

export function TutorialProvider({
  active,
  stepIndex,
  onStepIndexChange,
  onComplete,
  signals,
  children,
}: TutorialProviderProps) {
  const step = INTERACTIVE_TUTORIAL_STEPS[stepIndex] ?? INTERACTIVE_TUTORIAL_STEPS[0]
  const prevSignalsRef = useRef(signals)

  const advanceStep = useCallback(() => {
    if (stepIndex >= INTERACTIVE_TUTORIAL_STEPS.length - 1) {
      onComplete()
      return
    }
    onStepIndexChange(stepIndex + 1)
  }, [onComplete, onStepIndexChange, stepIndex])

  const previousStep = useCallback(() => {
    onStepIndexChange(Math.max(0, stepIndex - 1))
  }, [onStepIndexChange, stepIndex])

  const notifyAction = useCallback(
    (action: TutorialActionId) => {
      if (!active) return
      if (step.completeOn !== action) return
      advanceStep()
    },
    [active, advanceStep, step.completeOn],
  )

  useEffect(() => {
    if (!active) return

    const prev = prevSignalsRef.current
    const action = step.completeOn

    if (action === 'recording-started' && !prev.isRecording && signals.isRecording) {
      notifyAction('recording-started')
    } else if (action === 'review-opened' && !prev.isReviewOpen && signals.isReviewOpen) {
      notifyAction('review-opened')
    } else if (action === 'vault-opened' && !prev.isVaultOpen && signals.isVaultOpen) {
      notifyAction('vault-opened')
    } else if (
      action === 'auto-record-enabled' &&
      !prev.autoSoundRecording &&
      signals.autoSoundRecording
    ) {
      notifyAction('auto-record-enabled')
    } else if (action === 'split-opened' && !prev.isSplitView && signals.isSplitView) {
      notifyAction('split-opened')
    }

    prevSignalsRef.current = signals
  }, [active, notifyAction, signals, step.completeOn])

  const value = useMemo(
    () => ({
      active,
      step,
      stepIndex,
      stepCount: INTERACTIVE_TUTORIAL_STEPS.length,
      advanceStep,
      previousStep,
      notifyAction,
    }),
    [active, advanceStep, notifyAction, previousStep, step, stepIndex],
  )

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}

export function useTutorial(): TutorialContextValue | null {
  return useContext(TutorialContext)
}

export function useTutorialAction(): ((action: TutorialActionId) => void) | undefined {
  return useContext(TutorialContext)?.notifyAction
}
