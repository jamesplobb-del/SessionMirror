import { PremiumPicker } from './ui/PremiumPicker'
import PremiumFlowPage from './ui/PremiumFlowPage'
import PremiumDisclosure from './ui/PremiumDisclosure'
import { PremiumMotionDiv, PremiumMotionSection } from './ui/PremiumMotionSurface'
import type { DailyChallengePlan } from '../utils/dailyChallengePlan'
import DailyChallenges from './DailyChallenges'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Play,
  CircleDot,
  ListMusic,
  Settings,
  X,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import { motionExitHide, motionGpuLayer } from '../utils/motionPresets'
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
import MusicRoutineBuilder from './MusicRoutineBuilder'
import RoutineProgressSummary from './RoutineProgressSummary'
import { hasPracticeChart } from '../utils/practiceChartStorage'
import type { LastPracticeDestination } from '../utils/lastPracticeDestination'
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
  /** The player's saved hands-free gate, not the instrument preset. */
  handsFreeThreshold: number
  hapticFeedback: boolean
  onClose: () => void
  onOpenSettings?: () => void
  /** Optional inline routine summary, shared by the design review and a future approved Home. */
  showHomeRoutineSummary?: boolean
  onOpenQuickPractice: () => void
  onOpenGames: () => void
  onDailyPractice: (plan: DailyChallengePlan) => void
  onDailyGame: (plan: DailyChallengePlan) => void
  onOpenVault: () => void
  onOpenTuner: () => void
  onOpenMetronome: () => void
  /** Opens the Music library in the first Tools tab. */
  onOpenMusic?: () => void
  lastPracticeDestination?: LastPracticeDestination | null
  onContinueMusic?: (projectId: string) => Promise<void>

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

const HUB_PAGE_STORAGE_KEY = 'SessionMirror.practiceHubPage'

/**
 * Only the two pages a practitioner moves between deliberately. The builder is
 * opened by a request and the instrument picker is a one-off errand, so neither
 * should be what the hub reopens on.
 */
function loadHubPage(): HubPage {
  try {
    return localStorage.getItem(HUB_PAGE_STORAGE_KEY) === 'today' ? 'today' : 'home'
  } catch {
    return 'home'
  }
}

function saveHubPage(page: HubPage): void {
  if (page !== 'home' && page !== 'today') return
  try {
    localStorage.setItem(HUB_PAGE_STORAGE_KEY, page)
  } catch {
    /* private mode or full storage: the hub simply opens on home next time */
  }
}

