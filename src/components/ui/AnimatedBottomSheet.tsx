import { AnimatePresence, motion } from 'framer-motion'
import { useLayoutEffect, useRef, useState, useCallback, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useSheetDragDismiss, readSheetSlideDistance } from '../../hooks/useSheetDragDismiss'
import {
  iosFade,
  iosSheetBackdrop,
  iosSheetPremium,
  iosSpringSheet,
  motionGpuLayer,
  nativeGlideEase,
} from '../../utils/motionPresets'
import { nativeGlideIn, nativeGlideShown } from '../../utils/interactiveUx'
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
    const timer = window.setTimeout(() => setBackdropArmed(true), 320)
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

  if (typeof document === 'undefined') return null

  const sheetTransition =
    motionPreset === 'default'
      ? iosSpringSheet
      : motionPreset === 'light'
        ? { duration: 0.28, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }
        : iosSheetPremium
  const backdropTransition =
    motionPreset === 'default'
      ? iosFade
      : motionPreset === 'light'
        ? { duration: 0.2, ease: 'easeOut' as const }
        : iosSheetBackdrop
  const useScale = motionPreset !== 'light'

  const handleSheetAnimationComplete = () => {
    if (!isOpen || enterNotifiedRef.current) return
    enterNotifiedRef.current = true
    onEnterComplete?.()
  }

  const portalTarget = elevated
    ? document.body
    : (document.getElementById(PHYSICAL_UI_ROOT_ID) ?? document.body)

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            className={`tutorial-sheet-backdrop native-sheet-backdrop fixed inset-0 cursor-default touch-none bg-black/70 backdrop-blur-[10px] ${elevated ? 'tutorial-sheet-backdrop--elevated z-[90]' : 'z-40'}`}
            aria-label={`Close ${ariaLabel}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: backdropOpacity }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            style={{
              ...motionGpuLayer,
              pointerEvents: backdropArmed ? 'auto' : 'none',
            }}
            onClick={backdropArmed ? handleDismiss : undefined}
          />

          <motion.div
            ref={sheetRef}
            className={`animated-bottom-sheet native-bottom-sheet fixed inset-x-0 bottom-0 flex ${maxHeightClass} flex-col overflow-hidden rounded-t-[2rem] border border-white/70 bg-white/90 shadow-2xl backdrop-blur-2xl transform-gpu ${elevated ? 'animated-bottom-sheet--elevated z-[100]' : 'z-50'}`}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            style={{
              ...motionGpuLayer,
              paddingBottom: 'env(safe-area-inset-bottom)',
              pointerEvents: 'auto',
            }}
            initial={useScale ? { opacity: 0, y: slideDistance, scale: 0.965 } : { opacity: 0, y: slideDistance }}
            animate={useScale ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0 }}
            exit={useScale ? { opacity: 0, y: slideDistance, scale: 0.98 } : { opacity: 0, y: slideDistance }}
            transition={sheetTransition}
            onAnimationComplete={handleSheetAnimationComplete}
            {...sheetDragProps}
          >
            <motion.div
              className="ui-orient-spin flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={nativeGlideIn}
              animate={nativeGlideShown}
              transition={nativeGlideEase}
            >
              <div
                {...dragHandleProps}
                className={`${dragHandleProps.className} native-sheet-handle min-h-11 justify-center pb-1 pt-2.5`}
              >
                <div className="h-1 w-10 rounded-full bg-stone-300/90" />
              </div>
              {children}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}
