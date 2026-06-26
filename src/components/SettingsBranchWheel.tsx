import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, LayoutGrid, Sparkles } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import MetronomeIcon from './icons/MetronomeIcon'
import { BRANCH_ITEM_WIDTH, layoutBranchItems } from '../utils/settingsBranchLayout'
import { motionGpuLayer, nativeGlideEase } from '../utils/motionPresets'
import { nativeGlideIn, nativeGlideShown, NATIVE_SQUISH } from '../utils/interactiveUx'
import { triggerLightHaptic } from '../utils/haptics'

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

const BRANCH_MOTION = nativeGlideEase

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

  const positions = anchor ? layoutBranchItems(branchItems.length, anchor.rect) : []

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && anchor && (
        <>
          <motion.button
            type="button"
            data-tutorial="branch-backdrop"
            className="settings-branch-backdrop fixed inset-0 z-[200] cursor-default touch-none bg-black/45"
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
              transform: 'translate(-50%, -50%)',
            }}
          >
            <motion.div
              className="settings-branch-wheel relative"
              role="menu"
              aria-label="Quick settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={BRANCH_MOTION}
              style={motionGpuLayer}
            >
              {branchItems.map((item, index) => {
                const { x, y } = positions[index] ?? { x: 0, y: -88 }

                const tutorialTarget =
                  item.id === 'pitch-analysis'
                    ? 'branch-pitch'
                    : item.id === 'metronome'
                      ? 'branch-metronome'
                      : undefined

                return (
                  <div
                    key={item.id}
                    className="settings-branch-wheel__slot pointer-events-none absolute"
                    style={{
                      left: x,
                      top: y,
                      width: BRANCH_ITEM_WIDTH,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <motion.button
                      type="button"
                      role="menuitem"
                      {...(tutorialTarget ? { 'data-tutorial': tutorialTarget } : {})}
                      className={`settings-branch-wheel__item pointer-events-auto flex w-full flex-col items-center gap-1.5 ${NATIVE_SQUISH} ${
                        item.active ? 'settings-branch-wheel__item--active' : ''
                      }`}
                      initial={nativeGlideIn}
                      animate={nativeGlideShown}
                      exit={nativeGlideIn}
                      transition={{ ...BRANCH_MOTION, delay: index * 0.04 }}
                      style={motionGpuLayer}
                      aria-label={item.label}
                      aria-pressed={item.active}
                      onClick={() => {
                        triggerLightHaptic()
                        item.onSelect()
                      }}
                    >
                      <span className="ui-orient-spin flex w-full flex-col items-center gap-1.5">
                        <span className="settings-branch-wheel__icon flex h-11 w-11 items-center justify-center rounded-full bg-black/55">
                          {item.icon === 'pitch' ? (
                            <AudioLines className="h-5 w-5" strokeWidth={2.1} />
                          ) : item.icon === 'take-cards' ? (
                            <LayoutGrid className="h-5 w-5" strokeWidth={2.1} />
                          ) : item.icon === 'enhancer' ? (
                            <Sparkles className="h-5 w-5" strokeWidth={2.1} />
                          ) : (
                            <MetronomeIcon className="h-5 w-5" />
                          )}
                        </span>
                        <span className="settings-branch-wheel__label block max-w-[5.5rem] text-center text-[10px] font-semibold leading-snug tracking-wide">
                          {item.label}
                        </span>
                      </span>
                    </motion.button>
                  </div>
                )
              })}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
