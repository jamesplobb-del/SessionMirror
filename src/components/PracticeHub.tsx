import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Star,
  Target,
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

/** A session is the specific thing being worked on — an excerpt, solo, or
 * technique. It's just a Project: its name IS the focus, and it accumulates
 * takes over as many sittings as it takes to get right. */
export interface FocusedPracticeSelection {
  projectId: string
  focusArea: string
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
}

type HubPage = 'home' | 'focused-setup'

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
  const mostRecentPractice = practiceItemStates[0] ?? null
  const mostRecentProject = mostRecentPractice
    ? projects.find((project) => project.id === mostRecentPractice.projectId) ?? null
    : null
  const takeCountLabel = `${takes.length} ${takes.length === 1 ? 'take' : 'takes'}`

  /** Orientation for "pick up where you left off" — real data only, no
   * fabricated streaks. Last-opened date always exists; the best take only
   * shows once one's been marked in this session. */
  const mostRecentBest = mostRecentProject
    ? bestTakeHistory.find(
        (entry) => entry.projectId === mostRecentProject.id && entry.isCurrentBest,
      ) ?? null
    : null
  const resumeRecapLabel = mostRecentPractice
    ? [
        mostRecentPractice.lastOpenedAt
          ? `last worked ${new Date(mostRecentPractice.lastOpenedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}`
          : null,
        mostRecentBest ? `best: ${mostRecentBest.takeName || 'untitled take'}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const startFocusedPractice = async () => {
    if (!selectedProjectId || startingFocusedPractice) return
    setStartingFocusedPractice(true)
    try {
      await onStartFocusedPractice(selectedProjectId)
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
                      <p className="practice-menu-note">
                        One specific thing — an excerpt, a solo, a technique. Pick a session
                        you've already started, or name a new one.
                      </p>
                      <div className="practice-menu-form">
                        <label className="practice-menu-field">
                          <span>Session</span>
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
                            placeholder="Or name a new one — measures 12–20…"
                            aria-label="New session name"
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
                            aria-label="Create session"
                          >
                            <Plus aria-hidden />
                          </Pressable>
                        </div>
                      </div>
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
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="light"
                          hapticFeedback={hapticFeedback}
                          className="practice-menu-hero"
                          onClick={() => void onResumeFocusedPractice(mostRecentProject.id)}
                        >
                          <span className="practice-menu-hero-ring" aria-hidden />
                          <span className="practice-menu-hero-content">
                            {mostRecentBest && (
                              <span className="practice-menu-hero-badge">
                                <Star aria-hidden />
                                Personal best &middot; {mostRecentBest.takeName || 'latest take'}
                              </span>
                            )}
                            <strong className="practice-menu-hero-title">
                              Continue {mostRecentProject.name}
                            </strong>
                            {resumeRecapLabel && (
                              <small className="practice-menu-hero-recap">{resumeRecapLabel}</small>
                            )}
                            <span className="practice-menu-hero-cta">
                              Resume
                              <ChevronRight aria-hidden />
                            </span>
                          </span>
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
                          <span className="practice-menu-spine" aria-hidden />
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
                          <span
                            className={`practice-menu-spine ${
                              focusedPractice ? 'practice-menu-spine--active' : ''
                            }`}
                            aria-hidden
                          />
                          <span className="practice-menu-row-copy">
                            <strong>Focused Practice</strong>
                            <small>
                              {focusedPractice && focusedProjectName
                                ? focusedProjectName
                                : 'Pick or start the session for one specific thing.'}
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
                          <span className="practice-menu-spine" aria-hidden />
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
