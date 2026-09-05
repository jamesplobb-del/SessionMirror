import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Pencil,
  Play,
  X,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import { iosFade, iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import {
  INSTRUMENT_FAMILIES,
  describeHandsFreeGate,
  getInstrumentProfile,
  getInstrumentProfilesByFamily,
  instrumentHeading,
} from '../utils/instrumentProfiles'
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
import {
  buildPresetRoutine,
  getRoutinePresets,
  getStepTemplates,
  presetMinutes,
  type RoutinePreset,
} from '../utils/routinePresets'

/** A session is the specific thing being worked on — an excerpt, solo, or
 * technique. It's just a Project: its name IS the focus, and it accumulates
 * takes over as many sittings as it takes to get right. */
export interface FocusedPracticeSelection {
  projectId: string
  focusArea: string
}

const DAY_MS = 86_400_000
const SITTING_WAVE_BARS = 15

function SittingWave({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`sitting-wave${compact ? ' sitting-wave--compact' : ''}`} aria-hidden>
      {Array.from({ length: SITTING_WAVE_BARS }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  )
}

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
  onSelectInstrument: (instrumentId: string) => void
  onStartRoutineStep: (stepId: string) => void | Promise<void>
  onToggleRoutineStep: (stepId: string) => void
  onOpenRoutineBuilder: (mode: RoutineBuilderMode) => void
  onCloseRoutineBuilder: () => void
  onSaveRoutine: (routine: Routine) => void
  onDeleteRoutine: () => void
  onBindRoutineFocus: (projectId: string) => void | Promise<void>
  onCancelRoutineFocus: () => void
}

type HubPage = 'home' | 'focused-setup' | 'routine' | 'instrument'

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
  bestTakeHistory,
  focusedPractice,
  practiceItemStates,
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
  onSelectInstrument,
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
  const pageRef = useRef<HubPage>(page)
  pageRef.current = page
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
    else if (pageRef.current === 'routine') setPage('home')
  }, [routineBuilderRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return
    if (routineFocusRequest) setPage('focused-setup')
  }, [routineFocusRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The builder body needs both the page and the request; the header only
   * checked the page, so clearing the request left "Your routine" sitting over
   * the home content. Deriving one value makes that desync impossible.
   */
  const activePage: HubPage =
    page === 'routine' && !routineBuilderRequest ? 'home' : page

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
      if (pageRef.current === 'instrument') {
        setPage('home')
        return
      }
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

  const instrumentProfile = instrumentId ? getInstrumentProfile(instrumentId) : undefined
  const tunerKey = getTunerTransposition(
    instrumentProfile?.tunerTransposition ?? tunerTransposition,
  )
  const homeSubtitle = instrumentProfile
    ? `${tunerKey.id === 'concert' ? 'Concert pitch' : `Written ${tunerKey.shortLabel}`} · ${describeHandsFreeGate(instrumentProfile.soundVolumeThreshold)}`
    : 'Sets the tuner, written pitch, and gate'
  const homePresets = useMemo(() => getRoutinePresets(instrumentId), [instrumentId])
  const homePresetTemplates = useMemo(() => getStepTemplates(instrumentId), [instrumentId])

  const applyHomePreset = (preset: RoutinePreset) => {
    const built = buildPresetRoutine(preset, instrumentId)
    onSaveRoutine({ ...built, name: 'Daily routine' })
  }

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
  const routineProjectIds = useMemo(() => {
    const ids = new Set<string>()
    for (const step of routine?.steps ?? []) {
      if (step.projectId) ids.add(step.projectId)
    }
    return ids
  }, [routine])
  const onBench = bench.find((item) => !routineProjectIds.has(item.project.id)) ?? null

  const resumePractice = async (projectId?: string) => {
    const targetId = projectId ?? onBench?.project.id ?? resumeProject?.id
    if (!targetId || startingFocusedPractice) return
    setStartingFocusedPractice(true)
    setLaunchError('')
    try {
      await onResumeFocusedPractice(targetId)
    } catch {
      setLaunchError('Could not resume practice. Please try again.')
    } finally {
      setStartingFocusedPractice(false)
    }
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
                {activePage !== 'home' ? (
                  <Pressable
                    type="button"
                    intensity="icon"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    onClick={
                      activePage === 'routine'
                        ? closeBuilder
                        : activePage === 'instrument'
                          ? () => setPage('home')
                          : leaveFocusedSetup
                    }
                    className="practice-menu-icon-button"
                    aria-label="Back"
                  >
                    <ChevronLeft aria-hidden />
                  </Pressable>
                ) : (
                  <span aria-hidden />
                )}
              </div>

              <div className="practice-menu-title-block">
                <span>BestTake</span>
                {activePage === 'home' ? (
                  <h2 id="practice-menu-title">
                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      hapticFeedback={hapticFeedback}
                      className="practice-menu-instrument-title"
                      aria-label={
                        instrumentProfile
                          ? `${instrumentProfile.label}. Change instrument.`
                          : 'Choose your instrument'
                      }
                      onClick={() => setPage('instrument')}
                    >
                      <span>{instrumentHeading(instrumentId)}</span>
                      <ChevronDown aria-hidden />
                    </Pressable>
                  </h2>
                ) : (
                  <h2 id="practice-menu-title">
                    {activePage === 'focused-setup'
                      ? 'Choose what to practice'
                      : activePage === 'routine'
                        ? BUILDER_TITLE[builderView]
                        : 'Instrument'}
                  </h2>
                )}
                {activePage === 'home' && <p>{homeSubtitle}</p>}
                {activePage === 'instrument' && (
                  <p>Sets tuner, written pitch, and the gate</p>
                )}
                {activePage === 'focused-setup' && (
                  <p>
                    {routineFocusRequest
                      ? `For your routine step · ${routineFocusRequest.title}`
                      : 'One focus. All your attempts, together.'}
                  </p>
                )}
                {activePage === 'routine' && builderView === 'edit' && (
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
                {activePage === 'routine' && routineBuilderRequest ? (
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
                ) : activePage === 'focused-setup' ? (
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
                ) : activePage === 'instrument' ? (
                  <motion.div
                    key="instrument"
                    className="practice-menu-page"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={iosFade}
                  >
                    <InstrumentSheet
                      selectedId={instrumentId}
                      hapticFeedback={hapticFeedback}
                      hasRoutine={Boolean(routine && routine.steps.length > 0)}
                      onSelect={(id) => {
                        onSelectInstrument(id)
                        setPage('home')
                      }}
                    />
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
                        <section className="routine-invite" aria-label="This sitting">
                          <SittingWave />
                          <h3>What&rsquo;s the plan today?</h3>
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
                          {homePresets.length > 0 && (
                            <div className="routine-home-presets">
                              <span className="practice-menu-eyebrow">Or start from a preset</span>
                              {homePresets.map((preset) => {
                                const titles = preset.templateIds
                                  .map((id) => homePresetTemplates.find((template) => template.id === id)?.title)
                                  .filter((title): title is string => Boolean(title))
                                return (
                                  <Pressable
                                    key={preset.id}
                                    type="button"
                                    intensity="soft"
                                    haptic="light"
                                    hapticFeedback={hapticFeedback}
                                    className="routine-home-preset"
                                    onClick={() => applyHomePreset(preset)}
                                  >
                                    <span className="routine-home-preset__head">
                                      <strong>{preset.name}</strong>
                                      <em>
                                        {formatMinutes(presetMinutes(preset, instrumentId))}
                                        {' · '}
                                        {titles.length} steps
                                      </em>
                                    </span>
                                    <ol>
                                      {titles.slice(0, 5).map((title) => (
                                        <li key={title}>{title}</li>
                                      ))}
                                    </ol>
                                  </Pressable>
                                )
                              })}
                            </div>
                          )}
                        </section>
                      )}

                      {routine && routine.steps.length > 0 && onBench ? (
                        <section className="practice-on-bench" aria-label="On the bench">
                          <span className="practice-menu-eyebrow">On the bench</span>
                          <Pressable
                            type="button"
                            intensity="soft"
                            haptic="light"
                            hapticFeedback={hapticFeedback}
                            className="practice-on-bench__card"
                            disabled={startingFocusedPractice}
                            onClick={() => void resumePractice(onBench.project.id)}
                          >
                            <strong>{onBench.project.name}</strong>
                            <small>
                              {onBench.age}
                              {onBench.project.id === focusedPractice?.projectId && focusDeskSummary
                                ? ` · ${focusDeskSummary}`
                                : ''}
                              {' · Open outside the routine'}
                            </small>
                          </Pressable>
                        </section>
                      ) : null}
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
                          <small>{instrumentProfile?.label ?? tunerKey.label}</small>
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

/* ---- Instrument -------------------------------------------------------------
 * Same families as onboarding. Gold marks the horn in use. Switching does not
 * clear today's checks. */

interface InstrumentSheetProps {
  selectedId: string | null
  hapticFeedback: boolean
  hasRoutine: boolean
  onSelect: (instrumentId: string) => void
}

function InstrumentSheet({
  selectedId,
  hapticFeedback,
  hasRoutine,
  onSelect,
}: InstrumentSheetProps) {
  return (
    <section className="practice-instrument" aria-label="Instrument">
      {INSTRUMENT_FAMILIES.map((family) => (
        <div key={family} className="practice-instrument__family">
          <span className="practice-menu-eyebrow">{family}</span>
          <ul className="practice-instrument__list">
            {getInstrumentProfilesByFamily(family).map((profile) => {
              const selected = profile.id === selectedId
              const written = getTunerTransposition(profile.tunerTransposition)
              return (
                <li key={profile.id}>
                  <Pressable
                    type="button"
                    intensity="soft"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    className={`practice-instrument__row ${selected ? 'is-on' : ''}`}
                    aria-pressed={selected}
                    onClick={() => onSelect(profile.id)}
                  >
                    <span>
                      <strong>{profile.label}</strong>
                      <small>
                        {written.id === 'concert' ? 'Concert pitch' : `Written ${written.shortLabel}`}
                        {' · '}
                        {describeHandsFreeGate(profile.soundVolumeThreshold)}
                      </small>
                    </span>
                    {selected ? <em>Now</em> : null}
                  </Pressable>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <p className="practice-menu-note">
        {hasRoutine
          ? 'Switching horns retunes the app. Today’s checks and the desks you built stay.'
          : 'This sets the tuner, the written pitch, and how loud a note must be to start a take.'}
      </p>
    </section>
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
      <SittingWave compact />
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
