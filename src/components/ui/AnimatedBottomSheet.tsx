import { AnimatePresence, motion } from 'framer-motion'
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { iosFade, iosSpringSheet } from '../../utils/motionPresets'

function readSlideDistance(): number {
  if (typeof window === 'undefined') return 800
  return window.visualViewport?.height ?? window.innerHeight
}

interface AnimatedBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  ariaLabel: string
  children: ReactNode
  maxHeightClass?: string
  sheetRef?: RefObject<HTMLDivElement | null>
  /** Lighter sheet motion for performance-sensitive surfaces like the vault. */
  motionPreset?: 'default' | 'light'
  onEnterComplete?: () => void
}

export default function AnimatedBottomSheet({
  isOpen,
  onClose,
  ariaLabel,
  children,
  maxHeightClass = 'max-h-[min(88vh,100dvh)]',
  sheetRef,
  motionPreset = 'default',
  onEnterComplete,
}: AnimatedBottomSheetProps) {
  const [slideDistance, setSlideDistance] = useState(readSlideDistance)

  useLayoutEffect(() => {
    const update = () => setSlideDistance(readSlideDistance())
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  if (typeof document === 'undefined') return null

  const sheetTransition =
    motionPreset === 'light'
      ? { duration: 0.28, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] }
      : iosSpringSheet
  const backdropTransition =
    motionPreset === 'light' ? { duration: 0.2, ease: 'easeOut' as const } : iosFade

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/50 touch-none"
            aria-label={`Close ${ariaLabel}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            onClick={onClose}
          />

          <motion.div
            ref={sheetRef}
            className={`fixed inset-x-0 bottom-0 z-50 flex ${maxHeightClass} flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl will-change-transform`}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ y: slideDistance }}
            animate={{ y: 0 }}
            exit={{ y: slideDistance }}
            transition={sheetTransition}
            onAnimationComplete={(definition) => {
              if (definition === 'animate') onEnterComplete?.()
            }}
          >
            <div
              className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-stone-300/90"
              aria-hidden
            />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
