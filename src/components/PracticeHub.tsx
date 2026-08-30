import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  History,
  Plus,
  Radio,
  Star,
  Target,
  Timer,
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

export interface FocusedPracticeSelection {
  projectId: string
  focusArea: string
  comparison: 'current-best' | 'previous-take' | 'yesterday' | 'reference-track'
}

const COMPARISON_OPTIONS: {
  value: FocusedPracticeSelection['comparison']
  label: string
  detail: string
}[] = [
  {
    value: 'current-best',
    label: 'Current best',
    detail: 'Every new take is measured against the take you starred.',
  },
  {
    value: 'previous-take',
    label: 'Previous take',
    detail: 'Compare against the last thing you recorded in this piece.',
  },
  {
    value: 'yesterday',
    label: 'Last session',
    detail: 'Compare against your most recent take from an earlier day.',
  },
  {
    value: 'reference-track',
    label: 'Saved reference',
    detail: 'Use the backing or reference recording saved with this practice item.',
  },
]

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
  onStartFocusedPractice: (selection: FocusedPracticeSelection) => void | Promise<void>
  onResumeFocusedPractice: (projectId: string) => void | Promise<void>
  onCreatePracticeItem: (name: string) => Promise<Project>
  onOpenGames: () => void
  onOpenVault: () => void
  onOpenTuner: () => void
  onOpenMetronome: () => void
}

type HubPage = 'home' | 'focused-setup'

