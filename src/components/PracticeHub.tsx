import type { DailyChallengePlan } from '../utils/dailyChallengePlan'
import DailyChallenges from './DailyChallenges'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Play,
  X,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import { iosFade, iosSpringSnappy, motionExitHide, motionGpuLayer } from '../utils/motionPresets'
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
import type { Project } from '../db'
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
import {
  type RoutineBuilderMode,
} from './RoutineBuilder'
import GuidedRoutineBuilder from './GuidedRoutineBuilder'
import RoutineProgressSummary from './RoutineProgressSummary'
import './practice-home.css'


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

interface PracticeHubProps {
  isOpen: boolean
  projects: Project[]
  takes: Take[]
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onClose: () => void
  onOpenQuickPractice: () => void
  onOpenGames: () => void
  onDailyPractice: (plan: DailyChallengePlan) => void
  onDailyGame: (plan: DailyChallengePlan) => void
  onOpenVault: () => void
  onOpenTuner: () => void
  onOpenMetronome: () => void
  /** Opens Music as its own room, not as a Tools tab. */
  onOpenMusic?: () => void

  /* ---- Daily routine ---- */
  routine: Routine | null
  routineDay: RoutineDay | null
  /** Non-null opens the builder in that mode when the sheet shows. */
  routineBuilderRequest: RoutineBuilderMode | null
  instrumentId: string | null
  liveDeskSnapshot: DeskSnapshot
  onSelectInstrument: (instrumentId: string) => void
  onOpenItemHistory?: (projectId: string, title: string) => void
  onStartRoutineStep: (stepId: string) => void | Promise<void>
  onToggleRoutineStep: (stepId: string) => void
  onOpenRoutineBuilder: (mode: RoutineBuilderMode) => void
  onCloseRoutineBuilder: () => void
  onSaveRoutine: (routine: Routine) => void
  /** Creates the practice folder a routine step needs when music is pinned to it. */
  onCreatePracticeItem: (title: string) => Promise<string>
  /** Saves, then opens the routine's next step; rejects if that step cannot open. */
  onSaveAndStartRoutine: (routine: Routine) => Promise<void>
  onDeleteRoutine: () => void
}

type HubPage = 'home' | 'routine' | 'instrument' | 'today'

