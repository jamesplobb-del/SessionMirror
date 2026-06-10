import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, LayoutGrid, X } from 'lucide-react'
import { useEffect, type RefObject } from 'react'

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
  visible: boolean
  onSelect: () => void
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const items: BranchItem[] = [
    {
      id: 'pitch',
      label: pitchToggleActive ? 'Hide Pitch' : 'Pitch Analysis',
      icon: AudioLines,
      active: pitchToggleActive,
      visible: pitchToggleVisible,
      onSelect: () => {
        onPitchToggle()
        onClose()
      },
    },
    {
      id: 'take-cards',
      label: showTakeCards ? 'Hide Take Cards' : 'Show Take Cards',
      icon: LayoutGrid,
      active: showTakeCards,
      visible: true,
      onSelect: () => {
        onShowTakeCardsChange(!showTakeCards)
        onClose()
      },
    },
  ]

  const visibleItems = items.filter((item) => item.visible)
  const anchorRect = anchorRef.current?.getBoundingClientRect()
  const anchorX = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth - 36
  const anchorY = anchorRect ? anchorRect.top + anchorRect.height / 2 : window.innerHeight - 48

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="settings-branch-backdrop fixed inset-0 z-[45] cursor-default bg-black/20 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            aria-label="Close quick settings"
            onClick={onClose}
          />

          <div
            className="settings-branch-wheel pointer-events-none fixed z-[46]"
            style={{
              left: anchorX,
              top: anchorY,
            }}
            role="menu"
            aria-label="Quick settings"
          >
            <motion.button
              type="button"
              className="settings-branch-wheel__close pointer-events-auto absolute flex h-8 w-8 -translate-x-1/2 -translate-y-[calc(100%+3.25rem)] items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-black/65"
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              aria-label="Close quick settings"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </motion.button>

            {visibleItems.map((item, index) => {
              const Icon = item.icon
              const count = visibleItems.length
              const startAngle = count === 1 ? -90 : -128
              const endAngle = count === 1 ? -90 : -52
              const angle =
                count === 1
                  ? startAngle
                  : startAngle + ((endAngle - startAngle) * index) / Math.max(1, count - 1)
              const radius = 74
              const rad = (angle * Math.PI) / 180
              const x = Math.cos(rad) * radius
              const y = Math.sin(rad) * radius

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`settings-branch-wheel__item pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 ${
                    item.active ? 'settings-branch-wheel__item--active' : ''
                  }`}
                  style={{ left: x, top: y }}
                  initial={{ opacity: 0, scale: 0.72 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.72 }}
                  transition={{
                    type: 'spring',
                    stiffness: 480,
                    damping: 30,
                    delay: index * 0.04,
                  }}
                  aria-label={item.label}
                  aria-pressed={item.active}
                  onClick={item.onSelect}
                >
                  <span className="settings-branch-wheel__icon flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md">
                    <Icon className="h-5 w-5" strokeWidth={2.1} />
                  </span>
                  <span className="settings-branch-wheel__label max-w-[5.5rem] text-center text-[10px] font-semibold leading-tight tracking-wide">
                    {item.label}
                  </span>
                </motion.button>
              )
            })}

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
    </AnimatePresence>
  )
}
