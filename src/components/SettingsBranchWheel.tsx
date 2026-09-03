import { AnimatePresence, motion } from 'framer-motion'
import {
  AudioLines,
  Columns2,
  Grid2X2,
  LayoutGrid,
  MicVocal,
  Radio,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTutorialAction } from '../context/TutorialContext'
import MetronomeIcon from './icons/MetronomeIcon'
import type { SettingsBranchLayoutMode } from '../utils/settingsBranchLayout'
import { motionGpuLayer, nativeGlideEase } from '../utils/motionPresets'
import { nativeGlideIn, nativeGlideShown, NATIVE_SQUISH } from '../utils/interactiveUx'
import { triggerLightHaptic } from '../utils/haptics'
import { useActionSheet } from '../context/ActionSheetContext'
import { MAX_WORKSPACE_DESKS, type WorkspaceDesk } from '../utils/workspaceDesks'

interface SettingsBranchWheelProps {
  open: boolean
  onClose: () => void
  onExitComplete?: () => void
  anchorRef: RefObject<HTMLElement | null>
  pitchTrackerEnabled: boolean
  showTakeCards: boolean
  showMetronome: boolean
  audioEnhancerEnabled: boolean
  handsFreeEnabled?: boolean
  /** Hidden while a video take is rolling — hands-free turns itself off there. */
  handsFreeToggleVisible?: boolean
  layoutMode?: SettingsBranchLayoutMode
  metronomeToggleVisible?: boolean
  showDrone?: boolean
  droneToggleVisible?: boolean
  onShowDroneChange?: (show: boolean) => void
  /** Saved desks — up to three chips above the toggle grid. */
  desks?: WorkspaceDesk[]
  activeDeskId?: string | null
  /** What "Save this desk" would capture, as one literal line. */
  liveDeskSummary?: string
  onApplyDesk?: (deskId: string) => void
  onSaveDesk?: (name: string) => void
  onDeleteDesk?: (deskId: string) => void
  hapticFeedback?: boolean
  tunerTakePillsVisible?: boolean
  tunerTakePillsToggleVisible?: boolean
  pitchToggleVisible: boolean
  takeCardsToggleVisible?: boolean
  expandViewActive?: boolean
  workspaceActionsVisible?: boolean
  onPitchTrackerChange: (enabled: boolean) => void
  onShowTakeCardsChange: (show: boolean) => void
  onShowMetronomeChange: (show: boolean) => void
  onAudioEnhancerChange: (enabled: boolean) => void
  onTunerTakePillsChange?: (show: boolean) => void
  onHandsFreeChange?: (enabled: boolean) => void
  onToggleExpandView?: () => void
  onOpenMultitrack?: () => void
}

interface BranchItem {
  id: string
  label: string
  icon:
    | 'pitch'
    | 'take-cards'
    | 'tuner-takes'
    | 'metronome'
    | 'drone'
    | 'enhancer'
    | 'hands-free'
    | 'expand'
    | 'multitrack'
  kind?: 'toggle' | 'action'
  active: boolean
  onSelect: () => void
}

const BRANCH_MOTION = nativeGlideEase

/**
 * One saved desk. Tapping the name sets the whole room; the × forgets it. The
 * lit chip means the live desk still matches what was saved — drifting from it
 * (changing the bpm, say) dims the chip rather than nagging.
 */
