import { BookOpen, Pencil, Play, Plus } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import { usePracticeTimeline, useTimelinePlayback } from '../hooks/usePracticeTimeline'
import { describeSection } from '../naturalLanguage'
import { stashPendingMarkers } from '../recording/timelineMarkers'
import { effectiveBars } from '../timeSignatureLogic'
import TimelineLibrarySheet from './TimelineLibrarySheet'
import TimelinePracticeSessionView from './TimelinePracticeSessionView'
import TimelineSectionCard from './TimelineSectionCard'
import TimelineSectionEditor from './TimelineSectionEditor'
import TrackSettingsPanel from './TrackSettingsPanel'
import { useTutorialAction } from '../../context/TutorialContext'

export interface PracticeTimelineViewProps {
  isRecording?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
  onPracticeSessionActiveChange?: (active: boolean) => void
}

export default function PracticeTimelineView({
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

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [recordEnabled, setRecordEnabled] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(timeline.name)
  const practiceRecordingStartedRef = useRef(false)

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

  const maxBars = useMemo(
    () => Math.max(1, ...timeline.sections.map((s) => effectiveBars(s))),
    [timeline.sections]
  )
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
        intensity="soft"
        className="practice-timeline__footer-btn practice-timeline__footer-btn--secondary"
        onClick={() => setLibraryOpen(true)}
      >
        <BookOpen size={18} aria-hidden />
        Routines
      </Pressable>
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
                      {timeline.sections.length === 0 ? 'Create Your Practice' : timeline.name}
                    </h1>
                    <Pencil size={15} aria-hidden />
                  </Pressable>
                  {timeline.sections.length > 0 ? (
                    <span className="practice-timeline__section-count">
                      {timeline.sections.length}
                    </span>
                  ) : null}
                </div>
              )}
              <p className="practice-timeline__hero-sub">
                {timeline.sections.length === 0
                  ? 'Build a routine one section at a time.'
                  : 'Drag to reorder. Tap Edit to change timing.'}
              </p>
            </header>

            <section className="practice-timeline__builder" aria-label="Routine sections">
              {timeline.sections.length > 0 ? (
                <div className="practice-timeline__builder-heading">
                  <div>
                    <h2>Routine sections</h2>
                    <p>They play from top to bottom.</p>
                  </div>
                </div>
              ) : (
                <div className="practice-timeline__empty">
                  <span className="practice-timeline__empty-icon" aria-hidden>
                    <Plus size={22} />
                  </span>
                  <h2>Start with a section</h2>
                  <p>Set its bars, tempo, time signature, and repeats.</p>
                </div>
              )}

              {timeline.sections.map((section, index) => (
                <Fragment key={section.id}>
                  {index > 0 ? <div className="practice-timeline__connector">↓</div> : null}
                  <TimelineSectionCard
                    section={section}
                    maxBars={maxBars}
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
                </Fragment>
              ))}

              {timeline.sections.length > 0 ? (
                <div className="practice-timeline__connector">↓</div>
              ) : null}

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
              <>
                <section
                  className="practice-timeline__setup"
                  aria-labelledby="practice-session-setup"
                >
                  <div className="practice-timeline__setup-heading">
                    <div>
                      <h2 id="practice-session-setup">Session setup</h2>
                      <p>Optional settings for this run.</p>
                    </div>
                  </div>

                  <TrackSettingsPanel settings={trackSettings} onChange={updateTrackSettings} />

                  <div className="practice-timeline__record-toggle pointer-events-auto">
                    <span className="practice-timeline__record-copy">
                      <strong>Record this practice</strong>
                      <small>Save one take with markers for each section.</small>
                    </span>
                    <IOSSwitch
                      checked={recordEnabled}
                      ariaLabel="Record this practice"
                      onChange={setRecordEnabled}
                    />
                  </div>
                </section>

                <section
                  className="practice-timeline__summary"
                  aria-labelledby="practice-ready-heading"
                >
                  <div className="practice-timeline__summary-heading">
                    <div>
                      <h2 id="practice-ready-heading">Ready to practice</h2>
                      <p>
                        {timeline.sections.length} section
                        {timeline.sections.length === 1 ? '' : 's'} in order
                      </p>
                    </div>
                  </div>
                  <ol className="practice-timeline__summary-list">
                    {timeline.sections.map((section, index) => (
                      <li key={section.id}>
                        <span>{index + 1}</span>
                        <div>
                          <strong>{section.title}</strong>
                          <p>{describeSection(section)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
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
