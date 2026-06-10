import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, LayoutGrid, X } from 'lucide-react'
import { useEffect, useMemo, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { iosFade, iosSpringSnappy, motionTap, motionTapSoft } from '../utils/motionPresets'

interface SettingsBranchWheelProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  pitchToggleVisible: boolean
  pitchToggleActive: boolean
  onPitchToggle: () => void
  showTakeCards: boolean
  onShowTakeCardsChange: (show: boolean) => void
}

interface BranchItem {
  id: string
  label: string
  icon: typeof AudioLines
  active: boolean
  onSelect: () => void
}

const BRANCH_RADIUS = 92

function branchPosition(index: number, count: number): { x: number; y: number } {
  if (count <= 1) {
    return { x: 0, y: -BRANCH_RADIUS }
  }

  if (count === 2) {
    return index === 0 ? { x: -62, y: -BRANCH_RADIUS } : { x: 62, y: -BRANCH_RADIUS }
  }

  const startAngle = -150
  const endAngle = -30
  const angle = startAngle + ((endAngle - startAngle) * index) / Math.max(1, count - 1)
  const rad = (angle * Math.PI) / 180
  return {
    x: Math.cos(rad) * BRANCH_RADIUS,
    y: Math.sin(rad) * BRANCH_RADIUS,
  }
}

export default function SettingsBranchWheel({
  open,
  onClose,
  anchorRef,
  pitchToggleVisible,
  pitchToggleActive,
  onPitchToggle,
  showTakeCards,
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

  const visibleItems = useMemo<BranchItem[]>(() => {
    const items: BranchItem[] = []

    if (pitchToggleVisible) {
      items.push({
        id: 'pitch',
        label: pitchToggleActive ? 'Hide Pitch' : 'Pitch Analysis',
        icon: AudioLines,
        active: pitchToggleActive,
        onSelect: () => {
          onPitchToggle()
          onClose()
        },
      })
    }

    items.push({
      id: 'take-cards',
      label: showTakeCards ? 'Hide Take Cards' : 'Show Take Cards',
      icon: LayoutGrid,
      active: showTakeCards,
      onSelect: () => {
        onShowTakeCardsChange(!showTakeCards)
        onClose()
      },
    })

    return items
  }, [
    onClose,
    onPitchToggle,
    onShowTakeCardsChange,
    pitchToggleActive,
    pitchToggleVisible,
    showTakeCards,
  ])

  const anchorRect = open ? anchorRef.current?.getBoundingClientRect() : null
  const anchorX = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth - 36
  const anchorY = anchorRect ? anchorRect.top + anchorRect.height / 2 : window.innerHeight - 48

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="settings-branch-backdrop fixed inset-0 z-[200] cursor-default touch-none bg-black/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={iosFade}
            aria-label="Close quick settings"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onClose}
            whileTap={motionTapSoft}
          />

          <div
            className="settings-branch-wheel pointer-events-none fixed z-[201] touch-none"
            style={{
              left: anchorX,
              top: anchorY,
            }}
            role="menu"
            aria-label="Quick settings"
          >
            <motion.button
              type="button"
              className="settings-branch-wheel__close pointer-events-auto absolute flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md"
              style={{ left: 0, top: visibleItems.length === 1 ? -148 : -132 }}
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={iosSpringSnappy}
              aria-label="Close quick settings"
              onClick={onClose}
              whileTap={motionTapSoft}
            >
              <X className="h-4 w-4" />
            </motion.button>

            <AnimatePresence mode="popLayout" initial={false}>
              {visibleItems.map((item, index) => {
                const Icon = item.icon
                const { x, y } = branchPosition(index, visibleItems.length)

                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    layout="position"
                    className={`settings-branch-wheel__item pointer-events-auto absolute flex w-[5.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 ${
                      item.active ? 'settings-branch-wheel__item--active' : ''
                    }`}
                    initial={{ opacity: 0, scale: 0.72, x: x * 0.15, y: y * 0.15 }}
                    animate={{ opacity: 1, scale: 1, x, y }}
                    exit={{ opacity: 0, scale: 0.72 }}
                    transition={iosSpringSnappy}
                    aria-label={item.label}
                    aria-pressed={item.active}
                    onClick={item.onSelect}
                    whileTap={motionTap}
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
            </AnimatePresence>

            <motion.span
              className="settings-branch-wheel__stem absolute left-0 top-0 h-10 w-px -translate-x-1/2 -translate-y-full bg-white/20"
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ scaleY: 0, opacity: 0 }}
              aria-hidden
            />
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
