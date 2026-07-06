import { Plus } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import { usePracticeTimeline, useTimelinePlayback } from '../hooks/usePracticeTimeline'
import { describeSection, timelineSummaryLines } from '../naturalLanguage'
import { stashPendingMarkers } from '../recording/timelineMarkers'
import { effectiveBars } from '../timeSignatureLogic'
import TimelineLibrarySheet from './TimelineLibrarySheet'
import TimelinePracticeSessionView from './TimelinePracticeSessionView'
import TimelineSectionCard from './TimelineSectionCard'
import TimelineSectionEditor from './TimelineSectionEditor'
import TrackSettingsPanel from './TrackSettingsPanel'

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

  const trackSettings = {
    countInBars: timeline.settings?.countInBars ?? 0,
    countInWhen: timeline.settings?.countInWhen ?? 'start',
    loopTrack: timeline.settings?.loopTrack ?? false,
  }

  const maxBars = useMemo(
    () => Math.max(1, ...timeline.sections.map((s) => effectiveBars(s))),
    [timeline.sections],
  )
  const summaryLines = useMemo(() => timelineSummaryLines(timeline), [timeline])
  const editingSection = timeline.sections.find((s) => s.id === editingSectionId)

  const beginSession = (startSectionIndex = 0) => {
    if (timeline.sections.length === 0) return
    if (recordEnabled && !isRecording) onStartRecording?.()

    prepareSession(timeline, {
      startSectionIndex,
      onFinished: (markers) => {
        if (recordEnabled) {
          stashPendingMarkers(markers)
          if (isRecording) onStopRecording?.()
        }
        if (!trackSettings.loopTrack) exitSession()
      },
    })
  }

  const handleExitSession = () => {
    exitSession()
    if (recordEnabled && isRecording) onStopRecording?.()
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
          onClose={() => setEditingSectionId(null)}
        />
      ) : null}

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
            <Pressable
              type="button"
              intensity="soft"
              onClick={() => {
                setNameDraft(timeline.name)
                setRenaming(true)
              }}
            >
              <h1 className="practice-timeline__hero-title">
                {timeline.sections.length === 0 ? 'Create Your Practice' : timeline.name}
              </h1>
            </Pressable>
          )}
          <p className="practice-timeline__hero-sub">
            {timeline.sections.length === 0
              ? 'Add sections like a playlist'
              : `${timeline.sections.length} sections`}
          </p>
        </header>

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

        {timeline.sections.length > 0 ? <div className="practice-timeline__connector">↓</div> : null}

        <Pressable
          type="button"
          intensity="soft"
          haptic="light"
          className="practice-timeline__add-btn"
          onClick={addSection}
        >
          <Plus size={20} />
          Add Section
        </Pressable>

        {timeline.sections.length > 0 ? (
          <TrackSettingsPanel settings={trackSettings} onChange={updateTrackSettings} />
        ) : null}

        <label className="practice-timeline__record-toggle pointer-events-auto">
          <span>Record with practice</span>
          <IOSSwitch checked={recordEnabled} onChange={setRecordEnabled} />
        </label>

        <div className="practice-timeline__summary">
          <p className="practice-timeline__summary-label">Your practice session</p>
          {summaryLines.map((line, index) => (
            <Fragment key={`${line}-${index}`}>
              {index > 0 ? <div className="practice-timeline__summary-arrow">↓</div> : null}
              <p className="practice-timeline__summary-line">
                {index < timeline.sections.length ? describeSection(timeline.sections[index]) : line}
              </p>
            </Fragment>
          ))}
        </div>
      </div>

      {footer}

      <TimelineLibrarySheet
        open={libraryOpen}
        activeTimelineId={timeline.id}
        onClose={() => setLibraryOpen(false)}
        onSelect={loadTimeline}
      />
    </div>
  )
}
