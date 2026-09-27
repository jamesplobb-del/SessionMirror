import { PremiumMotionDiv, PremiumMotionButton } from './PremiumMotionSurface'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { useLayoutEffect, useRef, useState, useCallback, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useSheetDragDismiss, readSheetSlideDistance } from '../../hooks/useSheetDragDismiss'
import {
  iosFade,
  iosSheetBackdrop,
  iosSheetPremium,
  iosSpringSheet,
  motionExitHide,
  motionGpuLayer,
} from '../../utils/motionPresets'
import { PHYSICAL_UI_ROOT_ID } from '../../utils/physicalUiPortal'

interface AnimatedBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  ariaLabel: string
  children: ReactNode
  maxHeightClass?: string
  sheetRef?: RefObject<HTMLDivElement | null>
  /** Sheet motion profile — premium uses eased slide + subtle scale. */
  motionPreset?: 'default' | 'light' | 'premium'
  /** Fires once when the enter slide animation finishes (not on exit). */
  onEnterComplete?: () => void
  /** Portal above floating HUD layers (metronome/pitch display). */
  elevated?: boolean
  /** Flat elevated light surface — matches Audio Mode (#F7F8FA). */
  elevatedLight?: boolean
  /** Elevated Take Vault — audio-mode light colorway. */
  vaultTheme?: boolean
  /**
   * Override the stacking layer (Tailwind z classes for backdrop and sheet)
   * for hosts above the default elevated layer (e.g. multitrack at z-135).
   */
  zClass?: { backdrop: string; sheet: string }
  /**
   * Skip the dimmed/blurred backdrop entirely (still tappable to dismiss).
   * Use for live-preview sheets where the content behind must stay visible,
   * e.g. layout controls edited while watching the canvas update.
   */
  transparentBackdrop?: boolean
}

