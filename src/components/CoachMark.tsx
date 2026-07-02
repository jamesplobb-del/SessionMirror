import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import Pressable from './ui/Pressable'
import { useTutorial } from '../context/TutorialContext'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'

export default function CoachMark() {
  const tutorial = useTutorial()
  const coachMark = tutorial?.activeCoachMark
  const targetRect = tutorial?.activeTargetRect
  const cardRef = useRef<HTMLDivElement>(null)
  const [measuredCardHeight, setMeasuredCardHeight] = useState(0)

  useLayoutEffect(() => {
    if (!coachMark || !targetRect) return
    const card = cardRef.current
    if (!card) return

    const updateHeight = () => {
      setMeasuredCardHeight(card.getBoundingClientRect().height)
    }

    updateHeight()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateHeight)
    observer.observe(card)
    return () => observer.disconnect()
  }, [coachMark, targetRect])

  if (!coachMark || !targetRect || typeof document === 'undefined') return null

  const width = Math.min(280, window.innerWidth - 28)
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  const cardHeight = Math.max(measuredCardHeight || 0, 158)
  const targetCenter = targetRect.left + targetRect.width / 2
  const targetMiddle = targetRect.top + targetRect.height / 2
  const canShowLeft = targetRect.left >= width + 28
  const canShowRight = window.innerWidth - targetRect.right >= width + 28
  const sidePlacement =
    coachMark.placement === 'left' && canShowLeft
      ? 'left'
      : coachMark.placement === 'right' && canShowRight
        ? 'right'
        : null
  const shouldShowBelow =
    !sidePlacement && (coachMark.placement === 'bottom' || targetRect.top < 170)
  const clampTop = (value: number) =>
    Math.max(14, Math.min(Math.max(14, viewportHeight - cardHeight - 14), value))
  const left =
    sidePlacement === 'left'
      ? Math.max(14, targetRect.left - width - 14)
      : sidePlacement === 'right'
        ? Math.min(window.innerWidth - width - 14, targetRect.right + 14)
        : Math.max(14, Math.min(window.innerWidth - width - 14, targetCenter - width / 2))
  const top = sidePlacement
    ? clampTop(targetMiddle - cardHeight / 2)
    : shouldShowBelow
      ? clampTop(targetRect.bottom + 12)
      : clampTop(targetRect.top - cardHeight - 12)
  const arrowLeft = Math.max(18, Math.min(width - 18, targetCenter - left))
  const arrowTop = Math.max(20, Math.min(Math.max(20, cardHeight - 20), targetMiddle - top))
  const placementClass = sidePlacement
    ? `coach-mark-card--${sidePlacement}`
    : shouldShowBelow
      ? 'coach-mark-card--below'
      : 'coach-mark-card--above'
  const canDismiss = coachMark.advance === 'dismiss'
  const initialOffset = sidePlacement === 'left' ? 8 : sidePlacement === 'right' ? -8 : 0
  const initialYOffset = sidePlacement ? 0 : shouldShowBelow ? -8 : 8

  return createPortal(
    <div className="coach-mark-layer fixed inset-0 z-[140] pointer-events-none" aria-live="polite">
      <motion.div
        className="coach-mark-target pointer-events-none"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{
          opacity: 1,
          scale: 1,
          x: targetRect.left - 6,
          y: targetRect.top - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
        }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={iosSpringSnappy}
        style={motionGpuLayer}
      />
      <motion.div
        ref={cardRef}
        className={`coach-mark-card pointer-events-auto ${placementClass}`}
        role="dialog"
        aria-label={coachMark.title}
        initial={{ opacity: 0, x: initialOffset, y: initialYOffset, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        exit={{ opacity: 0, x: initialOffset, y: initialYOffset, scale: 0.98 }}
        transition={iosSpringSnappy}
        style={{
          ...motionGpuLayer,
          left,
          top,
          width,
          '--coach-arrow-left': `${arrowLeft}px`,
          '--coach-arrow-top': `${arrowTop}px`,
        } as CSSProperties}
      >
        <div className="coach-mark-card__arrow" aria-hidden />
        <div className="coach-mark-card__copy">
          <h2>{coachMark.title}</h2>
          <p>{coachMark.body}</p>
          <p className="coach-mark-card__continue">{coachMark.continueHint}</p>
        </div>
        {canDismiss && (
          <Pressable
            type="button"
            intensity="icon"
            haptic="light"
            onClick={tutorial.dismissCoachMark}
            className="coach-mark-card__close"
            aria-label="Dismiss tip"
          >
            <X className="h-3.5 w-3.5" />
          </Pressable>
        )}
        <Pressable
          type="button"
          intensity="soft"
          haptic="light"
          onClick={tutorial.skipCoachMarks}
          className="coach-mark-card__skip"
        >
          Skip
        </Pressable>
      </motion.div>
    </div>,
    document.body,
  )
}