export default function PracticeHub({
  isOpen,
  projects,
  takes,
  tunerTransposition,
  handsFreeThreshold,
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
  lastPracticeDestination = null,
  onContinueMusic,
  onOpenSettings,
  showHomeRoutineSummary = false,
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
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false)
  const [page, setPage] = useState<HubPage>(loadHubPage)
  const pageRef = useRef<HubPage>(page)
  pageRef.current = page
  useEffect(() => { saveHubPage(page) }, [page])
  const [launchError, setLaunchError] = useState('')
  const [startingRoutineStepId, setStartingRoutineStepId] = useState<string | null>(null)
  const [startingMusic, setStartingMusic] = useState(false)
  const [metronomePrefs, setMetronomePrefs] = useState<MetronomePrefs | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setPage(routineBuilderRequest ? 'routine' : loadHubPage())
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
    } catch (cause) {
      setLaunchError(cause instanceof Error ? cause.message : 'Could not open this step. Please try again.')
    } finally {
      setStartingRoutineStepId(null)
    }
  }
  const continueMusic = async (projectId: string) => {
    if (startingMusic || !onContinueMusic) return
    setStartingMusic(true)
    setLaunchError('')
    try { await onContinueMusic(projectId) }
    catch { setLaunchError('Could not reopen that music. Choose it again from the music library.') }
    finally { setStartingMusic(false) }
  }

  /** Built and ready: save it, then go straight into its first open step. */
  const startingSavedRoutineRef = useRef(false)
  const saveAndStartRoutine = async (next: Routine) => {
    if (startingSavedRoutineRef.current) return
    startingSavedRoutineRef.current = true
    setLaunchError('')
    try {
      await onSaveAndStartRoutine(next)
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
  const tunerKey = getTunerTransposition(tunerTransposition)
  const homeSubtitle = instrumentProfile
    ? `${tunerKey.id === 'concert' ? 'Concert pitch' : `Written ${tunerKey.shortLabel}`} · ${describeHandsFreeGate(handsFreeThreshold)}`
    : 'Sets practice suggestions and input sensitivity; tuner notes follow your part'
  const homeDay = routineDay?.routineId === routine?.id ? routineDay : null
  const homeProgress = routine ? routineProgress(routine, homeDay) : null
  const homeNext = routine ? routine.steps.find(item => item.id === (homeDay?.activeStepId ?? homeDay?.pausedStepId)) ?? nextOpenStep(routine, homeDay) : null
  const lastMusic = lastPracticeDestination?.kind === 'music' && onContinueMusic
    ? projects.find(project => project.id === lastPracticeDestination.projectId && hasPracticeChart(project.id))
    : null
  const homeRoutineLabel = !routine?.steps.length ? 'Try a suggested routine'
    : homeProgress?.complete || !homeNext ? 'Routine complete'
    : homeDay?.startedAt ? 'Continue your routine' : 'Start your routine'


  if (typeof document === 'undefined') return null

  return createPortal(
    <>
    <AnimatePresence initial={false}>
      {isOpen && (
        <PremiumMotionDiv
          key="practice-menu"
          className={`practice-menu-layer ${activePage === 'routine' ? 'practice-menu-layer--routine-guide' : activePage === 'home' ? 'practice-menu-layer--home' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transitionEnd: motionExitHide }}
          transition={reducedMotion ? {duration:.12} : {duration:.468,ease:[.22,1,.36,1]}}
          style={motionGpuLayer}
        >
          <button
            type="button"
            className="practice-menu-backdrop"
            aria-label="Close practice menu"
            onClick={onClose}
          />

          <PremiumMotionSection
            ref={dialogRef}
            className={`practice-menu-card ${activePage === 'home' ? 'practice-menu-card--electric-edge' : ''} ${activePage === 'routine' ? 'practice-menu-card--routine-guide' : page === 'home' ? 'practice-menu-card--home' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={activePage === 'routine' ? undefined : 'practice-menu-title'}
            aria-label={activePage === 'routine' ? 'Build your routine' : undefined}
            tabIndex={-1}
            initial={{ transform: activePage === 'routine' || reducedMotion ? 'translateY(0px) scale(1)' : 'translateY(28px) scale(.95)' }}
            animate={{ transform: 'translateY(0px) scale(1)' }}
            exit={{ transform: activePage === 'routine' || reducedMotion ? 'translateY(0px) scale(1)' : 'translateY(18px) scale(.975)' }}
            transition={reducedMotion ? {duration:.12} : {type:"spring",duration:.72,bounce:.06}}
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
                  <p>Sets practice suggestions and input sensitivity; tuner notes follow your part</p>
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
                  onClick={activePage === 'home' && onOpenSettings ? onOpenSettings : onClose}
                  className="practice-menu-icon-button"
                  aria-label={activePage === 'home' && onOpenSettings ? 'Open settings' : 'Close practice menu'}
                >
                  {activePage === 'home' && onOpenSettings ? <Settings aria-hidden /> : <X aria-hidden />}
                </Pressable>
              </div>
            </header>

            <div className="practice-menu-scroll">
              {launchError && <p className="focus-error" role="alert">{launchError}</p>}
              {/* Internal navigation replaces content immediately; keep sheet motion separate. */}
                {activePage === 'routine' && routineBuilderRequest ? (
                  <PremiumMotionDiv
                    key="routine-builder"
                    className="practice-menu-page"
                    initial={{ transform: `translateX(${reducedMotion ? 0 : 8}px)` }}
                    animate={{ transform: 'translateX(0px)' }}
                    transition={{ duration: reducedMotion ? 0 : .558, ease: [.22, 1, .36, 1] }}
                  >
                    <MusicRoutineBuilder
                      key={routineBuilderRequest}
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
                      onSaveAndStart={saveAndStartRoutine}
                      onCreatePracticeItem={onCreatePracticeItem}
                      onOpenMusicLibrary={onOpenMusic ? () => {
                        onCloseRoutineBuilder()
                        onOpenMusic()
                      } : undefined}
                      todayStarted={Boolean(routine && routineDay?.routineId === routine.id && routineDay.startedAt)}
                      onDelete={() => {
                        onDeleteRoutine()
                        setPage('home')
                      }}
                      onCancel={closeBuilder}
                    />
                  </PremiumMotionDiv>
                ) : activePage === 'instrument' ? (
                  <PremiumMotionDiv
                    key="instrument"
                    className="practice-menu-page"
                    initial={{ transform: `translateX(${reducedMotion ? 0 : 8}px)` }}
                    animate={{ transform: 'translateX(0px)' }}
                    transition={{ duration: reducedMotion ? 0 : .558, ease: [.22, 1, .36, 1] }}
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
                  </PremiumMotionDiv>
                ) : activePage === 'today' && routine ? (
                  <PremiumFlowPage key="today" className="practice-menu-page">
                    <RoutineHomeDisclosure routine={routine} day={routineDay} tunerTransposition={tunerTransposition}
                      hapticFeedback={hapticFeedback} startingStepId={startingRoutineStepId} onOpenItemHistory={onOpenItemHistory}
                      onStartStep={(stepId) => void startRoutineStep(stepId)} onToggleStep={onToggleRoutineStep}
                      onEdit={() => onOpenRoutineBuilder('edit')} />
                  </PremiumFlowPage>
                ) : (
                  <PremiumMotionDiv
                    key="home"
                    className="practice-menu-page"
                    initial={{ transform: `translateX(${reducedMotion ? 0 : -8}px)` }}
                    animate={{ transform: 'translateX(0px)' }}
                    transition={{ duration: reducedMotion ? 0 : .558, ease: [.22, 1, .36, 1] }}
                  >
                    <section className="practice-menu-focus-flow">
                      <Pressable type="button" intensity="soft" haptic="light" hapticFeedback={hapticFeedback}
                        className="practice-home-instrument" onClick={() => setInstrumentPickerOpen(true)}
                        aria-haspopup="dialog" aria-expanded={instrumentPickerOpen}
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
                          <span className="practice-home-launch-copy"><CircleDot className="open-lens-home-symbol" aria-hidden /><strong>{takes.length ? 'Record & compare' : 'Record your first take'}</strong><em>Audio or video</em></span><ChevronRight aria-hidden />
                          <svg className="practice-home-signal-detail" viewBox="0 0 180 55" fill="none" aria-hidden><path d="M0 28h20l5-7 6 14 7-25 8 36 8-29 7 20 6-9h23l5-12 6 25 8-34 8 43 8-27 6 12 5-7h39" stroke="currentColor" strokeWidth="1.6" /></svg>
                        </Pressable>
                        <Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} className="practice-home-launch-button is-quick practice-home-routine-launch" disabled={startingRoutineStepId !== null || startingMusic} onClick={() => {
                          if (lastMusic) void continueMusic(lastMusic.id)
                          else if (!routine?.steps.length) onOpenRoutineBuilder('presets')
                          else if (homeNext && !homeProgress?.complete) void startRoutineStep(homeNext.id)
                          else setPage('today')
                        }}><span className="practice-home-launch-copy"><ListMusic className="open-lens-home-symbol" aria-hidden /><strong>{startingRoutineStepId || startingMusic ? 'Opening…' : lastMusic ? 'Continue music' : homeRoutineLabel}</strong><em>{lastMusic ? lastMusic.name : routine?.steps.length ? `${routine.name} · ${homeProgress?.done ?? 0} of ${homeProgress?.total ?? routine.steps.length} exercises completed` : 'Start with a plan you can edit'}</em></span><ChevronRight aria-hidden /></Pressable>
                      </div>
                      <div className="practice-home-links">
                        <button className="practice-home-library" onClick={onOpenVault}><span>Take library<small>Recordings & best takes</small></span><ChevronRight aria-hidden /></button>
                        <button className="practice-home-library" onClick={() => onOpenRoutineBuilder('build')}><span>Your routines<small>Plans & exercises</small></span><ChevronRight aria-hidden /></button>
                      </div>

                      {showHomeRoutineSummary && routine?.steps.length ? (
                        <section className="practice-home-routine-summary" aria-label="Your routine">
                          <header><span>{routine.name}</span><button type="button" onClick={() => setPage('today')}>View all <ChevronRight aria-hidden /></button></header>
                          {routine.steps.slice(0, 3).map((step, index) => (
                            <button type="button" key={step.id} disabled={startingRoutineStepId !== null} onClick={() => void startRoutineStep(step.id)}>
                              <span className="practice-home-routine-summary__index">{String(index + 1).padStart(2, '0')}</span>
                              <strong>{step.title}</strong><small>{step.minutes ? `${step.minutes} min` : 'Untimed'}</small><ChevronRight aria-hidden />
                            </button>
                          ))}
                        </section>
                      ) : null}
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
                  </PremiumMotionDiv>
                )}
            </div>
          </PremiumMotionSection>
        </PremiumMotionDiv>
      )}
    </AnimatePresence>
    <PremiumPicker isOpen={isOpen && instrumentPickerOpen} title="Your instrument" searchable
      value={instrumentId ?? ''} hapticFeedback={hapticFeedback}
      options={INSTRUMENT_FAMILIES.flatMap(family => getInstrumentProfilesByFamily(family).map(profile => ({ value: profile.id, label: profile.label, group: family })))}
      description="Practice suggestions and written note names for what you play."
      onChange={onSelectInstrument} onClose={() => setInstrumentPickerOpen(false)} />
    </>,
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
                        {profile.tunerTransposition === 'concert' ? 'Concert-pitch tuner' : 'Written-pitch tuner'}
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
          ? 'Changing instruments updates suggestions and input sensitivity. Today’s checks and the desks you built stay.'
          : 'This sets practice suggestions, written note names, and how loud a note must be to start a take.'}
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
    <PremiumDisclosure className="practice-home-disclosure practice-home-routine">
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
    </PremiumDisclosure>
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
            <Pressable type="button" intensity="soft" haptic="light" hapticFeedback={hapticFeedback}
              disabled={startingStepId !== null} onClick={() => onStartStep(routine.steps[0].id)}>
              {startingStepId ? 'Opening…' : 'Practice again'}
            </Pressable>
          </div>
        </div>
      ) : null}
    </section>
  )
}
