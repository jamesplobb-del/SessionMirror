import { Plus, ScanLine } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import { usePracticeTimeline, useTimelinePlayback } from '../hooks/usePracticeTimeline'
import { describeSection, timelineSummaryLines } from '../naturalLanguage'
import { draftToTimelineSections } from '../scan/scanToProgram'
import { useMusicScan } from '../scan/useMusicScan'
import { stashPendingMarkers } from '../recording/timelineMarkers'
import { effectiveBars } from '../timeSignatureLogic'
import MusicScanCaptureSheet from './MusicScanCaptureSheet'
import MusicScanReviewSheet from './MusicScanReviewSheet'
import TimelineLibrarySheet from './TimelineLibrarySheet'
import TimelinePracticeSessionView from './TimelinePracticeSessionView'
import TimelineSectionCard from './TimelineSectionCard'
import TimelineSectionEditor from './TimelineSectionEditor'
import TrackSettingsPanel from './TrackSettingsPanel'

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
    renameTimeline,
    updateTrackSettings,
    applyScanProgram,
  } = usePracticeTimeline()

  const {
    playbackState,
    prepareSession,
    togglePlay,
    exitSession,
    resetSession,
    adjustTempoScale,
    goToSection,
    skipSection,
    sessionTimeline,
    currentSection,
    nextSection,
  } = useTimelinePlayback()

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [recordEnabled, setRecordEnabled] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(timeline.name)
  const [scanOpen, setScanOpen] = useState(false)

  const musicScan = useMusicScan()

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

  const handleApplyScan = (mode: 'replace' | 'append') => {
    if (!musicScan.draft) return
    const sections = draftToTimelineSections(musicScan.draft)
    applyScanProgram(sections, mode, musicScan.draft.title)
    musicScan.reset()
    setScanOpen(false)
  }

  if (musicScan.phase === 'review' && musicScan.draft) {
    return (
      <MusicScanReviewSheet
        draft={musicScan.draft}
        onChange={musicScan.updateDraft}
        onClose={() => {
          musicScan.reset()
          setScanOpen(false)
        }}
        onApply={handleApplyScan}
      />
    )
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
        onGoToSection={goToSection}
        onSkipSection={skipSection}
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
            <Pressable type="button" intensity="soft" onClick={() => {
              setNameDraft(timeline.name)
              setRenaming(true)
            }}>
              <h1 className="practice-timeline__hero-title">
                {timeline.sections.length === 0 ? 'Create Your Practice' : timeline.name}
              </h1>
            </Pressable>
          )}
          <p className="practice-timeline__hero-sub">
            {timeline.sections.length === 0
              ? 'Add sections like a playlist, or scan sheet music'
              : `${timeline.sections.length} sections`}
          </p>
          {timeline.sections.length === 0 ? (
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              className="practice-timeline__scan-hero-btn"
              onClick={() => setScanOpen(true)}
            >
              <ScanLine size={18} className="mr-1 inline" />
              Scan Music
            </Pressable>
          ) : null}
        </header>

        {timeline.sections.length > 0 ? (
          <TrackSettingsPanel settings={trackSettings} onChange={updateTrackSettings} />
        ) : null}

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

        <Pressable
          type="button"
          intensity="soft"
          haptic="light"
          className="practice-timeline__scan-btn"
          onClick={() => setScanOpen(true)}
        >
          <ScanLine size={18} className="mr-1 inline" />
          Scan Music
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
          onClick={() => beginSession(0)}
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

      <input
        ref={musicScan.fileInputRef}
        type="file"
        accept={musicScan.inputAccept}
        capture={musicScan.inputCapture}
        className="sr-only"
        onChange={musicScan.handleFileChange}
      />

      <MusicScanCaptureSheet
        open={scanOpen || musicScan.phase === 'reading' || musicScan.phase === 'analyzing' || musicScan.phase === 'error'}
        phase={musicScan.phase}
        error={musicScan.error}
        scanConfigured={musicScan.scanConfigured}
        onClose={() => {
          if (musicScan.phase === 'reading' || musicScan.phase === 'analyzing') return
          musicScan.reset()
          setScanOpen(false)
        }}
        onTakePhoto={() => musicScan.openPicker('photo')}
        onImportImage={() => musicScan.openPicker('image')}
        onImportPdf={() => musicScan.openPicker('pdf')}
      />
    </div>
  )
}
