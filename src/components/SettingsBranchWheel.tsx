import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, LayoutGrid, Sparkles } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import MetronomeIcon from './icons/MetronomeIcon'
import { motionGpuLayer } from '../utils/motionPresets'

interface SettingsBranchWheelProps {
  open: boolean
  onClose: () => void
  onExitComplete?: () => void
  anchorRef: RefObject<HTMLElement | null>
  pitchTrackerEnabled: boolean
  showTakeCards: boolean
  showMetronome: boolean
  audioEnhancerEnabled: boolean
  pitchToggleVisible: boolean
  onPitchTrackerChange: (enabled: boolean) => void
  onShowTakeCardsChange: (show: boolean) => void
  onShowMetronomeChange: (show: boolean) => void
  onAudioEnhancerChange: (enabled: boolean) => void
}

interface BranchItem {
  id: string
  label: string
  icon: 'pitch' | 'take-cards' | 'metronome' | 'enhancer'
  active: boolean
  onSelect: () => void
}

const BRANCH_MOTION = {
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

export default function SettingsBranchWheel({
  open,
  onClose,
  onExitComplete,
  anchorRef,
  pitchTrackerEnabled,
  showTakeCards,
  showMetronome,
  audioEnhancerEnabled,
  pitchToggleVisible,
  onPitchTrackerChange,
  onShowTakeCardsChange,
  onShowMetronomeChange,
  onAudioEnhancerChange,
}: SettingsBranchWheelProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; rect: DOMRect } | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!open) return

    const measure = () => {
      const node = anchorRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      setAnchor({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect,
      })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchorRef, open])

  const handleExitComplete = () => {
    setAnchor(null)
    onExitComplete?.()
  }

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

  const branchItems = useMemo<BranchItem[]>(() => {
    const items: BranchItem[] = []

    if (pitchToggleVisible) {
      items.push({
        id: 'pitch-analysis',
        label: 'Pitch Analysis',
        icon: 'pitch',
        active: pitchTrackerEnabled,
        onSelect: () => onPitchTrackerChange(!pitchTrackerEnabled),
      })
    }

    items.push(
      {
        id: 'take-cards',
        label: 'Take Cards',
        icon: 'take-cards',
        active: showTakeCards,
        onSelect: () => onShowTakeCardsChange(!showTakeCards),
      },
      {
        id: 'metronome',
        label: 'Metronome',
        icon: 'metronome',
        active: showMetronome,
        onSelect: () => onShowMetronomeChange(!showMetronome),
      },
      {
        id: 'audio-enhancer',
        label: 'Audio Enhancer',
        icon: 'enhancer',
        active: audioEnhancerEnabled,
        onSelect: () => onAudioEnhancerChange(!audioEnhancerEnabled),
      },
    )

    return items
  }, [
    audioEnhancerEnabled,
    onAudioEnhancerChange,
    onPitchTrackerChange,
    onShowMetronomeChange,
    onShowTakeCardsChange,
    pitchToggleVisible,
    pitchTrackerEnabled,
    showMetronome,
    showTakeCards,
  ])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && anchor && (
        <>
          <motion.button
            type="button"
            className="settings-branch-backdrop fixed inset-0 z-[200] cursor-default touch-none bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BRANCH_MOTION}
            style={motionGpuLayer}
            aria-label="Close quick settings"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onClose}
          />

          <div
            className="pointer-events-none fixed z-[201] touch-none"
            style={{
              left: anchor.x,
              top: anchor.y,
              transform: 'translate(-50%, -100%) translateY(-0.75rem)',
            }}
          >
            <motion.div
              className="settings-branch-dock pointer-events-auto"
              role="menu"
              aria-label="Quick settings"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={BRANCH_MOTION}
              style={motionGpuLayer}
            >
              {branchItems.map((item, index) => (
                <motion.button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`settings-branch-dock__btn ${
                    item.active ? 'settings-branch-dock__btn--active' : ''
                  }`}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ ...BRANCH_MOTION, delay: index * 0.03 }}
                  aria-label={item.label}
                  aria-pressed={item.active}
                  onClick={item.onSelect}
                  whileTap={{ scale: 0.92 }}
                >
                  <span className="ui-orient-spin flex items-center justify-center">
                    {item.icon === 'pitch' ? (
                      <AudioLines className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    ) : item.icon === 'take-cards' ? (
                      <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    ) : item.icon === 'enhancer' ? (
                      <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    ) : (
                      <MetronomeIcon className="h-[18px] w-[18px]" />
                    )}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