/** Shared by the menu row and the recorder context pill. */
export function describeComparison(comparison: FocusedPracticeSelection['comparison']): string {
  return (
    COMPARISON_OPTIONS.find((option) => option.value === comparison)?.label.toLowerCase() ??
    'current best'
  )
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
}: PracticeHubProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const [page, setPage] = useState<HubPage>('home')
  const [selectedProjectId, setSelectedProjectId] = useState(
    focusedPractice?.projectId ?? activeProject?.id ?? '',
  )
  const [focusArea, setFocusArea] = useState(focusedPractice?.focusArea ?? '')
  const [comparison, setComparison] = useState<FocusedPracticeSelection['comparison']>(
    focusedPractice?.comparison ?? 'current-best',
  )
  const [startingFocusedPractice, setStartingFocusedPractice] = useState(false)
  const [newPracticeItemName, setNewPracticeItemName] = useState('')
  const [creatingPracticeItem, setCreatingPracticeItem] = useState(false)
  const [metronomePrefs, setMetronomePrefs] = useState<MetronomePrefs | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setPage('home')
    setMetronomePrefs(loadMetronomePrefs())
    const resumeProjectId = focusedPractice?.projectId ?? practiceItemStates[0]?.projectId
    setSelectedProjectId(resumeProjectId ?? activeProject?.id ?? '')
  }, [isOpen])

  useEffect(() => {
    if (!selectedProjectId) return
    const saved = practiceItemStates.find((state) => state.projectId === selectedProjectId)
    setFocusArea(saved?.focusArea ?? '')
    setComparison(saved?.comparison ?? 'current-best')
  }, [practiceItemStates, selectedProjectId])

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
  const focusedProjectName = focusedPractice
    ? projects.find((project) => project.id === focusedPractice.projectId)?.name
    : null
  const selectedComparison = COMPARISON_OPTIONS.find((option) => option.value === comparison)
  const mostRecentPractice = practiceItemStates[0] ?? null
  const mostRecentProject = mostRecentPractice
    ? projects.find((project) => project.id === mostRecentPractice.projectId) ?? null
    : null
  const takeCountLabel = `${takes.length} ${takes.length === 1 ? 'take' : 'takes'}`

  const startFocusedPractice = async () => {
    if (!selectedProjectId || startingFocusedPractice) return
    setStartingFocusedPractice(true)
    try {
      await onStartFocusedPractice({
        projectId: selectedProjectId,
        focusArea: focusArea.trim(),
        comparison,
      })
    } finally {
      setStartingFocusedPractice(false)
    }
  }

  const createPracticeItem = async () => {
    const name = newPracticeItemName.trim()
    if (!name || creatingPracticeItem) return
    setCreatingPracticeItem(true)
    try {
      const project = await onCreatePracticeItem(name)
      setSelectedProjectId(project.id)
      setNewPracticeItemName('')
    } finally {
      setCreatingPracticeItem(false)
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
            className="practice-menu-card"
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
                {page === 'focused-setup' ? (
                  <Pressable
                    type="button"
                    intensity="icon"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    onClick={() => setPage('home')}
                    className="practice-menu-icon-button"
                    aria-label="Back to Practice"
                  >
                    <ChevronLeft aria-hidden />
                  </Pressable>
                ) : (
                  <span className="practice-menu-brand-mark" aria-hidden>
                    <Target />
                  </span>
                )}
              </div>

              <div className="practice-menu-title-block">
                <span>BestTake</span>
                <h2 id="practice-menu-title">
                  {page === 'focused-setup' ? 'Focused Practice' : 'Practice'}
                </h2>
                <p>
                  {page === 'focused-setup'
                    ? 'Set the context once, then record freely'
                    : activeProject
                      ? `${takeCountLabel} • ${activeProject.name}`
                      : 'Choose how you want to work'}
                </p>
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
              <AnimatePresence mode="wait" initial={false}>
                {page === 'focused-setup' ? (
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
                      <div className="practice-menu-form">
                        <label className="practice-menu-field">
                          <span>Practice item</span>
                          <select
                            value={selectedProjectId}
                            onChange={(event) => setSelectedProjectId(event.target.value)}
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
                            placeholder="Add a piece or exercise"
                            aria-label="New practice item name"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void createPracticeItem()
                            }}
                          />
                          <Pressable
                            type="button"
                            intensity="icon"
                            haptic="light"
                            hapticFeedback={hapticFeedback}
                            onClick={() => void createPracticeItem()}
                            disabled={!newPracticeItemName.trim() || creatingPracticeItem}
                            aria-label="Create practice item"
                          >
                            <Plus aria-hidden />
                          </Pressable>
                        </div>

                        <label className="practice-menu-field">
                          <span>Focus area — optional</span>
                          <input
                            value={focusArea}
                            onChange={(event) => setFocusArea(event.target.value)}
                            placeholder="Solo, long tones, measures 12–20…"
                          />
                        </label>

                        <label className="practice-menu-field">
                          <span>Compare each take against</span>
                          <select
                            value={comparison}
                            onChange={(event) =>
                              setComparison(
                                event.target.value as FocusedPracticeSelection['comparison'],
                              )
                            }
                          >
                            {COMPARISON_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <p className="practice-menu-note">
                        {selectedComparison?.detail} Your starred Best Take stays untouched; this
                        only sets the reference for this session.
                      </p>
                    </section>

                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      hapticFeedback={hapticFeedback}
                      className="practice-menu-primary"
                      disabled={!selectedProjectId || startingFocusedPractice}
                      onClick={() => void startFocusedPractice()}
                    >
                      {startingFocusedPractice ? 'Opening recorder…' : 'Start Focused Practice'}
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
                    {mostRecentPractice && mostRecentProject && (
                      <section className="practice-menu-section">
                        <h3>Pick up where you left off</h3>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-continue"
                          onClick={() => void onResumeFocusedPractice(mostRecentProject.id)}
                        >
                          <span className="practice-menu-symbol practice-menu-symbol--gold">
                            <History aria-hidden />
                          </span>
                          <span className="practice-menu-row-copy">
                            <strong>Continue {mostRecentProject.name}</strong>
                            <small>
                              {[
                                mostRecentPractice.focusArea,
                                `vs ${describeComparison(mostRecentPractice.comparison)}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </small>
                          </span>
                          <span className="practice-menu-tag">Resume</span>
                        </Pressable>
                      </section>
                    )}

                    <section className="practice-menu-section">
                      <h3>Choose a direction</h3>
                      <div className="practice-menu-list">
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-row"
                          onClick={onOpenQuickPractice}
                        >
                          <span className="practice-menu-symbol practice-menu-symbol--blue">
                            <Radio aria-hidden />
                          </span>
                          <span className="practice-menu-row-copy">
                            <strong>Quick Practice</strong>
                            <small>Open the recorder with no setup.</small>
                          </span>
                          <span className="practice-menu-tag">Standard</span>
                        </Pressable>

                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-row"
                          onClick={() => setPage('focused-setup')}
                        >
                          <span className="practice-menu-symbol practice-menu-symbol--gold">
                            <Target aria-hidden />
                          </span>
                          <span className="practice-menu-row-copy">
                            <strong>Focused Practice</strong>
                            <small>
                              {focusedPractice && focusedProjectName
                                ? `${[focusedProjectName, focusedPractice.focusArea]
                                    .filter(Boolean)
                                    .join(' · ')} · vs ${describeComparison(
                                    focusedPractice.comparison,
                                  )}`
                                : 'Choose a piece, focus, and comparison.'}
                            </small>
                          </span>
                          <ChevronRight aria-hidden className="practice-menu-chevron" />
                        </Pressable>

                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-row"
                          onClick={onOpenGames}
                        >
                          <span className="practice-menu-symbol practice-menu-symbol--blue">
                            <Gamepad2 aria-hidden />
                          </span>
                          <span className="practice-menu-row-copy">
                            <strong>Practice Games</strong>
                            <small>Train pitch, rhythm, and listening.</small>
                          </span>
                          <ChevronRight aria-hidden className="practice-menu-chevron" />
                        </Pressable>
                      </div>
                    </section>

                    <section className="practice-menu-section">
                      <h3>Shortcuts</h3>
                      <div className="practice-menu-shortcuts">
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenVault}
                        >
                          <Star aria-hidden />
                          <strong>Vault</strong>
                          <small>{projectBestCount > 0 ? `${projectBestCount} best` : 'All takes'}</small>
                        </Pressable>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenTuner}
                        >
                          <AudioLines aria-hidden />
                          <strong>Tuner</strong>
                          <small>{tunerProfile?.label ?? tunerKey.label}</small>
                        </Pressable>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-shortcut"
                          onClick={onOpenMetronome}
                        >
                          <Timer aria-hidden />
                          <strong>Metronome</strong>
                          <small>{metronomePrefs ? `${metronomePrefs.bpm} BPM` : 'Saved tempo'}</small>
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
