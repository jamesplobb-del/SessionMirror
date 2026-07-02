import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { CSSProperties, PointerEvent } from 'react'
import Pressable from './ui/Pressable'
import { useTutorial } from '../context/TutorialContext'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'

const INTERACTIVE_TARGET_SELECTOR =
  'button, a, label, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'

function forwardTapToTarget(selector: string, x: number, y: number): void {
  const candidates = Array.from(document.querySelectorAll(selector))
  const target = candidates.find((candidate) => {
    const rect = candidate.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }) as HTMLElement | undefined

  if (!target) return

  const underlying = document
    .elementsFromPoint(x, y)
    .find((element) => {
      if (!(element instanceof HTMLElement)) return false
      if (element.closest('.coach-mark-layer')) return false
      return target.contains(element) && Boolean(element.closest(INTERACTIVE_TARGET_SELECTOR))
    }) as HTMLElement | undefined

  const interactive = underlying?.closest(INTERACTIVE_TARGET_SELECTOR) as HTMLElement | null
  ;(interactive ?? target).click()
}

export default function CoachMark() {
  const tutorial = useTutorial()
  const coachMark = tutorial?.activeCoachMark
  const targetRect = tutorial?.activeTargetRect

  if (!coachMark || !targetRect || typeof document === 'undefined') return null

  const width = Math.min(280, window.innerWidth - 28)
  const targetCenter = targetRect.left + targetRect.width / 2
  const left = Math.max(14, Math.min(window.innerWidth - width - 14, targetCenter - width / 2))
  const shouldShowBelow =
    coachMark.placement === 'bottom' || targetRect.top < 170
  const top = shouldShowBelow
    ? Math.min(window.innerHeight - 148, targetRect.bottom + 12)
    : Math.max(14, targetRect.top - 142)
  const arrowLeft = Math.max(18, Math.min(width - 18, targetCenter - left))

  const handleLayerPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const x = event.clientX
    const y = event.clientY
    if (
      x >= targetRect.left &&
      x <= targetRect.right &&
      y >= targetRect.top &&
      y <= targetRect.bottom
    ) {
      forwardTapToTarget(coachMark.selector, x, y)
    }
  }

  return createPortal(
    <div
      className="coach-mark-layer fixed inset-0 z-[140]"
      aria-live="polite"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerUp={handleLayerPointerUp}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <motion.div
        className="coach-mark-target"
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
        className={`coach-mark-card pointer-events-auto ${shouldShowBelow ? 'coach-mark-card--below' : 'coach-mark-card--above'}`}
        role="dialog"
        aria-label={coachMark.title}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: shouldShowBelow ? -8 : 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: shouldShowBelow ? -8 : 8, scale: 0.98 }}
        transition={iosSpringSnappy}
        style={{
          ...motionGpuLayer,
          left,
          top,
          width,
          '--coach-arrow-left': `${arrowLeft}px`,
        } as CSSProperties}
      >
        <div className="coach-mark-card__arrow" aria-hidden />
        <div className="coach-mark-card__copy">
          <h2>{coachMark.title}</h2>
          <p>{coachMark.body}</p>
          <p className="coach-mark-card__continue">Tap X to continue.</p>
        </div>
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
