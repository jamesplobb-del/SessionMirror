import { useCallback, useRef, useState, type RefObject } from 'react'
import LivePitchTuner from '../LivePitchTuner'
import PipCompareRow, { type PipCompareRowProps } from '../PipCompareRow'
import SplitRatioDragHandle from '../SplitRatioDragHandle'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { formatAudioDuration } from '../../utils/formatAudioTakeTime'
import {
  COMBO_MIDDLE_MIN_RATIO,
  COMBO_TAKES_MAX_RATIO,
  COMBO_TAKES_MIN_RATIO,
  COMBO_TUNER_MAX_RATIO,
  COMBO_TUNER_MIN_RATIO,
  loadAudioComboSplitPrefs,
  normalizeAudioComboSplit,
  saveAudioComboSplitPrefs,
} from '../../utils/audioComboSplitPrefs'
import CompactMetronomeCard from './CompactMetronomeCard'
import LiveRecordingWaveform from './LiveRecordingWaveform'

export interface AudioComboTabProps extends PipCompareRowProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  ready: boolean
  isRecording: boolean
  elapsed: number
  tunerInstrument: TunerInstrument
  liveMicTunerEnabled: boolean
  interactionSuspended?: boolean
}

export default function AudioComboTab({
  streamRef,
  streamGeneration,
  ready,
  isRecording,
  elapsed,
  tunerInstrument,
  liveMicTunerEnabled,
  interactionSuspended = false,
  ...pipProps
}: AudioComboTabProps) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [splitPrefs, setSplitPrefs] = useState(loadAudioComboSplitPrefs)

  const { tunerRatio, takesRatio } = splitPrefs
  const metronomeRatio = Math.max(COMBO_MIDDLE_MIN_RATIO, 100 - tunerRatio - takesRatio)

  const updateSplitPrefs = useCallback((next: { tunerRatio?: number; takesRatio?: number }) => {
    setSplitPrefs((current) => {
      const merged = normalizeAudioComboSplit({
        tunerRatio: next.tunerRatio ?? current.tunerRatio,
        takesRatio: next.takesRatio ?? current.takesRatio,
      })
      saveAudioComboSplitPrefs(merged)
      return merged
    })
  }, [])

  const handleTunerSplitChange = useCallback(
    (ratio: number) => {
      const maxTuner = 100 - takesRatio - COMBO_MIDDLE_MIN_RATIO
      updateSplitPrefs({
        tunerRatio: Math.min(ratio, maxTuner),
      })
    },
    [takesRatio, updateSplitPrefs],
  )

  const handleTakesSplitChange = useCallback(
    (topRatio: number) => {
      const nextTakes = 100 - topRatio
      const maxTakes = 100 - tunerRatio - COMBO_MIDDLE_MIN_RATIO
      updateSplitPrefs({
        takesRatio: Math.min(nextTakes, maxTakes),
      })
    },
    [tunerRatio, updateSplitPrefs],
  )

  const takesTopRatio = 100 - takesRatio

  return (
    <section
      className={`audio-practice-combo-shell ${interactionSuspended ? 'audio-practice-combo-shell--suspended' : ''}`}
      aria-label="Tuner, metronome, and take comparison"
    >
      <div ref={layoutRef} className="audio-combo-split-layout">
        <div
          className="audio-combo-split-layout__tuner min-h-0 overflow-hidden"
          style={{ flex: `${tunerRatio} 1 0%` }}
        >
          <div className="audio-practice-combo-card audio-practice-combo-card--tuner h-full min-h-0">
            <div className="audio-practice-combo-card__header">
              <span className="audio-practice-combo-card__eyebrow">Live Tuner</span>
            </div>
            <div className="audio-practice-combo__tuner-body">
              <LivePitchTuner
                variant="audio"
                mediaRef={mediaRef}
                enabled={ready || isRecording}
                isPlaying={isRecording}
                mediaKey={`combo-tuner-${streamGeneration}`}
                label="Pitch Analysis"
                liveMicEnabled={liveMicTunerEnabled}
                micStreamRef={streamRef}
                liveMicOnly
                tunerInstrument={tunerInstrument}
              />
            </div>
          </div>
        </div>

        <SplitRatioDragHandle
          ratio={tunerRatio}
          onChange={handleTunerSplitChange}
          layoutRef={layoutRef}
          minRatio={COMBO_TUNER_MIN_RATIO}
          maxRatio={COMBO_TUNER_MAX_RATIO}
          ariaLabel="Drag to resize tuner and metronome"
        />

        <div
          className="audio-combo-split-layout__metronome min-h-0 overflow-hidden"
          style={{ flex: `${metronomeRatio} 1 0%` }}
        >
          <CompactMetronomeCard />
        </div>

        <SplitRatioDragHandle
          ratio={takesTopRatio}
          onChange={handleTakesSplitChange}
          layoutRef={layoutRef}
          minRatio={100 - COMBO_TAKES_MAX_RATIO}
          maxRatio={100 - COMBO_TAKES_MIN_RATIO}
          ariaLabel="Drag to resize metronome and take comparison"
        />

        <div
          className="audio-combo-split-layout__takes min-h-0 overflow-hidden"
          style={{ flex: `${takesRatio} 1 0%` }}
        >
          <div className="audio-practice-combo__takes audio-practice-combo__takes--docked">
            <h2 className="audio-practice-combo__takes-title">Take Comparison</h2>

            {isRecording && (
              <article className="audio-practice-take-card audio-practice-take-card--current audio-practice-take-card--recording">
                <header className="audio-practice-take-card__header audio-practice-take-card__header--compact">
                  <div className="audio-practice-take-card__title-row">
                    <span className="audio-practice-take-card__live-dot" aria-hidden />
                    <span className="audio-practice-take-card__eyebrow">Recording</span>
                  </div>
                  <div className="audio-practice-take-card__meta">
                    <h3 className="audio-practice-take-card__name">Live Take</h3>
                    <span className="audio-practice-take-card__duration">
                      {formatAudioDuration(elapsed)}
                    </span>
                  </div>
                </header>
                <div className="audio-practice-take-card__waveform-wrap audio-practice-take-card__waveform-wrap--live">
                  <LiveRecordingWaveform
                    streamRef={streamRef}
                    enabled={ready || isRecording}
                    isRecording={isRecording}
                  />
                </div>
              </article>
            )}

            <div className="audio-combo-take-strip">
              <PipCompareRow {...pipProps} layoutVariant="combo" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
