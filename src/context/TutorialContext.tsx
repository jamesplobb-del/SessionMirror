import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  COACH_MARKS,
  type CoachMarkContent,
  type TutorialActionId,
} from '../utils/tutorialContent'
import {
  hasSeenCoachMark,
  markAllCoachMarksSeen,
  markCoachMarkSeen,
} from '../utils/onboardingTutorial'

interface TutorialContextValue {
  activeCoachMark: CoachMarkContent | null
  activeTargetRect: DOMRect | null
  activeStepNumber: number
  totalSteps: number
  dismissCoachMark: () => void
  skipCoachMarks: () => void
  markCoachMark: (id: TutorialActionId) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export interface TutorialSignals {
  isRecording: boolean
  isReviewOpen: boolean
  isVaultOpen: boolean
  isSplitView: boolean
  autoSoundRecording: boolean
  recordingMode: 'video' | 'audio'
  audioPracticeTab: 'audio' | 'metronome' | 'tuner' | 'practice'
}

interface TutorialProviderProps {
  active: boolean
  enabled: boolean
  onComplete?: () => void
  signals?: TutorialSignals
  children: ReactNode
}

function findVisibleTarget(selector: string): Element | null {
  const candidates = Array.from(document.querySelectorAll(selector))
  return (
    candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      return rect.width > 12 && rect.height > 12 && rect.bottom > 0 && rect.top < window.innerHeight
    }) ?? null
  )
}

function coachMarkIsVisible(coachMark: CoachMarkContent, signals?: TutorialSignals): boolean {
  if (coachMark.requiresSplitView === 'open' && !signals?.isSplitView) return false
  if (coachMark.requiresSplitView === 'closed' && signals?.isSplitView) return false
  if (coachMark.requiresRecordingMode && signals?.recordingMode !== coachMark.requiresRecordingMode) {
    return false
  }
  if (coachMark.requiresVault === 'open' && !signals?.isVaultOpen) return false
  if (coachMark.requiresVault === 'closed' && signals?.isVaultOpen) return false
  return Boolean(findVisibleTarget(coachMark.selector))
}

