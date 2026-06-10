import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, LayoutGrid } from 'lucide-react'
import { useEffect, useMemo, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { BRANCH_ITEM_WIDTH, layoutBranchItems } from '../utils/settingsBranchLayout'

interface SettingsBranchWheelProps {
  open: boolean
  onClose: () => void
  onExitComplete?: () => void
  anchorRef: RefObject<HTMLElement | null>
  pitchTrackerEnabled: boolean
  showTakeCards: boolean
  onPitchTrackerChange: (enabled: boolean) => void
  onShowTakeCardsChange: (show: boolean) => void
}

interface BranchItem {
  id: string
  label: string
  icon: typeof AudioLines
  active: boolean
  onSelect: () => void
}

const BRANCH_MOTION = {
  enter: { duration: 0.2, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
  exit: { duration: 0.22, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
}

export default function SettingsBranchWheel({
  open,
  onClose,
  onExitComplete,
  anchorRef,
  pitchTrackerEnabled,
  showTakeCards,
  onPitchTrackerChange,
  onShowTakeCardsChange,
}: SettingsBranchWheelProps) {
  useEffect(() => {
    if (!open) return

    document.body.classList.add('settings-branch-open')

    const preventNativeMenu = (event: Event) => {
      event.preventDefault()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('contextmenu', preventNativeMenu, { capture: true })
    document.addEventListener('selectstart', preventNativeMenu, { capture: true })

    return () => {
      document.body.classList.remove('settings-branch-open')
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('contextmenu', preventNativeMenu, { capture: true })
      document.removeEventListener('selectstart', preventNativeMenu, { capture: true })
      window.getSelection()?.removeAllRanges()
    }
  }, [onClose, open])

  const branchItems = useMemo<BranchItem[]>(
    () => [
      {
        id: 'pitch',
        label: 'Pitch Analysis',
        icon: AudioLines,
        active: pitchTrackerEnabled,
        onSelect: () => onPitchTrackerChange(!pitchTrackerEnabled),
      },
      {
        id: 'take-cards',
        label: 'Take Cards',
        icon: LayoutGrid,
        active: showTakeCards,
        onSelect: () => onShowTakeCardsChange(!showTakeCards),
      },
    ],
    [onPitchTrackerChange, onShowTakeCardsChange, pitchTrackerEnabled, showTakeCards],
  )

  const anchorRect = open ? anchorRef.current?.getBoundingClientRect() : null
  const anchorX = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth - 36
  const anchorY = anchorRect ? anchorRect.top + anchorRect.height / 2 : window.innerHeight - 48
  const positions = anchorRect ? layoutBranchItems(branchItems.length, anchorRect) : []

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <>
          <motion.button
            type="button"
            className="settings-branch-backdrop fixed inset-0 z-[200] cursor-default touch-none bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BRANCH_MOTION}
            aria-label="Close quick settings"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onClose}
          />

          <motion.div
            className="settings-branch-wheel pointer-events-none fixed z-[201] touch-none"
            style={{ left: anchorX, top: anchorY }}
            role="menu"
            aria-label="Quick settings"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={BRANCH_MOTION}
          >
            {branchItems.map((item, index) => {
              const Icon = item.icon
              const { x, y } = positions[index] ?? { x: 0, y: -80 }

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`settings-branch-wheel__item pointer-events-auto absolute flex flex-col items-center gap-1.5 ${
                    item.active ? 'settings-branch-wheel__item--active' : ''
                  }`}
                  style={{
                    left: 0,
                    top: 0,
                    width: BRANCH_ITEM_WIDTH,
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  }}
                  initial={{ opacity: 0, scale: 0.72 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.72 }}
                  transition={{
                    ...BRANCH_MOTION,
                    delay: index * 0.03,
                  }}
                  aria-label={item.label}
                  aria-pressed={item.active}
                  onClick={item.onSelect}
                  whileTap={{ scale: 0.94 }}
                >
                  <span className="settings-branch-wheel__icon flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md">
                    <Icon className="h-5 w-5" strokeWidth={2.1} />
                  </span>
                  <span className="settings-branch-wheel__label text-center text-[10px] font-semibold leading-tight tracking-wide">
                    {item.label}
                  </span>
                </motion.button>
              )
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