export default function AnimatedBottomSheet({
  isOpen,
  onClose,
  ariaLabel,
  children,
  maxHeightClass = 'max-h-[min(88vh,100dvh)]',
  sheetRef,
  motionPreset = 'premium',
  onEnterComplete,
  elevated = false,
  elevatedLight = false,
  vaultTheme = false,
  zClass,
  transparentBackdrop = false,
}: AnimatedBottomSheetProps) {
  const [slideDistance, setSlideDistance] = useState(readSheetSlideDistance)
  const enterNotifiedRef = useRef(false)
  const [backdropArmed, setBackdropArmed] = useState(false)

  const handleDismiss = useCallback(() => {
    onClose()
  }, [onClose])

  const { sheetDragProps, dragHandleProps, backdropOpacity } = useSheetDragDismiss({
    enabled: isOpen,
    slideDistance,
    onDismiss: handleDismiss,
  })

  useLayoutEffect(() => {
    if (isOpen) {
      enterNotifiedRef.current = false
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) {
      setBackdropArmed(false)
      return
    }
    setBackdropArmed(false)
    const timer = window.setTimeout(() => setBackdropArmed(true), 90)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return

    const update = () => setSlideDistance(readSheetSlideDistance())
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // Nested pickers and sheets get the first chance to handle Escape.
      const visibleDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
        .filter(node => node.getClientRects().length > 0)
      if (visibleDialogs.at(-1)?.getAttribute('aria-label') !== ariaLabel) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [ariaLabel, isOpen, onClose])

  const reduceMotion = useReducedMotion()
  const electric = typeof document !== 'undefined' && document.documentElement.dataset.refinement === 'depth-electric'

  if (typeof document === 'undefined') return null

  const premiumSheet = !document.documentElement.dataset.gameConcept
  const sheetTransition =
    reduceMotion ? { duration:0.1 } : premiumSheet ? {duration:.738,ease:[.16,1,.3,1] as [number,number,number,number]} : electric ? {type:'spring' as const,stiffness:440,damping:40,mass:.85} :
    motionPreset === 'default'
      ? iosSpringSheet
      : motionPreset === 'light'
        ? { duration: 0.28, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }
        : iosSheetPremium
  const backdropTransition =
    premiumSheet ? {duration:reduceMotion ? .1 : .432,ease:"easeOut" as const} :
    motionPreset === 'default'
      ? iosFade
      : motionPreset === 'light'
        ? { duration: 0.2, ease: 'easeOut' as const }
        : iosSheetBackdrop
  const useScale = !reduceMotion && (premiumSheet || (!electric && motionPreset !== 'light'))

  const handleSheetAnimationComplete = () => {
    if (!isOpen || enterNotifiedRef.current) return
    enterNotifiedRef.current = true
    onEnterComplete?.()
  }

  const sheetSurfaceClass = vaultTheme
    ? 'native-bottom-sheet--audio-light native-bottom-sheet--vault'
    : elevatedLight
      ? 'native-bottom-sheet--audio-light'
      : 'border border-white/70 shadow-2xl'

  const backdropClass = transparentBackdrop
    ? ''
    : vaultTheme
      ? 'native-sheet-backdrop--audio-light'
      : elevatedLight
        ? 'native-sheet-backdrop--audio-light'
        : 'bg-black/70'

  const portalTarget = elevated
    ? document.body
    : (document.getElementById(PHYSICAL_UI_ROOT_ID) ?? document.body)

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <PremiumMotionButton
            key="sheet-backdrop"
            type="button"
            className={`tutorial-sheet-backdrop native-sheet-backdrop fixed inset-0 cursor-default touch-none ${backdropClass} ${zClass ? zClass.backdrop : elevated ? 'tutorial-sheet-backdrop--elevated z-[90]' : 'z-40'}`}
            aria-label={`Close ${ariaLabel}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transitionEnd: motionExitHide }}
            transition={backdropTransition}
            style={{
              ...motionGpuLayer,
              opacity: backdropOpacity,
              pointerEvents: backdropArmed ? 'auto' : 'none',
            }}
            onClick={backdropArmed ? handleDismiss : undefined}
          />

          <PremiumMotionDiv
            key="sheet-surface"
            className={`animated-bottom-sheet fixed inset-x-0 bottom-0 flex ${maxHeightClass} flex-col rounded-t-[2rem] ${zClass ? zClass.sheet : elevated ? 'animated-bottom-sheet--elevated z-[100]' : 'z-50'}`}
            style={{
              ...motionGpuLayer,
              pointerEvents: 'none',
            }}
            // `y`/`scale` are JS-driven in Motion. A full transform can run
            // through WAAPI while media work is busy. Drag owns an inner
            // surface so its y value never overwrites this entrance/exit.
            initial={{ opacity: 0, transform: `translateY(${reduceMotion ? 0 : slideDistance}px) scale(${useScale ? .965 : 1})` }}
            animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
            exit={{ opacity: 0, transform: `translateY(${reduceMotion ? 0 : slideDistance}px) scale(${useScale ? .98 : 1})`, transitionEnd: motionExitHide }}
            transition={sheetTransition}
            onAnimationComplete={handleSheetAnimationComplete}
          >
            <PremiumMotionDiv
              ref={sheetRef}
              className={`native-bottom-sheet flex min-h-0 flex-1 flex-col overflow-hidden ${sheetSurfaceClass}`}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              style={{
                width: '100%',
                maxHeight: 'inherit',
                borderRadius: 'inherit',
                paddingBottom: 'env(safe-area-inset-bottom)',
                pointerEvents: 'auto',
              }}
              {...sheetDragProps}
            >
            <div className="ui-orient-spin flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                {...dragHandleProps}
                className={`${dragHandleProps.className} native-sheet-handle min-h-11 justify-center pb-1 pt-2.5`}
              >
                <div className="h-1 w-10 rounded-full bg-stone-300/90" />
              </div>
              {children}
            </div>
            </PremiumMotionDiv>
          </PremiumMotionDiv>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}
