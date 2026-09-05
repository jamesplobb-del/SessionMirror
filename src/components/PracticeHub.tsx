import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Pencil,
  Play,
  Plus,
  X,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import { iosFade, iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { getInstrumentProfile } from '../utils/instrumentProfiles'
import {
  getTunerTransposition,
  type TunerTranspositionId,
} from '../utils/tunerTransposition'
import { loadMetronomePrefs, type MetronomePrefs } from '../utils/metronomeConfig'
import type { BestTakeHistoryEntry, PracticeItemState, Project } from '../db'
import type { Take } from '../types'
import type { DeskSnapshot } from '../utils/workspaceDesks'
import {
  describeToday,
  formatMinutes,
  isStepDone,
  isStepSkipped,
  nextOpenStep,
  routineProgress,
  summarizeStep,
  type Routine,
  type RoutineDay,
} from '../utils/practiceRoutines'
import RoutineBuilder, {
  type BuilderView,
  type RoutineBuilderMode,
  type RoutineFocusRequest,
} from './RoutineBuilder'

/** A session is the specific thing being worked on — an excerpt, solo, or
 * technique. It's just a Project: its name IS the focus, and it accumulates
 * takes over as many sittings as it takes to get right. */
export interface FocusedPracticeSelection {
  projectId: string
  focusArea: string
}

const DAY_MS = 86_400_000

/** How long a practice item has been sitting, in the words a player uses. */
function describeLastOpened(timestamp: number): string {
  if (!timestamp) return 'Not started'
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(timestamp))) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days`
  if (days < 14) return 'Last week'
  return `${Math.floor(days / 7)} weeks`
}

interface PracticeHubProps {
  isOpen: boolean
  projects: Project[]
  activeProject: Project | null
  takes: Take[]
  bestTakeHistory: BestTakeHistoryEntry[]
  focusedPractice: FocusedPracticeSelection | null
  practiceItemStates: PracticeItemState[]
  tunerInstrument: string
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onClose: () => void
  onOpenQuickPractice: () => void
  onStartFocusedPractice: (projectId: string) => void | Promise<void>
  onResumeFocusedPractice: (projectId: string) => void | Promise<void>
  onCreatePracticeItem: (name: string) => Promise<Project>
  onOpenGames: () => void
  onOpenVault: () => void
  onOpenTuner: () => void
  onOpenMetronome: () => void
  /** The desk a Focus session will restore — one literal line under its card. */
  focusDeskSummary?: string | null

  /* ---- Daily routine ---- */
  routine: Routine | null
  routineDay: RoutineDay | null
  /** Non-null opens the builder in that mode when the sheet shows. */
  routineBuilderRequest: RoutineBuilderMode | null
  /** A focus step waiting for a practice item; the setup page binds it. */
  routineFocusRequest: RoutineFocusRequest | null
  instrumentId: string | null
  liveDeskSnapshot: DeskSnapshot
  onStartRoutineStep: (stepId: string) => void | Promise<void>
  onToggleRoutineStep: (stepId: string) => void
  onOpenRoutineBuilder: (mode: RoutineBuilderMode) => void
  onCloseRoutineBuilder: () => void
  onSaveRoutine: (routine: Routine) => void
  onDeleteRoutine: () => void
  onBindRoutineFocus: (projectId: string) => void | Promise<void>
  onCancelRoutineFocus: () => void
}

type HubPage = 'home' | 'focused-setup' | 'routine'

const BUILDER_TITLE: Record<BuilderView, string> = {
  presets: 'Start from a preset',
  edit: 'Your routine',
  add: 'Add a step',
  step: 'Step',
}

export default function PracticeHub({
  isOpen,
  projects,
  activeProject,
  takes,
  bestTakeHistory,
  focusedPractice,
  practiceItemStates,
  tunerInstrument,
  tunerTransposition,
  hapticFeedback,
  onClose,
  onOpenQuickPractice,
  onStartFocusedPractice,
  onResumeFocusedPractice,
  onCreatePracticeItem,
  onOpenGames,
  onOpenVault,
  onOpenTuner,
  onOpenMetronome,
  focusDeskSummary = null,
  routine,
  routineDay,
  routineBuilderRequest,
  routineFocusRequest,
  instrumentId,
  liveDeskSnapshot,
  onStartRoutineStep,
  onToggleRoutineStep,
  onOpenRoutineBuilder,
  onCloseRoutineBuilder,
  onSaveRoutine,
  onDeleteRoutine,
  onBindRoutineFocus,
  onCancelRoutineFocus,
}: PracticeHubProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const [page, setPage] = useState<HubPage>('home')
  const [builderView, setBuilderView] = useState<BuilderView>('edit')
  const [selectedProjectId, setSelectedProjectId] = useState(
    focusedPractice?.projectId ?? activeProject?.id ?? '',
  )
  const [launchError, setLaunchError] = useState('')
  const [startingFocusedPractice, setStartingFocusedPractice] = useState(false)
  const [startingRoutineStepId, setStartingRoutineStepId] = useState<string | null>(null)
  const [newPracticeItemName, setNewPracticeItemName] = useState('')
  const [metronomePrefs, setMetronomePrefs] = useState<MetronomePrefs | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setPage(routineBuilderRequest ? 'routine' : routineFocusRequest ? 'focused-setup' : 'home')
    setLaunchError('')
    setMetronomePrefs(loadMetronomePrefs())
    const resumeProjectId = focusedPractice?.projectId ?? practiceItemStates[0]?.projectId
    setSelectedProjectId(resumeProjectId ?? activeProject?.id ?? '')
  }, [isOpen])

  // The builder or a focus request can arrive while the sheet is already up.
  useEffect(() => {
    if (!isOpen) return
    if (routineBuilderRequest) setPage('routine')
    else if (page === 'routine') setPage('home')
  }, [routineBuilderRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return
    if (routineFocusRequest) setPage('focused-setup')
  }, [routineFocusRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeBuilder = () => {
    onCloseRoutineBuilder()
    setPage('home')
  }

  const leaveFocusedSetup = () => {
    if (routineFocusRequest) onCancelRoutineFocus()
    setPage('home')
  }

  const startRoutineStep = async (stepId: string) => {
    if (startingRoutineStepId) return
    setStartingRoutineStepId(stepId)
    setLaunchError('')
    try {
      await onStartRoutineStep(stepId)
    } catch {
      setLaunchError('Could not open this step. Please try again.')
    } finally {
      setStartingRoutineStepId(null)
    }
  }

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus())

    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [isOpen, onClose])

  const projectBestCount = useMemo(
    () => bestTakeHistory.filter((entry) => entry.projectId === activeProject?.id).length,
    [activeProject?.id, bestTakeHistory],
  )

  const tunerProfile = getInstrumentProfile(tunerInstrument)
  const tunerKey = getTunerTransposition(tunerTransposition)

  /**
   * The bench: every practice item that has actually been opened, most recent
   * first. `lastOpenedAt` is the only honest ordering — a project's createdAt
   * says nothing about whether it is live work.
   */
  const bench = useMemo(() => {
    return practiceItemStates
      .map((state) => {
        const project = projects.find((item) => item.id === state.projectId)
        if (!project) return null
        return {
          project,
          intention: state.pendingIntention,
          age: describeLastOpened(state.lastOpenedAt),
          bestCount: bestTakeHistory.filter(
            (entry) => entry.projectId === project.id && entry.isCurrentBest,
          ).length,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const aAt = practiceItemStates.find((s) => s.projectId === a.project.id)?.lastOpenedAt ?? 0
        const bAt = practiceItemStates.find((s) => s.projectId === b.project.id)?.lastOpenedAt ?? 0
        return bAt - aAt
      })
  }, [bestTakeHistory, practiceItemStates, projects])

  const resumeProject = projects.find(
    (project) => project.id === (focusedPractice?.projectId ?? bench[0]?.project.id),
  )
  const [selectedBenchId, setSelectedBenchId] = useState('')
  const selectedProject =
    bench.find((item) => item.project.id === selectedBenchId)?.project ?? resumeProject
  const selectedBenchDesk = selectedProject?.id === resumeProject?.id ? focusDeskSummary : null
  /**
   * Only the active project's takes are loaded (`getTakesByProject`), so a
   * count is honest for that one and unknowable for the rest. Say nothing
   * rather than guess.
   */
  const selectedBenchTakeLabel =
    selectedProject && selectedProject.id === activeProject?.id && takes.length
      ? `${takes.length} ${takes.length === 1 ? 'take' : 'takes'} in`
      : null

  useEffect(() => {
    if (!isOpen) return
    setSelectedBenchId(focusedPractice?.projectId ?? bench[0]?.project.id ?? '')
    // Only re-seed when the sheet opens, so a tap on another card sticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const resumePractice = async () => {
    const target = selectedProject
    if (!target || startingFocusedPractice) return
    setStartingFocusedPractice(true)
    setLaunchError('')
    try { await onResumeFocusedPractice(target.id) }
    catch { setLaunchError('Could not resume practice. Please try again.') }
    finally { setStartingFocusedPractice(false) }
  }

  const startFocusedPractice = async () => {
    if ((!selectedProjectId && !newPracticeItemName.trim()) || startingFocusedPractice) return
    setStartingFocusedPractice(true)
    setLaunchError('')
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    try {
      let projectId = selectedProjectId
      if (newPracticeItemName.trim()) {
        const project = await onCreatePracticeItem(newPracticeItemName.trim())
        projectId = project.id
        setSelectedProjectId(project.id)
        setNewPracticeItemName('')
      }
      // A routine step asked for a piece: bind it and let the step open.
      if (routineFocusRequest) await onBindRoutineFocus(projectId)
      else await onStartFocusedPractice(projectId)
    } catch { setLaunchError('Could not open this practice item. Please try again.') }
    finally {
      setStartingFocusedPractice(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="practice-menu-layer">
          <motion.button
            type="button"
            className="practice-menu-backdrop"
            aria-label="Close practice menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={iosFade}
            onClick={onClose}
          />

          <motion.section
            ref={dialogRef}
            className={`practice-menu-card ${page === 'home' ? 'practice-menu-card--home' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-menu-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={iosSpringSnappy}
            style={motionGpuLayer}
          >
            <header className="practice-menu-header">
              <div className="practice-menu-header-slot">
                {page !== 'home' ? (
                  <Pressable
                    type="button"
                    intensity="icon"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    onClick={page === 'routine' ? closeBuilder : leaveFocusedSetup}
                    className="practice-menu-icon-button"
                    aria-label="Back to Practice"
                  >
                    <ChevronLeft aria-hidden />
                  </Pressable>
                ) : (
                  <span aria-hidden />
                )}
              </div>

              <div className="practice-menu-title-block">
                <span>BestTake</span>
                <h2 id="practice-menu-title">
                  {page === 'focused-setup'
                    ? 'Choose what to practice'
                    : page === 'routine'
                      ? BUILDER_TITLE[builderView]
                      : 'Today’s practice'}
                </h2>
                {page === 'focused-setup' && (
                  <p>
                    {routineFocusRequest
                      ? `For your routine step · ${routineFocusRequest.title}`
                      : 'One focus. All your attempts, together.'}
                  </p>
                )}
                {page === 'routine' && builderView === 'edit' && (
                  <p>Each step opens the right tool, already set.</p>
                )}
              </div>

              <div className="practice-menu-header-slot practice-menu-header-slot--end">
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  onClick={onClose}
                  className="practice-menu-icon-button"
                  aria-label="Close practice menu"
                >
                  <X aria-hidden />
                </Pressable>
              </div>
            </header>

            <div className="practice-menu-scroll">
              {launchError && <p className="focus-error" role="alert">{launchError}</p>}
              <AnimatePresence mode="wait" initial={false}>
                {page === 'routine' && routineBuilderRequest ? (
                  <motion.div
                    key="routine-builder"
                    className="practice-menu-page"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={iosFade}
                  >
                    <RoutineBuilder
                      mode={routineBuilderRequest}
                      routine={routine}
                      instrumentId={instrumentId}
                      projects={projects}
                      liveDeskSnapshot={liveDeskSnapshot}
                      tunerTransposition={tunerTransposition}
                      hapticFeedback={hapticFeedback}
                      onSave={(next) => {
                        onSaveRoutine(next)
                        setPage('home')
                      }}
                      onDelete={() => {
                        onDeleteRoutine()
                        setPage('home')
                      }}
                      onCancel={closeBuilder}
                      onViewChange={setBuilderView}
                    />
                  </motion.div>
                ) : page === 'focused-setup' ? (
                  <motion.div
                    key="focused-setup"
                    className="practice-menu-page"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={iosFade}
                  >
                    <section className="practice-menu-section">
                      <h3>What are you working on?</h3>
                      <p className="practice-menu-note">
                        Choose an excerpt or name a new one. Your reference, desk, and takes stay with it across practice days.
                      </p>
                      <div className="practice-menu-form">
                        <label className="practice-menu-field">
                          <span>Continue an existing focus</span>
                          <select
                            value={selectedProjectId}
                            onChange={(event) => { setSelectedProjectId(event.target.value); setNewPracticeItemName('') }}
                          >
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="practice-menu-create-item">
                          <input
                            value={newPracticeItemName}
                            onChange={(event) => setNewPracticeItemName(event.target.value)}
                            placeholder="Or name a new one — measures 12–20…"
                            aria-label="Name a new practice focus"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void startFocusedPractice()
                            }}
                          />

                        </div>
                      </div>
                    </section>

                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      hapticFeedback={hapticFeedback}
                      className="practice-menu-primary"
                      disabled={(!selectedProjectId && !newPracticeItemName.trim()) || startingFocusedPractice}
                      onClick={() => void startFocusedPractice()}
                    >
                      {startingFocusedPractice
                        ? 'Opening recorder…'
                        : routineFocusRequest
                          ? newPracticeItemName.trim()
                            ? 'Create & use for this step'
                            : 'Use for this step'
                          : newPracticeItemName.trim()
                            ? 'Create & start practice'
                            : 'Start practicing'}
                    </Pressable>
                  </motion.div>
                ) : (
                  <motion.div
                    key="home"
                    className="practice-menu-page"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={iosFade}
                  >
                    <section className="practice-menu-focus-flow">
                      {routine && routine.steps.length > 0 ? (
                        <TodayBoard
                          routine={routine}
                          day={routineDay}
                          tunerTransposition={tunerTransposition}
                          hapticFeedback={hapticFeedback}
                          startingStepId={startingRoutineStepId}
                          onStartStep={(stepId) => void startRoutineStep(stepId)}
                          onToggleStep={onToggleRoutineStep}
                          onEdit={() => onOpenRoutineBuilder('edit')}
                        />
                      ) : (
                        <section className="routine-invite" aria-label="Daily routine">
                          <span className="practice-menu-eyebrow">Daily routine</span>
                          <h3>Your practice, ready when you are.</h3>
                          <p>
                            A short checklist. Each step opens the right tool — tuner, click, hands-free —
                            set the way you want it.
                          </p>
                          <Pressable
                            type="button"
                            intensity="soft"
                            haptic="light"
                            hapticFeedback={hapticFeedback}
                            className="practice-menu-primary"
                            onClick={() => onOpenRoutineBuilder('build')}
                          >
                            Plan my practice
                          </Pressable>
                          <Pressable
                            type="button"
                            intensity="soft"
                            haptic="light"
                            hapticFeedback={hapticFeedback}
                            className="routine-link"
                            onClick={() => onOpenRoutineBuilder('presets')}
                          >
                            Start with a suggested routine
                          </Pressable>
                        </section>
                      )}

                      <details className="practice-more" open={routine ? undefined : true}>
                      <summary>Practice something else</summary>
                      <div className="practice-home-intro practice-home-intro--secondary">
                        <span className="practice-menu-eyebrow">
                          Your practice items
                        </span>
                        <h3>
                          {resumeProject
                            ? 'Pick up where you left off.'
                            : routine
                              ? 'Or work on one thing.'
                              : 'Make room for a little practice.'}
                        </h3>
                      </div>

                      {resumeProject ? (
                        <>
                          <div
                            className="practice-bench"
                            role="group"
                            aria-label="What you are working on"
                          >
                            {bench.map((item) => (
                              <Pressable
                                key={item.project.id}
                                type="button"
                                intensity="soft"
                                haptic="light"
                                hapticFeedback={hapticFeedback}
                                className={`practice-bench-card ${item.project.id === selectedProject?.id ? 'is-live' : ''}`}
                                aria-pressed={item.project.id === selectedProject?.id}
                                onClick={() => setSelectedBenchId(item.project.id)}
                              >
                                <em>
                                  {item.age}
                                  {item.bestCount > 0 && <> · {item.bestCount} best</>}
                                </em>
                                <strong>{item.project.name}</strong>
                                <q>{item.intention || 'No note set yet.'}</q>
                              </Pressable>
                            ))}
                            <Pressable
                              type="button"
                              intensity="soft"
                              haptic="light"
                              hapticFeedback={hapticFeedback}
                              className="practice-bench-new"
                              onClick={() => setPage('focused-setup')}
                            >
                              <Plus aria-hidden />
                              <span>New item</span>
                            </Pressable>
                          </div>

                          {selectedBenchDesk && (
                            <p className="practice-bench-desk">Desk · {selectedBenchDesk}</p>
                          )}

                          <Pressable
                            type="button"
                            intensity="soft"
                            haptic="light"
                            hapticFeedback={hapticFeedback}
                            className="practice-menu-primary"
                            disabled={startingFocusedPractice}
                            onClick={() => void resumePractice()}
                          >
                            {startingFocusedPractice
                              ? 'Opening recorder…'
                              : selectedBenchTakeLabel
                                ? `Continue · ${selectedBenchTakeLabel}`
                                : 'Start practising'}
                          </Pressable>
                        </>
                      ) : (
                        <section className="practice-resume-card" aria-label="Choose a focus">
                          <span className="practice-menu-eyebrow">One thing at a time</span>
                          <h3>What are you working on?</h3>
                          <p>Choose an excerpt, a solo, or a technique.</p>
                          <Pressable type="button" intensity="soft" haptic="light" hapticFeedback={hapticFeedback}
                            className="practice-menu-primary" disabled={startingFocusedPractice}
                            onClick={() => setPage('focused-setup')}>
                            Choose an item
                          </Pressable>
                        </section>
                      )}

                      </details>
                      <Pressable type="button" intensity="soft" haptic="light" hapticFeedback={hapticFeedback}
                        className="practice-home-row" onClick={onOpenQuickPractice}>
                        <span className="practice-home-row-icon" aria-hidden><Disc3 /></span>
                        <span><strong>Just record</strong><small>Camera or audio, whenever you need it</small></span>
                        <ChevronRight className="practice-home-row-chevron" aria-hidden />
                      </Pressable>

                      <div className="practice-menu-focus-tools">
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenGames}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M8 9h8a5 5 0 0 1 4.7 6.7l-.7 2.1a2.4 2.4 0 0 1-4.2.7L14.5 17h-5l-1.3 1.5a2.4 2.4 0 0 1-4.2-.7l-.7-2.1A5 5 0 0 1 8 9Z" />
                            <path d="M8 12v4M6 14h4M16.5 13.5h.01M18.5 15.5h.01" />
                          </svg>
                          <strong>Games</strong>
                          <small>3 to play</small>
                        </Pressable>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenVault}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <rect x="3" y="4" width="18" height="16" rx="2.5" />
                            <circle cx="12" cy="12" r="3.2" />
                            <path d="M12 5.6v3.2" />
                          </svg>
                          <strong>Vault</strong>
                          <small>{projectBestCount > 0 ? `${projectBestCount} best` : 'All takes'}</small>
                        </Pressable>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenMetronome}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M12 2.5 19.5 20.5H4.5Z" />
                            <path d="M12 20.5 15.2 8.4" />
                          </svg>
                          <strong>Metronome</strong>
                          <small>{metronomePrefs ? `${metronomePrefs.bpm} BPM` : 'Saved'}</small>
                        </Pressable>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenTuner}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M9 3v8a3 3 0 0 0 6 0V3" />
                            <path d="M12 14v7" />
                          </svg>
                          <strong>Tuner</strong>
                          <small>{tunerProfile?.label ?? tunerKey.label}</small>
                        </Pressable>
                      </div>
                    </section>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ---- Today ------------------------------------------------------------------
 * The routine as a plain list. Tap a row to start it; tap the circle to check
 * it off without opening anything. One primary button says the next thing. */

