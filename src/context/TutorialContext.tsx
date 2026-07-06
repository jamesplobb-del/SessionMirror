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
import { COACH_MARKS, type CoachMarkContent, type CoachMarkId } from '../utils/tutorialContent'
import {
  hasSeenCoachMark,
  markAllCoachMarksSeen,
  markCoachMarkSeen,
} from '../utils/onboardingTutorial'

interface TutorialContextValue {
  activeCoachMark: CoachMarkContent | null
  activeTargetRect: DOMRect | null
  dismissCoachMark: () => void
  skipCoachMarks: () => void
  markCoachMark: (id: CoachMarkId) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export interface TutorialSignals {
  isRecording: boolean
  isReviewOpen: boolean
  isVaultOpen: boolean
  isSplitView: boolean
  autoSoundRecording: boolean
  recordingMode: 'video' | 'audio'
}

interface TutorialProviderProps {
  active: boolean
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
  return Boolean(findVisibleTarget(coachMark.selector))
}

export function TutorialProvider({ active, onComplete, signals, children }: TutorialProviderProps) {
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
      if (!current || current.advance !== 'dismiss') return current
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

  const markCoachMark = useCallback(
    (id: CoachMarkId) => {
      if (id === 'youtube-opened' || id === 'media-touched') {
        setActiveCoachMark((current) => {
          if (current?.id !== 'practice-media') return current
          markCoachMarkSeen('practice-media')
          return null
        })
        setActiveTargetRect(null)
        return
      }

      if (id !== 'branch-widget-selected' && id !== 'hands-free-toggled') return

      setActiveCoachMark((current) => {
        if (!current || current.advance !== 'branch-widget-or-hands-free') return current
        markCoachMarkSeen(current.id)
        return null
      })
      setActiveTargetRect(null)
    },
    [],
  )

  const skipCoachMarks = useCallback(() => {
    completeInteractiveTutorial()
  }, [completeInteractiveTutorial])

  const showNextCoachMark = useCallback(() => {
    for (const coachMark of COACH_MARKS) {
      if (hasSeenCoachMark(coachMark.id)) continue
      if (!coachMarkIsVisible(coachMark, signals)) continue
      const target = findVisibleTarget(coachMark.selector)
      if (!target) continue
      setActiveCoachMark(coachMark)
      setActiveTargetRect(target.getBoundingClientRect())
      return true
    }
    return false
  }, [signals])

  useEffect(() => {
    if (active || activeCoachMark || typeof document === 'undefined') return

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const shown = showNextCoachMark()
      if (!shown) {
        onCompleteRef.current?.()
      }
    }, 900)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, activeCoachMark, showNextCoachMark])

  useEffect(() => {
    if (active || activeCoachMark || typeof document === 'undefined') return

    const shown = showNextCoachMark()
    if (!shown && COACH_MARKS.every((coachMark) => hasSeenCoachMark(coachMark.id))) {
      onCompleteRef.current?.()
    }
  }, [active, activeCoachMark, showNextCoachMark, signals?.isSplitView, signals?.recordingMode])

  useEffect(() => {
    if (!activeCoachMark) return

    if (activeCoachMark.advance === 'split-open' && signals?.isSplitView) {
      advanceCoachMark(activeCoachMark)
      return
    }

    if (activeCoachMark.advance === 'split-close' && !signals?.isSplitView) {
      advanceCoachMark(activeCoachMark)
    }
  }, [activeCoachMark, advanceCoachMark, signals?.isSplitView])

  useEffect(() => {
    if (!activeCoachMark || activeCoachMark.advance !== 'branch-widget-or-hands-free') return
    if (hasSeenCoachMark(activeCoachMark.id)) {
      clearCoachMark()
    }
  }, [activeCoachMark, clearCoachMark])

  useEffect(() => {
    if (activeCoachMark || typeof document === 'undefined') return
    if (!COACH_MARKS.every((coachMark) => hasSeenCoachMark(coachMark.id))) return
    onCompleteRef.current?.()
  }, [activeCoachMark])

  useEffect(() => {
    if (!activeCoachMark || typeof window === 'undefined') return

    const updateRect = () => {
      const target = findVisibleTarget(activeCoachMark.selector)
      if (!target) {
        if (coachMarkIsVisible(activeCoachMark, signals)) return
        clearCoachMark()
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
  }, [activeCoachMark, clearCoachMark, signals])

  const value = useMemo(
    () => ({
      activeCoachMark,
      activeTargetRect,
      dismissCoachMark,
      skipCoachMarks,
      markCoachMark,
    }),
    [activeCoachMark, activeTargetRect, dismissCoachMark, markCoachMark, skipCoachMarks],
  )

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}

export function useTutorial(): TutorialContextValue | null {
  return useContext(TutorialContext)
}

export function useTutorialAction(): ((id: CoachMarkId) => void) | undefined {
  return useContext(TutorialContext)?.markCoachMark
}