export function TutorialProvider({
  active,
  enabled,
  onComplete,
  signals,
  children,
}: TutorialProviderProps) {
  const [activeCoachMark, setActiveCoachMark] = useState<CoachMarkContent | null>(null)
  const [activeTargetRect, setActiveTargetRect] = useState<DOMRect | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const clearCoachMark = useCallback(() => {
    setActiveCoachMark(null)
    setActiveTargetRect(null)
  }, [])

  const advanceCoachMark = useCallback(
    (coachMark: CoachMarkContent) => {
      markCoachMarkSeen(coachMark.id)
      clearCoachMark()
    },
    [clearCoachMark],
  )

  const dismissCoachMark = useCallback(() => {
    setActiveCoachMark((current) => {
      if (!current || current.advance !== 'tap-screen') return current
      markCoachMarkSeen(current.id)
      return null
    })
    setActiveTargetRect(null)
  }, [])

  const completeInteractiveTutorial = useCallback(() => {
    markAllCoachMarksSeen()
    clearCoachMark()
    onCompleteRef.current?.()
  }, [clearCoachMark])

  const markCoachMark = useCallback((_id: TutorialActionId) => {}, [])

  const skipCoachMarks = useCallback(() => {
    completeInteractiveTutorial()
  }, [completeInteractiveTutorial])

  const showNextCoachMark = useCallback(() => {
    const coachMark = COACH_MARKS.find((candidate) => !hasSeenCoachMark(candidate.id))
    if (!coachMark || !coachMarkIsVisible(coachMark, signals)) return false
    const target = findVisibleTarget(coachMark.selector)
    if (!target) return false
    setActiveCoachMark(coachMark)
    setActiveTargetRect(target.getBoundingClientRect())
    return true
  }, [signals])

  useEffect(() => {
    if (!enabled || active || activeCoachMark || typeof document === 'undefined') return

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const shown = showNextCoachMark()
      if (!shown && COACH_MARKS.every((coachMark) => hasSeenCoachMark(coachMark.id))) {
        onCompleteRef.current?.()
      }
    }, 900)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, activeCoachMark, enabled, showNextCoachMark])

  useEffect(() => {
    if (!enabled || active || activeCoachMark || typeof document === 'undefined') return

    const shown = showNextCoachMark()
    if (!shown && COACH_MARKS.every((coachMark) => hasSeenCoachMark(coachMark.id))) {
      onCompleteRef.current?.()
    }
  }, [
    active,
    activeCoachMark,
    enabled,
    showNextCoachMark,
    signals?.audioPracticeTab,
    signals?.isSplitView,
    signals?.isVaultOpen,
    signals?.recordingMode,
  ])

  useEffect(() => {
    if (!activeCoachMark) return

    if (activeCoachMark.advance === 'audio-mode' && signals?.recordingMode === 'audio') {
      advanceCoachMark(activeCoachMark)
      return
    }

    if (
      activeCoachMark.advance === 'audio-tab-metronome' &&
      signals?.audioPracticeTab === 'metronome'
    ) {
      advanceCoachMark(activeCoachMark)
      return
    }

    if (
      activeCoachMark.advance === 'audio-tab-tuner' &&
      signals?.audioPracticeTab === 'tuner'
    ) {
      advanceCoachMark(activeCoachMark)
      return
    }

    if (activeCoachMark.advance === 'vault-open' && signals?.isVaultOpen) {
      advanceCoachMark(activeCoachMark)
      return
    }

    if (activeCoachMark.advance === 'vault-close' && !signals?.isVaultOpen) {
      advanceCoachMark(activeCoachMark)
    }
  }, [
    activeCoachMark,
    advanceCoachMark,
    signals?.audioPracticeTab,
    signals?.isVaultOpen,
    signals?.recordingMode,
  ])

  useEffect(() => {
    if (enabled && !active) return
    clearCoachMark()
  }, [active, clearCoachMark, enabled])

  useEffect(() => {
    if (!enabled || active || activeCoachMark || typeof document === 'undefined') return
    if (!COACH_MARKS.every((coachMark) => hasSeenCoachMark(coachMark.id))) return
    onCompleteRef.current?.()
  }, [active, activeCoachMark, enabled])

  useEffect(() => {
    if (!activeCoachMark || typeof window === 'undefined') return

    const updateRect = () => {
      const target = findVisibleTarget(activeCoachMark.selector)
      if (!target || !coachMarkIsVisible(activeCoachMark, signals)) {
        setActiveTargetRect(null)
        return
      }
      setActiveTargetRect(target.getBoundingClientRect())
    }

    window.addEventListener('resize', updateRect)
    window.visualViewport?.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    const interval = window.setInterval(updateRect, 450)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.visualViewport?.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
      window.clearInterval(interval)
    }
  }, [activeCoachMark, signals])

  const activeStepNumber = activeCoachMark
    ? Math.max(1, COACH_MARKS.findIndex((coachMark) => coachMark.id === activeCoachMark.id) + 1)
    : 0

  const value = useMemo(
    () => ({
      activeCoachMark,
      activeTargetRect,
      activeStepNumber,
      totalSteps: COACH_MARKS.length,
      dismissCoachMark,
      skipCoachMarks,
      markCoachMark,
    }),
    [
      activeCoachMark,
      activeStepNumber,
      activeTargetRect,
      dismissCoachMark,
      markCoachMark,
      skipCoachMarks,
    ],
  )

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}

export function useTutorial(): TutorialContextValue | null {
  return useContext(TutorialContext)
}

export function useTutorialAction(): ((id: TutorialActionId) => void) | undefined {
  return useContext(TutorialContext)?.markCoachMark
}