interface TodayBoardProps {
  routine: Routine
  day: RoutineDay | null
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  startingStepId: string | null
  onStartStep: (stepId: string) => void
  onToggleStep: (stepId: string) => void
  onEdit: () => void
}

function TodayBoard({
  routine,
  day,
  tunerTransposition,
  hapticFeedback,
  startingStepId,
  onStartStep,
  onToggleStep,
  onEdit,
}: TodayBoardProps) {
  const progress = routineProgress(routine, day)
  const activeStep = day?.activeStepId
    ? routine.steps.find((step) => step.id === day.activeStepId) ?? null
    : null
  const next = activeStep ?? nextOpenStep(routine, day)
  const finished = !next && progress.total > 0
  const started = Boolean(day?.startedAt) && progress.done + (day?.skippedStepIds.length ?? 0) > 0
  const minutesSpent = day?.startedAt && day.completedAt
    ? Math.max(1, Math.round((day.completedAt - day.startedAt) / 60_000))
    : null

  const cta = progress.complete
    ? null
    : activeStep
      ? `Resume · ${activeStep.title}`
      : started && next
        ? `Continue · ${next.title}`
        : next ? `Start · ${next.title}` : 'Start practice'

  return (
    <section className={`routine-board ${finished ? 'is-complete' : ''}`} aria-label="Today's routine">
      <header className="routine-board__head">
        <div>
          <span className="practice-menu-eyebrow">Today · {describeToday()}</span>
          <h3>{routine.name}</h3>
          <p>
            {finished
              ? `${progress.done} completed${progress.total > progress.done ? ` · ${progress.total - progress.done} skipped` : ''}${minutesSpent ? ` · ${formatMinutes(minutesSpent)}` : ''}`
              : `${progress.done} of ${progress.total} done${progress.minutesLeft > 0 ? ` · ${formatMinutes(progress.minutesLeft)} left` : ''}`}
          </p>
        </div>
        <Pressable
          type="button"
          intensity="icon"
          haptic="light"
          hapticFeedback={hapticFeedback}
          className="practice-menu-icon-button routine-board__edit"
          aria-label="Edit routine"
          onClick={onEdit}
        >
          <Pencil aria-hidden />
        </Pressable>
      </header>

      <div className="routine-board__track" aria-hidden>
        {routine.steps.map((step) => (
          <i
            key={step.id}
            className={
              isStepDone(day, step.id)
                ? 'is-done'
                : isStepSkipped(day, step.id)
                  ? 'is-skipped'
                  : step.id === activeStep?.id
                    ? 'is-active'
                    : ''
            }
          />
        ))}
      </div>

      {next && !progress.complete && <div className="routine-next-item">
        <span className="practice-menu-eyebrow">{activeStep ? 'Pick up here' : 'Up next'}</span>
        <h4>{next.title}</h4>
        <p>{summarizeStep(next, tunerTransposition)}</p>
        <Pressable type="button" intensity="soft" haptic="light" hapticFeedback={hapticFeedback}
          className="practice-menu-primary" disabled={startingStepId !== null}
          onClick={() => onStartStep(next.id)}>{startingStepId ? 'Opening…' : cta}</Pressable>
      </div>}
      <span className="practice-menu-eyebrow">Your session</span>
      <ol className="routine-board__list">
        {routine.steps.map((step, index) => {
          const done = isStepDone(day, step.id)
          const skipped = isStepSkipped(day, step.id)
          const active = step.id === activeStep?.id
          const isNext = !progress.complete && step.id === next?.id
          const summary = summarizeStep(step, tunerTransposition)
          return (
            <li
              key={step.id}
              className={`routine-row ${done ? 'is-done' : ''} ${skipped ? 'is-skipped' : ''} ${active ? 'is-active' : ''} ${isNext ? 'is-next' : ''}`}
              aria-current={active || isNext ? 'step' : undefined}
            >
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-row__check"
                role="checkbox"
                aria-checked={done}
                aria-label={done ? `Uncheck ${step.title}` : `Check off ${step.title}`}
                onClick={() => onToggleStep(step.id)}
              >
                {done ? <Check aria-hidden /> : <span>{index + 1}</span>}
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-row__main"
                disabled={startingStepId !== null}
                onClick={() => onStartStep(step.id)}
              >
                <strong>{step.title}</strong>
                <small>{skipped ? `Skipped · ${summary}` : summary || 'Tap to start'}</small>
              </Pressable>
              <span className="routine-row__go" aria-hidden>
                {active ? <em>Now</em> : <Play />}
              </span>
            </li>
          )
        })}
      </ol>

      {finished ? (
        <div className="routine-done">
          <Check aria-hidden />
          <div>
            <strong>Today’s practice is saved.</strong>
            <small>{progress.done === progress.total ? 'A good place to pause. Your tools will be ready next time.' : 'You can come back to the skipped items whenever you’re ready.'}</small>
          </div>
        </div>
      ) : null}
    </section>
  )
}