function DeskChip({
  desk,
  active,
  onApply,
  onDelete,
}: {
  desk: WorkspaceDesk
  active: boolean
  onApply: () => void
  onDelete: () => void
}) {
  return (
    <span
      className={`settings-branch-tray__desk ${active ? 'settings-branch-tray__desk--active' : ''}`}
    >
      <button
        type="button"
        className={`settings-branch-tray__desk-name ${NATIVE_SQUISH}`}
        aria-pressed={active}
        aria-label={`Set up the ${desk.name} desk${active ? '. Already set up' : ''}`}
        onClick={onApply}
      >
        {desk.name}
      </button>
      <button
        type="button"
        className="settings-branch-tray__desk-forget"
        aria-label={`Forget the ${desk.name} desk`}
        onClick={onDelete}
      >
        <X aria-hidden />
      </button>
    </span>
  )
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
  handsFreeEnabled = false,
  handsFreeToggleVisible = false,
  layoutMode = 'camera',
  metronomeToggleVisible = true,
  showDrone = false,
  droneToggleVisible = true,
  onShowDroneChange,
  desks = [],
  activeDeskId = null,
  liveDeskSummary = '',
  onApplyDesk,
  onSaveDesk,
  onDeleteDesk,
  hapticFeedback = true,
  tunerTakePillsVisible = false,
  tunerTakePillsToggleVisible = false,
  pitchToggleVisible,
  takeCardsToggleVisible = true,
  expandViewActive = false,
  workspaceActionsVisible = false,
  onPitchTrackerChange,
  onShowTakeCardsChange,
  onShowMetronomeChange,
  onAudioEnhancerChange,
  onTunerTakePillsChange,
  onHandsFreeChange,
  onToggleExpandView,
  onOpenMultitrack,
}: SettingsBranchWheelProps) {
  const notifyTutorial = useTutorialAction()
  const { showConfirm } = useActionSheet()
  const [savingDesk, setSavingDesk] = useState(false)
  const [deskNameDraft, setDeskNameDraft] = useState('')
  const [anchor, setAnchor] = useState<{
    rect: DOMRect
    viewportLeft: number
    viewportTop: number
    viewportWidth: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    const measure = () => {
      const node = anchorRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const visualViewport = window.visualViewport
      const viewportLeft = visualViewport?.offsetLeft ?? 0
      const viewportTop = visualViewport?.offsetTop ?? 0
      const viewportWidth = visualViewport?.width ?? window.innerWidth

      setAnchor({
        rect,
        viewportLeft,
        viewportTop,
        viewportWidth,
      })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [anchorRef, open])

  const handleExitComplete = () => {
    setAnchor(null)
    setSavingDesk(false)
    setDeskNameDraft('')
    onExitComplete?.()
  }

  const canSaveDesk = Boolean(onSaveDesk)
  const desksVisible = canSaveDesk || desks.length > 0

  const commitDeskName = () => {
    const name = deskNameDraft.trim()
    if (!name || !onSaveDesk) return
    triggerLightHaptic(hapticFeedback)
    onSaveDesk(name)
    setSavingDesk(false)
    setDeskNameDraft('')
  }

  const confirmDeleteDesk = (desk: WorkspaceDesk) => {
    void showConfirm({
      message: `Forget the “${desk.name}” desk?`,
      destructive: true,
      confirmLabel: 'Forget',
    }).then((confirmed) => {
      if (confirmed) onDeleteDesk?.(desk.id)
    })
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

    if (takeCardsToggleVisible) {
      items.push({
        id: 'take-cards',
        label: 'Take Cards',
        icon: 'take-cards',
        active: showTakeCards,
        onSelect: () => onShowTakeCardsChange(!showTakeCards),
      })
    }

    if (tunerTakePillsToggleVisible) {
      items.push({
        id: 'tuner-takes',
        label: 'Tuner Takes',
        icon: 'tuner-takes',
        active: tunerTakePillsVisible,
        onSelect: () => onTunerTakePillsChange?.(!tunerTakePillsVisible),
      })
    }

    if (metronomeToggleVisible) {
      items.push({
        id: 'metronome',
        label: 'Metronome',
        icon: 'metronome',
        active: showMetronome,
        onSelect: () => onShowMetronomeChange(!showMetronome),
      })
    }

    if (droneToggleVisible && onShowDroneChange) {
      items.push({
        id: 'drone',
        label: 'Drone',
        icon: 'drone',
        active: showDrone,
        onSelect: () => onShowDroneChange(!showDrone),
      })
    }

    items.push({
      id: 'audio-enhancer',
      label: 'Audio Enhancer',
      icon: 'enhancer',
      active: audioEnhancerEnabled,
      onSelect: () => onAudioEnhancerChange(!audioEnhancerEnabled),
    })

    // Hands-free was long-press-only on the record button, which nothing
    // advertised. Keeping it in the tray makes it findable without removing
    // the gesture for anyone who already knows it.
    if (handsFreeToggleVisible && onHandsFreeChange) {
      items.push({
        id: 'hands-free',
        label: 'Hands-Free',
        icon: 'hands-free',
        active: handsFreeEnabled,
        onSelect: () => onHandsFreeChange(!handsFreeEnabled),
      })
    }

    if (workspaceActionsVisible && onToggleExpandView) {
      items.push({
        id: 'expand-view',
        label: 'Expand View',
        icon: 'expand',
        kind: 'action',
        active: expandViewActive,
        onSelect: onToggleExpandView,
      })
    }

    if (workspaceActionsVisible && onOpenMultitrack) {
      items.push({
        id: 'multitrack',
        label: 'Multitrack',
        icon: 'multitrack',
        kind: 'action',
        active: false,
        onSelect: onOpenMultitrack,
      })
    }

    return items
  }, [
    audioEnhancerEnabled,
    droneToggleVisible,
    handsFreeEnabled,
    handsFreeToggleVisible,
    expandViewActive,
    metronomeToggleVisible,
    onShowDroneChange,
    showDrone,
    onAudioEnhancerChange,
    onHandsFreeChange,
    onOpenMultitrack,
    onPitchTrackerChange,
    onShowMetronomeChange,
    onShowTakeCardsChange,
    onTunerTakePillsChange,
    onToggleExpandView,
    pitchToggleVisible,
    pitchTrackerEnabled,
    showMetronome,
    showTakeCards,
    takeCardsToggleVisible,
    tunerTakePillsToggleVisible,
    tunerTakePillsVisible,
    workspaceActionsVisible,
  ])

  const trayGeometry = useMemo(() => {
    if (!anchor) return null

    const viewportMargin = 12
    const width = Math.min(360, anchor.viewportWidth - viewportMargin * 2)
    const anchorCenterX = anchor.rect.left + anchor.rect.width / 2
    const minCenterX = anchor.viewportLeft + viewportMargin + width / 2
    const maxCenterX = anchor.viewportLeft + anchor.viewportWidth - viewportMargin - width / 2
    const centerX = Math.min(maxCenterX, Math.max(minCenterX, anchorCenterX))
    const arrowX = Math.min(
      width - 26,
      Math.max(26, anchorCenterX - (centerX - width / 2)),
    )

    return {
      centerX,
      top: Math.max(anchor.viewportTop + 12, anchor.rect.top - 12),
      width,
      arrowX,
    }
  }, [anchor])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && anchor && trayGeometry && (
        <>
          <motion.button
            type="button"
            data-tutorial="branch-backdrop"
            className="settings-branch-backdrop fixed inset-0 z-[200] cursor-default touch-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BRANCH_MOTION}
            style={motionGpuLayer}
            aria-label="Close workspace"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onClose}
          />

          <div
            className="settings-branch-tray-anchor pointer-events-none fixed z-[201]"
            style={{
              left: trayGeometry.centerX,
              top: trayGeometry.top,
              width: trayGeometry.width,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <motion.div
              className={`settings-branch-tray settings-branch-tray--${layoutMode} pointer-events-auto relative`}
              role="menu"
              aria-label="Workspace"
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={BRANCH_MOTION}
              style={{
                ...motionGpuLayer,
                transformOrigin: `${trayGeometry.arrowX}px 100%`,
              }}
            >
              <div className="settings-branch-tray__header">
                <span className="settings-branch-tray__title">Workspace</span>
              </div>

              {desksVisible && !savingDesk && (
                <div className="settings-branch-tray__desks" role="group" aria-label="Saved desks">
                  {desks.map((desk) => (
                    <DeskChip
                      key={desk.id}
                      desk={desk}
                      active={desk.id === activeDeskId}
                      onApply={() => onApplyDesk?.(desk.id)}
                      onDelete={() => confirmDeleteDesk(desk)}
                    />
                  ))}
                  {desks.length === 0 && (
                    <span className="settings-branch-tray__desks-empty">
                      Save the room you set up — click, drone, hands-free — as one tap.
                    </span>
                  )}
                </div>
              )}

              {savingDesk ? (
                <form
                  className="settings-branch-tray__save"
                  onSubmit={(event) => {
                    event.preventDefault()
                    commitDeskName()
                  }}
                >
                  <label className="settings-branch-tray__save-label" htmlFor="workspace-desk-name">
                    Save this desk
                  </label>
                  <input
                    id="workspace-desk-name"
                    className="settings-branch-tray__save-input"
                    value={deskNameDraft}
                    autoFocus
                    maxLength={24}
                    placeholder="Long tones, Excerpt run, Lesson…"
                    aria-label="Desk name"
                    onChange={(event) => setDeskNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setSavingDesk(false)
                      }
                    }}
                  />
                  <p className="settings-branch-tray__save-summary">{liveDeskSummary}</p>
                  {desks.length >= MAX_WORKSPACE_DESKS && (
                    <p className="settings-branch-tray__save-note">
                      Three desks already — this replaces the oldest.
                    </p>
                  )}
                  <div className="settings-branch-tray__save-actions">
                    <button
                      type="button"
                      className={`settings-branch-tray__save-btn ${NATIVE_SQUISH}`}
                      onClick={() => setSavingDesk(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={`settings-branch-tray__save-btn settings-branch-tray__save-btn--primary ${NATIVE_SQUISH}`}
                      disabled={!deskNameDraft.trim()}
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
              <div className="settings-branch-tray__grid">
                {branchItems.map((item) => {
                  const tutorialTarget =
                    item.id === 'pitch-analysis'
                      ? 'branch-pitch'
                      : item.id === 'metronome'
                        ? 'branch-metronome'
                        : item.id === 'expand-view'
                          ? 'expand-view-button'
                          : item.id === 'multitrack'
                            ? 'multitrack-button'
                        : undefined

                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      role={item.kind === 'action' ? 'menuitem' : 'menuitemcheckbox'}
                      {...(tutorialTarget ? { 'data-tutorial': tutorialTarget } : {})}
                      className={`settings-branch-tray__item ${NATIVE_SQUISH} ${
                        item.active ? 'settings-branch-tray__item--active' : ''
                      }`}
                      initial={nativeGlideIn}
                      animate={nativeGlideShown}
                      exit={nativeGlideIn}
                      transition={BRANCH_MOTION}
                      style={motionGpuLayer}
                      aria-label={item.label}
                      {...(item.kind === 'action' ? {} : { 'aria-checked': item.active })}
                      onClick={() => {
                        triggerLightHaptic()
                        item.onSelect()
                        if (item.kind === 'action') onClose()
                        notifyTutorial?.('branch-widget-selected')
                      }}
                    >
                      <span className="ui-orient-spin settings-branch-tray__item-content">
                        <span className="settings-branch-tray__icon" aria-hidden="true">
                          {item.icon === 'pitch' ? (
                            <AudioLines strokeWidth={2.1} />
                          ) : item.icon === 'take-cards' || item.icon === 'tuner-takes' ? (
                            <LayoutGrid strokeWidth={2.1} />
                          ) : item.icon === 'enhancer' ? (
                            <Sparkles strokeWidth={2.1} />
                          ) : item.icon === 'drone' ? (
                            <Radio strokeWidth={2.1} />
                          ) : item.icon === 'hands-free' ? (
                            <MicVocal strokeWidth={2.1} />
                          ) : item.icon === 'expand' ? (
                            <Columns2 strokeWidth={2.1} />
                          ) : item.icon === 'multitrack' ? (
                            <Grid2X2 strokeWidth={2.1} />
                          ) : (
                            <MetronomeIcon />
                          )}
                        </span>
                        <span className="settings-branch-tray__label">{item.label}</span>
                      </span>
                    </motion.button>
                  )
                })}
              </div>
              )}

              {canSaveDesk && !savingDesk && (
                <button
                  type="button"
                  className={`settings-branch-tray__save-trigger ${NATIVE_SQUISH}`}
                  onClick={() => {
                    triggerLightHaptic(hapticFeedback)
                    setDeskNameDraft('')
                    setSavingDesk(true)
                  }}
                >
                  Save this desk…
                </button>
              )}

              <span
                className="settings-branch-tray__arrow"
                style={{ left: trayGeometry.arrowX }}
                aria-hidden="true"
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
