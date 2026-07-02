import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
}

interface TutorialProviderProps {
  active: boolean
  stepIndex?: number
  onStepIndexChange?: (index: number) => void
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

export function TutorialProvider({ active, children }: TutorialProviderProps) {
  const [activeCoachMark, setActiveCoachMark] = useState<CoachMarkContent | null>(null)
  const [activeTargetRect, setActiveTargetRect] = useState<DOMRect | null>(null)

  const dismissCoachMark = useCallback(() => {
    setActiveCoachMark((current) => {
      if (current) markCoachMarkSeen(current.id)
      return null
    })
    setActiveTargetRect(null)
  }, [])

  const markCoachMark = useCallback((id: CoachMarkId) => {
    markCoachMarkSeen(id)
    setActiveCoachMark((current) => (current?.id === id ? null : current))
  }, [])

  const skipCoachMarks = useCallback(() => {
    markAllCoachMarksSeen()
    setActiveCoachMark(null)
    setActiveTargetRect(null)
  }, [])

  useEffect(() => {
    if (active || activeCoachMark || typeof document === 'undefined') return

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return

      for (const coachMark of COACH_MARKS) {
        if (hasSeenCoachMark(coachMark.id)) continue
        const target = findVisibleTarget(coachMark.selector)
        if (!target) continue
        setActiveCoachMark(coachMark)
        setActiveTargetRect(target.getBoundingClientRect())
        return
      }
    }, 900)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, activeCoachMark])

  useEffect(() => {
    if (!activeCoachMark || typeof window === 'undefined') return

    const updateRect = () => {
      const target = findVisibleTarget(activeCoachMark.selector)
      if (!target) {
        dismissCoachMark()
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
  }, [activeCoachMark, dismissCoachMark])

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
