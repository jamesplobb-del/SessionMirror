import { BookOpen, Pencil, Play, Plus } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Pressable from '../../components/ui/Pressable'
import { usePracticeTimeline, useTimelinePlayback } from '../hooks/usePracticeTimeline'
import { stashPendingMarkers } from '../recording/timelineMarkers'
import {
  clearRoutineOpen,
  getPendingRoutineOpen,
  subscribeRoutineFileOpen,
} from '../storage/routineFileOpen'
import TimelineLibrarySheet from './TimelineLibrarySheet'
import TimelinePracticeSessionView from './TimelinePracticeSessionView'
import TimelineSectionCard from './TimelineSectionCard'
import TimelineSectionEditor from './TimelineSectionEditor'
import TrackSettingsPanel from './TrackSettingsPanel'
import { getTimelineById } from '../storage/timelineStorage'
import { useTutorialAction } from '../../context/TutorialContext'

export interface PracticeTimelineViewProps {
  linkedProgramId?: string | null
  isRecording?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
  onPracticeSessionActiveChange?: (active: boolean) => void
}

export default function PracticeTimelineView({
  linkedProgramId,
  isRecording = false,
  onStartRecording,
  onStopRecording,
  onPracticeSessionActiveChange,
}: PracticeTimelineViewProps) {
  const notifyTutorial = useTutorialAction()
  const {
    timeline,
    editingSectionId,
    setEditingSectionId,
    addSection,
    updateSection,
    deleteSection,
    duplicateSection,
    reorderSections,
    loadTimeline,
    renameTimeline,
    updateTrackSettings,
  } = usePracticeTimeline()

  const {
    playbackState,
    prepareSession,
    togglePlay,
    exitSession,
    resetSession,
    adjustTempoScale,
    setCurrentEffectiveBpm,
    goToSection,
    seekToMeasure,
    skipSection,
    sessionTimeline,
    currentSection,
    nextSection,
  } = useTimelinePlayback()

  useEffect(() => {
    onPracticeSessionActiveChange?.(playbackState.sessionActive)
  }, [onPracticeSessionActiveChange, playbackState.sessionActive])

  useEffect(() => {
    return () => onPracticeSessionActiveChange?.(false)
  }, [onPracticeSessionActiveChange])

  useEffect(() => {
    if (!linkedProgramId) return
    const program = getTimelineById(linkedProgramId)
    if (program) loadTimeline(program)
  }, [linkedProgramId, loadTimeline])

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [recordEnabled, setRecordEnabled] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(timeline.name)
  const practiceRecordingStartedRef = useRef(false)

  /* A routine tapped in Messages or Files is imported and announced by the file
   * handler regardless of which screen is showing. If this view happens to be
   * mounted, swap to the new routine so it is on screen and ready to play. */
  const openedRoutine = useSyncExternalStore(
    subscribeRoutineFileOpen,
    getPendingRoutineOpen,
    () => null,
  )

  useEffect(() => {
    if (!openedRoutine || linkedProgramId) return
    if (openedRoutine.status === 'imported') loadTimeline(openedRoutine.routine)
    clearRoutineOpen(openedRoutine.id)
  }, [openedRoutine, loadTimeline, linkedProgramId])

  const handleAddSection = () => {
    addSection()
    notifyTutorial?.('practice-section-added')
  }

  const handleCloseSectionEditor = () => {
    setEditingSectionId(null)
    notifyTutorial?.('practice-section-finished')
  }

  const trackSettings = {
    countInBars: timeline.settings?.countInBars ?? 0,
    countInWhen: timeline.settings?.countInWhen ?? 'start',
    loopTrack: timeline.settings?.loopTrack ?? false,
  }

  const editingSection = timeline.sections.find((s) => s.id === editingSectionId)

  const beginSession = (startSectionIndex = 0) => {
    if (timeline.sections.length === 0) return
    practiceRecordingStartedRef.current = recordEnabled && !isRecording && Boolean(onStartRecording)
    if (practiceRecordingStartedRef.current) onStartRecording?.()

    prepareSession(timeline, {
      startSectionIndex,
      onFinished: (markers) => {
        if (recordEnabled) {
          stashPendingMarkers(markers)
        }
        if (practiceRecordingStartedRef.current) {
          practiceRecordingStartedRef.current = false
          onStopRecording?.()
        }
        if (!trackSettings.loopTrack) exitSession()
      },
    })
  }

  const handleExitSession = () => {
    exitSession()
    if (practiceRecordingStartedRef.current) {
      practiceRecordingStartedRef.current = false
      onStopRecording?.()
    }
  }

  if (playbackState.sessionActive && sessionTimeline) {
    return (
      <TimelinePracticeSessionView
        timeline={sessionTimeline}
        playbackState={playbackState}
        currentSection={currentSection}
        nextSection={nextSection}
        onTogglePlay={() => void togglePlay()}
        onExit={handleExitSession}
        onReset={resetSession}
        onAdjustTempoScale={adjustTempoScale}
        onSetEffectiveBpm={setCurrentEffectiveBpm}
        onGoToSection={goToSection}
        onSeekMeasure={seekToMeasure}
        onSkipSection={skipSection}
      />
    )
  }

  const footer = (
    <footer className="practice-timeline__footer practice-timeline__footer--dock">
      <Pressable
        type="button"
        intensity="normal"
        haptic="success"
        className="practice-timeline__footer-btn practice-timeline__footer-btn--primary"
        disabled={timeline.sections.length === 0}
        onClick={() => beginSession(0)}
      >
        <Play size={18} fill="currentColor" aria-hidden />
        Start Practice
      </Pressable>
    </footer>
  )

  return (
    <div className="practice-timeline pointer-events-auto">
      {editingSection ? (
        <TimelineSectionEditor
          section={editingSection}
          onChange={(patch) => updateSection(editingSection.id, patch)}
          onClose={handleCloseSectionEditor}
        />
      ) : null}

      {!editingSection ? (
        <>
          <div className="practice-timeline__scroll">
            <header className="practice-timeline__hero">
              {renaming ? (
                <input
                  className="practice-timeline__hero-rename"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => {
                    renameTimeline(nameDraft)
                    setRenaming(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameTimeline(nameDraft)
                      setRenaming(false)
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div className="practice-timeline__hero-title-row">
                  <Pressable
                    type="button"
                    intensity="soft"
                    className="practice-timeline__hero-name"
                    aria-label={`Rename ${timeline.name}`}
                    onClick={() => {
                      setNameDraft(timeline.name)
                      setRenaming(true)
                    }}
                  >
                    <h1 className="practice-timeline__hero-title">
                      {timeline.sections.length === 0 ? 'Create a Program' : timeline.name}
                    </h1>
                    <Pencil size={15} aria-hidden />
                  </Pressable>
                  <Pressable
                    type="button"
                    intensity="soft"
                    className="practice-timeline__saved-link"
                    disabled={Boolean(linkedProgramId)}
                    onClick={() => setLibraryOpen(true)}
                  >
                    <BookOpen size={16} aria-hidden />
                    Saved
                  </Pressable>
                </div>
              )}
              <p className="practice-timeline__hero-sub">
                {timeline.sections.length === 0
                  ? 'Set tempos and timing, one section at a time.'
                  : `${timeline.sections.length} section${timeline.sections.length === 1 ? '' : 's'} · plays in order`}
              </p>
            </header>

            <section className="practice-timeline__builder" aria-label="Program sections">
              {timeline.sections.length === 0 ? (
                <div className="practice-timeline__empty">
                  <span className="practice-timeline__empty-icon" aria-hidden>
                    <Plus size={22} />
                  </span>
                  <h2>Start with a section</h2>
                  <p>Set its bars, tempo, time signature, and repeats.</p>
                </div>
              ) : null}

              {timeline.sections.map((section, index) => (
                <TimelineSectionCard
                    key={section.id}
                    section={section}
                    index={index}
                    isDragging={dragIndex === index}
                    onPress={() => setEditingSectionId(section.id)}
                    onPlayFrom={() => beginSession(index)}
                    onDuplicate={() => duplicateSection(section.id)}
                    onDelete={() => deleteSection(section.id)}
                    onDragStart={setDragIndex}
                    onDragOver={(overIndex) => {
                      if (dragIndex !== null && dragIndex !== overIndex) {
                        reorderSections(dragIndex, overIndex)
                        setDragIndex(overIndex)
                      }
                    }}
                    onDragEnd={() => setDragIndex(null)}
                />
              ))}

              <Pressable
                type="button"
                data-tutorial="practice-add-section"
                intensity="soft"
                haptic="light"
                className="practice-timeline__add-btn"
                onClick={handleAddSection}
              >
                <Plus size={20} />
                Add Section
              </Pressable>
            </section>

            {timeline.sections.length > 0 ? (
              <section className="practice-timeline__setup" aria-label="Practice options">
                <TrackSettingsPanel settings={trackSettings} onChange={updateTrackSettings}
                  recordEnabled={recordEnabled} onRecordChange={setRecordEnabled} />
              </section>
            ) : null}
          </div>

          {footer}
        </>
      ) : null}

      <TimelineLibrarySheet
        open={libraryOpen}
        activeTimelineId={timeline.id}
        onClose={() => setLibraryOpen(false)}
        onSelect={loadTimeline}
      />
    </div>
  )
}
