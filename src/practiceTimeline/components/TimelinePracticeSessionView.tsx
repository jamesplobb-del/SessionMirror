import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import MetronomeBeatDisplay from '../../components/audioPractice/MetronomeBeatDisplay'
import { triggerMetronomeToggleHaptic } from '../../utils/haptics'
import { useMetronome } from '../../hooks/useMetronome'
import Pressable from '../../components/ui/Pressable'
import { sectionTimingSummary } from '../timeSignatureLogic'
import type { PracticeTimeline, TimelinePlaybackState, TimelineSection } from '../types'
import { abbreviateLabel } from '../uiText'
import EditableNumberValue from './EditableNumberValue'
import MeasureProgressBar from './MeasureProgressBar'

interface TimelinePracticeSessionViewProps {
  timeline: PracticeTimeline
  playbackState: TimelinePlaybackState
  currentSection?: TimelineSection
  nextSection?: TimelineSection
  onTogglePlay: () => void
  onExit: () => void
  onReset: () => void
  onAdjustTempoScale: (delta: number) => void
  onSetEffectiveBpm: (bpm: number) => void
  onGoToSection: (index: number) => void
  onSeekMeasure: (measure: number) => void
  onSkipSection: (direction: -1 | 1) => void
}

function SessionControlButton({
  label,
  onPress,
  children,
  className = '',
}: {
  label: string
  onPress: () => void
  children?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerUp={(event) => {
        if (event.button !== 0) return
        onPress()
      }}
      className={`metronome-audio-stage__btn pointer-events-auto interactive-native ${className}`}
    >
      {children}
    </button>
  )
}

export default function TimelinePracticeSessionView({
  timeline,
  playbackState,
  currentSection,
  nextSection,
  onTogglePlay,
  onExit,
  onReset,
  onAdjustTempoScale,
  onSetEffectiveBpm,
  onGoToSection,
  onSeekMeasure,
  onSkipSection,
}: TimelinePracticeSessionViewProps) {
  const { playing } = useMetronome()
  const scalePercent = Math.round(playbackState.tempoScale * 100)
  const timingSummary = useMemo(
    () =>
      currentSection
        ? sectionTimingSummary(
            currentSection,
            playbackState.countInActive ? 1 : Math.max(1, playbackState.measure),
          )
        : '',
    [currentSection, playbackState.countInActive, playbackState.measure],
  )

  const canGoPrev = playbackState.sectionIndex > 0
  const canGoNext = playbackState.sectionIndex < timeline.sections.length - 1
  const displayMeasure = playbackState.countInActive
    ? 'Count-in'
    : `M ${Math.max(1, playbackState.measure)}/${playbackState.totalMeasuresInSection}`

  const handleTogglePlay = useCallback(() => {
    triggerMetronomeToggleHaptic(playing)
    void onTogglePlay()
  }, [onTogglePlay, playing])

  return (
    <div
      className="practice-timeline-session metronome-audio-stage audio-practice-metronome flex min-h-0 flex-1 flex-col overflow-hidden pointer-events-auto"
      data-practice-mode="timeline-session"
    >
      <header className="practice-timeline-session__header shrink-0">
        <Pressable type="button" intensity="icon" onClick={onExit} aria-label="End practice">
          <X size={20} />
        </Pressable>
        <div className="min-w-0 flex-1 text-center">
          <p className="practice-timeline-session__section-title">
            {abbreviateLabel(currentSection?.title ?? 'Practice', 22)}
          </p>
          <p className="practice-timeline-session__meta">
            <span className="practice-timeline-session__measure">{displayMeasure}</span>
            {timingSummary ? (
              <>
                <span className="practice-timeline-session__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="practice-timeline-session__timing">{timingSummary}</span>
              </>
            ) : null}
          </p>
          {nextSection ? (
            <p className="practice-timeline-session__next">
              Next: {abbreviateLabel(nextSection.title, 16)}
            </p>
          ) : null}
        </div>
        <Pressable type="button" intensity="icon" onClick={onReset} aria-label="Reset to beginning">
          <RotateCcw size={18} />
        </Pressable>
      </header>

      <div className="practice-timeline-session__section-nav shrink-0">
        <Pressable
          type="button"
          intensity="icon"
          disabled={!canGoPrev}
          onClick={() => onSkipSection(-1)}
          aria-label="Previous section"
        >
          <ChevronLeft size={22} />
        </Pressable>

        <div
          className="practice-timeline-session__section-strip"
          role="tablist"
          aria-label="Practice sections"
        >
          {timeline.sections.map((section, index) => {
            const isActive = index === playbackState.sectionIndex
            return (
              <Pressable
                key={section.id}
                type="button"
                intensity="soft"
                role="tab"
                aria-selected={isActive}
                className={`practice-timeline-session__section-pill ${isActive ? 'practice-timeline-session__section-pill--active' : ''}`}
                onClick={() => onGoToSection(index)}
                title={section.title}
              >
                {abbreviateLabel(section.title, 10)}
              </Pressable>
            )
          })}
        </div>

        <Pressable
          type="button"
          intensity="icon"
          disabled={!canGoNext}
          onClick={() => onSkipSection(1)}
          aria-label="Next section"
        >
          <ChevronRight size={22} />
        </Pressable>
      </div>

      <div className="audio-practice-metronome__body practice-timeline-session__body min-h-0 flex-1">
        <MetronomeBeatDisplay interactive />
      </div>

      <MeasureProgressBar
        className="practice-timeline-session__measure-progress--dock"
        measure={playbackState.countInActive ? 0 : playbackState.measure}
        totalMeasures={playbackState.totalMeasuresInSection}
        onSeekMeasure={onSeekMeasure}
        disabled={playbackState.countInActive}
      />

      <footer className="practice-timeline-session__footer metronome-audio-stage__controls audio-practice-metronome__controls shrink-0">
        <div className="practice-timeline-session__tempo-row pointer-events-auto">
          <SessionControlButton
            label="Slow down entire practice"
            onPress={() => onAdjustTempoScale(-0.05)}
            className="audio-practice-metronome__step-btn practice-timeline-session__tempo-btn"
          >
            <Minus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          </SessionControlButton>

          <div className="practice-timeline-session__tempo-readout">
            <EditableNumberValue
              value={playbackState.effectiveBpm}
              min={40}
              max={300}
              ariaLabel="Type playback tempo"
              className="practice-timeline-session__tempo-value"
              onCommit={onSetEffectiveBpm}
            />
            <span className="practice-timeline-session__tempo-unit">BPM</span>
            <span className="practice-timeline-session__tempo-scale">{scalePercent}%</span>
          </div>

          <SessionControlButton
            label="Speed up entire practice"
            onPress={() => onAdjustTempoScale(0.05)}
            className="audio-practice-metronome__step-btn practice-timeline-session__tempo-btn"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          </SessionControlButton>
        </div>

        <div
          className="audio-practice-metronome__transport-row pointer-events-auto"
          role="group"
          aria-label="Practice transport"
        >
          <SessionControlButton
            label={playing ? 'Pause practice' : 'Start practice'}
            onPress={handleTogglePlay}
            className={`metronome-audio-stage__play-btn audio-practice-metronome__play-btn ${playing ? 'metronome-audio-stage__btn--active' : ''}`}
          >
            {playing ? (
              <Pause className="h-6 w-6" strokeWidth={2.4} aria-hidden />
            ) : (
              <Play className="h-6 w-6" strokeWidth={2.4} aria-hidden />
            )}
          </SessionControlButton>
        </div>
      </footer>
    </div>
  )
}
