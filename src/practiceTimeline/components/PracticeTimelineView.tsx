import { Plus } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import { usePracticeTimeline, useTimelinePlayback } from '../hooks/usePracticeTimeline'
import { describeSection, timelineSummaryLines } from '../naturalLanguage'
import { stashPendingMarkers } from '../recording/timelineMarkers'
import { effectiveBars } from '../timeSignatureLogic'
import TimelineLibrarySheet from './TimelineLibrarySheet'
import TimelinePlaybackView from './TimelinePlaybackView'
import TimelineSectionCard from './TimelineSectionCard'
import TimelineSectionEditor from './TimelineSectionEditor'

export interface PracticeTimelineViewProps {
  isRecording?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
}

export default function PracticeTimelineView({
  isRecording = false,
  onStartRecording,
  onStopRecording,
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
  } = usePracticeTimeline()

  const { playbackState, start, stop, currentSection, nextSection } = useTimelinePlayback()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [recordEnabled, setRecordEnabled] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const maxBars = useMemo(
    () => Math.max(1, ...timeline.sections.map((s) => effectiveBars(s))),
    [timeline.sections],
  )
  const summaryLines = useMemo(() => timelineSummaryLines(timeline), [timeline])
  const editingSection = timeline.sections.find((s) => s.id === editingSectionId)

  const handleStart = async () => {
    if (timeline.sections.length === 0) return
    if (recordEnabled && !isRecording) onStartRecording?.()

    await start(timeline, {
      onFinished: (markers) => {
        if (recordEnabled) {
          stashPendingMarkers(markers)
          if (isRecording) onStopRecording?.()
        }
      },
    })
  }

  const handleStop = () => {
    stop()
    if (recordEnabled && isRecording) onStopRecording?.()
  }

  if (playbackState.playing) {
    return (
      <TimelinePlaybackView
        section={currentSection}
        nextSection={nextSection}
        measure={playbackState.measure}
        totalMeasures={playbackState.totalMeasuresInSection}
        onStop={handleStop}
      />
    )
  }

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
          <h1 className="practice-timeline__hero-title">
            {timeline.sections.length === 0 ? 'Create Your Practice' : timeline.name}
          </h1>
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

      <footer className="practice-timeline__footer">
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
          onClick={() => void handleStart()}
        >
          Start Practice
        </Pressable>
      </footer>

      <TimelineLibrarySheet
        open={libraryOpen}
        activeTimelineId={timeline.id}
        onClose={() => setLibraryOpen(false)}
        onSelect={loadTimeline}
      />
    </div>
  )
}