export default function PracticeHub({
  isOpen,
  projects,
  tunerTransposition,
  hapticFeedback,
  onClose,
  onOpenQuickPractice,
  onOpenVault,
  onOpenGames,
  onDailyPractice,
  onDailyGame,
  onOpenTuner,
  onOpenMetronome,
  onOpenMusic,
  routine,
  routineDay,
  routineBuilderRequest,
  instrumentId,
  liveDeskSnapshot,
  onSelectInstrument,
  onOpenItemHistory,
  onStartRoutineStep,
  onToggleRoutineStep,
  onOpenRoutineBuilder,
  onCloseRoutineBuilder,
  onSaveRoutine,
  onSaveAndStartRoutine,
  onCreatePracticeItem,
  onDeleteRoutine,
}: PracticeHubProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()
  const [page, setPage] = useState<HubPage>('home')
  const pageRef = useRef<HubPage>(page)
  pageRef.current = page
  const [launchError, setLaunchError] = useState('')
  const [startingRoutineStepId, setStartingRoutineStepId] = useState<string | null>(null)
  const [metronomePrefs, setMetronomePrefs] = useState<MetronomePrefs | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setPage(routineBuilderRequest ? 'routine' : 'home')
    setLaunchError('')
    setMetronomePrefs(loadMetronomePrefs())
  }, [isOpen])

  // A builder request can arrive while the sheet is already up.
  useEffect(() => {
    if (!isOpen) return
    if (routineBuilderRequest) setPage('routine')
    else if (pageRef.current === 'routine') setPage('home')
  }, [routineBuilderRequest]) // eslint-disable-line react-hooks/exhaustive-deps


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

  /** Built and ready: save it, then go straight into its first open step. */
  const startingSavedRoutineRef = useRef(false)
  const saveAndStartRoutine = async (next: Routine) => {
    if (startingSavedRoutineRef.current) return
    startingSavedRoutineRef.current = true
    setLaunchError('')
    try {
      await onSaveAndStartRoutine(next)
    } catch {
      setPage('home')
      setLaunchError('Your routine is saved, but it could not start. Open Today’s routine to try again.')
    } finally {
      startingSavedRoutineRef.current = false
    }
  }

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus())

    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]'))
          .filter(element => element.getClientRects().length > 0)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault(); last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus()
        }
        return
      }
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

  const instrumentProfile = instrumentId ? getInstrumentProfile(instrumentId) : undefined
  const tunerKey = getTunerTransposition(
    instrumentProfile?.tunerTransposition ?? tunerTransposition,
  )
  const homeSubtitle = instrumentProfile
    ? `${tunerKey.id === 'concert' ? 'Concert pitch' : `Written ${tunerKey.shortLabel}`} · ${describeHandsFreeGate(instrumentProfile.soundVolumeThreshold)}`
    : 'Sets the tuner, written pitch, and gate'
  const homeDay = routineDay?.routineId === routine?.id ? routineDay : null
  const homeProgress = routine ? routineProgress(routine, homeDay) : null
  const homeNext = routine ? routine.steps.find(item => item.id === (homeDay?.activeStepId ?? homeDay?.pausedStepId)) ?? nextOpenStep(routine, homeDay) : null
  const homeRoutineLabel = !routine?.steps.length ? 'Build your routine'
    : homeProgress?.complete || !homeNext ? 'Routine complete'
    : homeDay?.startedAt ? 'Continue your routine' : 'Start your routine'


  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="practice-menu"
          className={`practice-menu-layer ${activePage === 'routine' ? 'practice-menu-layer--routine-guide' : activePage === 'home' ? 'practice-menu-layer--home' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transitionEnd: motionExitHide }}
          transition={iosFade}
          style={motionGpuLayer}
        >
          <button
            type="button"
            className="practice-menu-backdrop"
            aria-label="Close practice menu"
            onClick={onClose}
          />

          <motion.section
            ref={dialogRef}
            className={`practice-menu-card ${activePage === 'home' ? 'practice-menu-card--electric-edge' : ''} ${activePage === 'routine' ? 'practice-menu-card--routine-guide' : page === 'home' ? 'practice-menu-card--home' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={activePage === 'routine' ? undefined : 'practice-menu-title'}
            aria-label={activePage === 'routine' ? 'Build your routine' : undefined}
            tabIndex={-1}
            initial={{ transform: activePage === 'routine' || reducedMotion ? 'translateY(0px) scale(1)' : 'translateY(10px) scale(.96)' }}
            animate={{ transform: 'translateY(0px) scale(1)' }}
            exit={{ transform: activePage === 'routine' || reducedMotion ? 'translateY(0px) scale(1)' : 'translateY(8px) scale(.97)' }}
            transition={iosSpringSnappy}
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
                          : () => setPage('home')
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
                {activePage === 'home' ? (
                  <h2 id="practice-menu-title" className="practice-home-brand">
                    <img src="/icons/signal.svg" alt="" aria-hidden />
                    BestTake
                  </h2>
                ) : (
                  <>
                    <span>BestTake</span>
                    <h2 id="practice-menu-title">
                      {activePage === 'routine'
                          ? 'Your routine'
                          : activePage === 'today' ? 'Today’s routine' : 'Instrument'}
                    </h2>
                  </>
                )}
                {activePage === 'instrument' && (
                  <p>Sets tuner, written pitch, and the gate</p>
                )}
                {activePage === 'routine' && (
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
                    initial={{ opacity: 0, x: reducedMotion ? 0 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reducedMotion ? 0 : 8 }}
                    transition={iosFade}
                  >
                    <GuidedRoutineBuilder
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
                      onSaveAndStart={(next) => void saveAndStartRoutine(next)}
                      onCreatePracticeItem={onCreatePracticeItem}
                      todayStarted={Boolean(routine && routineDay?.routineId === routine.id && routineDay.startedAt)}
                      onDelete={() => {
                        onDeleteRoutine()
                        setPage('home')
                      }}
                      onCancel={closeBuilder}
                    />
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
                ) : activePage === 'today' && routine ? (
                  <div key="today" className="practice-menu-page">
                    <RoutineHomeDisclosure routine={routine} day={routineDay} tunerTransposition={tunerTransposition}
                      hapticFeedback={hapticFeedback} startingStepId={startingRoutineStepId} onOpenItemHistory={onOpenItemHistory}
                      onStartStep={(stepId) => void startRoutineStep(stepId)} onToggleStep={onToggleRoutineStep}
                      onEdit={() => onOpenRoutineBuilder('edit')} />
                  </div>
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
                      <Pressable type="button" intensity="soft" haptic="light" hapticFeedback={hapticFeedback}
                        className="practice-home-instrument" onClick={() => setPage('instrument')}
                        aria-label={instrumentProfile ? `${instrumentProfile.label}. Change instrument.` : 'Choose your instrument'}
                        aria-describedby="practice-home-instrument-description">
                        <span className="practice-home-instrument-copy">
                          <small>Your instrument</small>
                          <strong>{instrumentId ? instrumentHeading(instrumentId) : 'Choose instrument'}</strong>
                        </span>
                        <span className="practice-home-instrument-change">Change <ChevronDown aria-hidden /></span>
                      </Pressable>
                      <span id="practice-home-instrument-description" className="practice-home-sr-only">{homeSubtitle}</span>
                      <div className="practice-home-launch-actions" aria-label="Start practicing">
                        <Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} className="practice-home-launch-button is-primary practice-home-record-launch" onClick={onOpenQuickPractice}>
                          <span className="practice-home-launch-copy"><small>Your next great take</small><strong>Record & compare</strong><em>Play. Listen back. Keep your best.</em></span><ChevronRight aria-hidden />
                          <svg className="practice-home-signal-detail" viewBox="0 0 180 55" fill="none" aria-hidden><path d="M0 28h20l5-7 6 14 7-25 8 36 8-29 7 20 6-9h23l5-12 6 25 8-34 8 43 8-27 6 12 5-7h39" stroke="currentColor" strokeWidth="1.6" /></svg>
                        </Pressable>
                        <Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} className="practice-home-launch-button is-quick practice-home-routine-launch" disabled={startingRoutineStepId !== null} onClick={() => {
                          if (!routine?.steps.length) onOpenRoutineBuilder('build')
                          else if (homeNext && !homeProgress?.complete) void startRoutineStep(homeNext.id)
                          else setPage('today')
                        }}><span className="practice-home-launch-copy"><small>{routine?.name || 'A little structure, when you want it'}</small><strong>{startingRoutineStepId ? 'Opening…' : homeRoutineLabel}</strong><em>{homeProgress ? `${homeProgress.done} of ${homeProgress.total} exercises completed` : 'Start with a ready-to-play plan'}</em></span><ChevronRight aria-hidden /></Pressable>
                      </div>
                      <div className="practice-home-links">
                        <button className="practice-home-library" onClick={onOpenVault}><span>Take library<small>Recordings & best takes</small></span><ChevronRight aria-hidden /></button>
                        <button className="practice-home-library" onClick={() => onOpenRoutineBuilder('build')}><span>Your routines<small>Plans & exercises</small></span><ChevronRight aria-hidden /></button>
                      </div>

                      <DailyChallenges routine={routine} day={routineDay} instrumentId={instrumentId}
                        onPractice={onDailyPractice} onGame={onDailyGame} />

                      <div className="practice-menu-focus-tools" aria-label="Practice tools">
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
                          <small>{instrumentId ? instrumentHeading(instrumentId) : tunerKey.shortLabel}</small>
                        </Pressable>
                        {onOpenMusic && (
                          <Pressable
                            type="button"
                            intensity="soft"
                            haptic="light"
                            hapticFeedback={hapticFeedback}
                            className="practice-menu-shortcut"
                            onClick={onOpenMusic}
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
                              <path d="M6 4h9.5a1.5 1.5 0 0 1 1.5 1.5V20H7.5A1.5 1.5 0 0 1 6 18.5V4Z" />
                              <path d="M9 8h6M9 12h6M9 16h3" />
                            </svg>
                            <strong>Music</strong>
                            <small>On the stand</small>
                          </Pressable>
                        )}
                      </div>
                    </section>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </motion.div>
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
  onOpenItemHistory?: (projectId: string, title: string) => void
  onStartStep: (stepId: string) => void
  onToggleStep: (stepId: string) => void
  onEdit: () => void
  compact?: boolean
}

function RoutineHomeDisclosure(props: TodayBoardProps) {
  const { routine, day } = props
  const progress = routineProgress(routine, day)
  const skipped = day?.skippedStepIds.length ?? 0
  const status = progress.complete
    ? 'Complete for today'
    : `${progress.done} of ${progress.total} done${progress.minutesLeft > 0 ? ` · ${formatMinutes(progress.minutesLeft)} left` : ''}`

  return (
    <details className="practice-home-disclosure practice-home-routine">
      <summary>
        <span className={`practice-home-routine__count ${progress.complete ? 'is-complete' : ''}`} aria-hidden>
          {progress.complete ? <Check /> : `${progress.done}/${progress.total}`}
        </span>
        <span className="practice-home-disclosure__copy">
          <small>Today&rsquo;s routine</small>
          <strong>{routine.name}</strong>
          <em>{status}{skipped > 0 && !progress.complete ? ` · ${skipped} skipped` : ''}</em>
        </span>
        <ChevronDown aria-hidden />
      </summary>
      <div className="practice-home-routine__content">
        <TodayBoard {...props} compact />
      </div>
    </details>
  )
}

function TodayBoard({
  routine,
  day,
  tunerTransposition,
  hapticFeedback,
  startingStepId,
  onOpenItemHistory,
  onStartStep,
  onToggleStep,
  onEdit,
  compact = false,
}: TodayBoardProps) {
  const progress = routineProgress(routine, day)
  const resumableId = day?.activeStepId ?? day?.pausedStepId
  const activeStep = resumableId
    ? routine.steps.find((step) => step.id === resumableId) ?? null
    : null
  const next = activeStep ?? nextOpenStep(routine, day)
  const finished = !next && progress.total > 0
  const started = Boolean(day?.startedAt) && progress.done + (day?.skippedStepIds.length ?? 0) > 0
  const activeMinutes = Object.values(day?.elapsedMsByStep ?? {}).reduce((sum, ms) => sum + ms, 0) / 60_000
  const minutesSpent = activeMinutes >= 1 ? Math.round(activeMinutes) : null

  const cta = progress.complete
    ? null
    : activeStep
      ? 'Resume'
      : started && next
        ? 'Continue'
        : next ? 'Start' : 'Start practice'

  return (
    <section className={`routine-board ${compact ? 'routine-board--compact' : ''} ${finished ? 'is-complete' : ''}`} aria-label="Today's routine">
      {!compact ? <SittingWave compact /> : null}
      {!compact ? (
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
      ) : null}

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
                {(skipped || !next || step.id !== next.id) &&
                  <small>{skipped ? `Skipped · ${summary}` : summary || 'Tap to start'}</small>}
              </Pressable>
              <span className="routine-row__go" aria-hidden>
                {active ? <em>{day?.pausedStepId === step.id ? 'Paused' : 'Now'}</em> : <Play />}
              </span>
            </li>
          )
        })}
      </ol>

      <RoutineProgressSummary day={day} onOpenHistory={onOpenItemHistory} />
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
