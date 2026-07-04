import { useEffect, useRef } from 'react'
import { Camera, Gauge, Grid2X2, Mic, Music2, X } from 'lucide-react'
import type { RefObject } from 'react'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { MultitrackPracticeSettings, MultitrackRecordingPhase } from '../types'
import MultitrackPracticeOverlay from '../practiceWidgets/MultitrackPracticeOverlay'

interface MultitrackRecordingStageProps {
  panelLabel: string
  streamRef: RefObject<MediaStream | null>
  tunerInstrument: TunerInstrument
  practice: MultitrackPracticeSettings
  phase: MultitrackRecordingPhase
  countInRemaining: number
  isRecording: boolean
  onPracticeChange: (patch: Partial<MultitrackPracticeSettings>) => void
  onRecord: () => void
  onStop: () => void
  onUseExisting: () => void
  onClose: () => void
}

export default function MultitrackRecordingStage({
  panelLabel,
  streamRef,
  tunerInstrument,
  practice,
  phase,
  countInRemaining,
  isRecording,
  onPracticeChange,
  onRecord,
  onStop,
  onUseExisting,
  onClose,
}: MultitrackRecordingStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const emptyMediaRef = useRef<HTMLMediaElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = streamRef.current
    video.muted = true
    video.playsInline = true
    void video.play().catch(() => {})
    return () => {
      video.srcObject = null
    }
  }, [streamRef])

  const busy = phase !== 'idle' || isRecording

  return (
    <div ref={stageRef} className="multitrack-recording-stage">
      <video ref={videoRef} className="multitrack-recording-stage__preview" muted playsInline />
      <div className="multitrack-recording-stage__shade" />

      <header className="multitrack-recording-stage__header">
        <Pressable type="button" intensity="icon" onClick={onClose} aria-label="Close recorder">
          <X className="h-5 w-5" />
        </Pressable>
        <div>
          <p className="multitrack-recording-stage__kicker">Recording into</p>
          <h2>{panelLabel}</h2>
        </div>
      </header>

      {phase === 'count-in' ? (
        <div className="multitrack-recording-stage__count">
          {Math.max(1, countInRemaining)}
        </div>
      ) : null}

      <div className="multitrack-recording-stage__widgets">
        <Pressable
          type="button"
          intensity="soft"
          className={practice.showMetronome ? 'is-active' : ''}
          onClick={() => onPracticeChange({ showMetronome: !practice.showMetronome })}
        >
          <Gauge className="h-4 w-4" />
        </Pressable>
        <Pressable
          type="button"
          intensity="soft"
          className={practice.showPitch ? 'is-active' : ''}
          onClick={() => onPracticeChange({ showPitch: !practice.showPitch })}
        >
          <Music2 className="h-4 w-4" />
        </Pressable>
      </div>

      <MultitrackPracticeOverlay
        boundaryRef={stageRef}
        practice={practice}
        isPlaying={isRecording || phase === 'count-in'}
        streamRef={streamRef}
        tunerInstrument={tunerInstrument}
        mediaRef={emptyMediaRef}
        mediaKey="multitrack-recording-stage"
        onHideMetronome={() => onPracticeChange({ showMetronome: false })}
        onHidePitch={() => onPracticeChange({ showPitch: false })}
      />

      <footer className="multitrack-recording-stage__controls">
        <div className="multitrack-recording-stage__settings">
          <label>
            <span>Click</span>
            <IOSSwitch
              checked={practice.clickEnabled}
              onChange={(clickEnabled) => onPracticeChange({ clickEnabled })}
            />
          </label>
          <label>
            <span>Count-in</span>
            <div className="multitrack-recording-stage__stepper">
              <Pressable
                type="button"
                intensity="icon"
                onClick={() => onPracticeChange({ countInBars: Math.max(0, practice.countInBars - 1) })}
              >
                -
              </Pressable>
              <strong>{practice.countInBars}</strong>
              <Pressable
                type="button"
                intensity="icon"
                onClick={() => onPracticeChange({ countInBars: Math.min(8, practice.countInBars + 1) })}
              >
                +
              </Pressable>
            </div>
          </label>
          <label>
            <span>BPM</span>
            <input
              type="number"
              inputMode="numeric"
              min={40}
              max={300}
              value={practice.bpm}
              onChange={(event) =>
                onPracticeChange({
                  bpm: Math.max(40, Math.min(300, Math.round(Number(event.target.value) || 120))),
                })
              }
            />
          </label>
        </div>

        <div className="multitrack-recording-stage__actions">
          <Pressable type="button" intensity="soft" onClick={onUseExisting} disabled={busy}>
            <Grid2X2 className="h-4 w-4" />
            Takes
          </Pressable>
          <Pressable
            type="button"
            intensity="normal"
            haptic="medium"
            className={`multitrack-recording-stage__record ${isRecording ? 'is-recording' : ''}`}
            onClick={isRecording ? onStop : onRecord}
          >
            {isRecording ? <X className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            {isRecording ? 'Stop' : phase === 'count-in' ? 'Counting' : 'Record'}
          </Pressable>
        </div>

        {!streamRef.current ? (
          <div className="multitrack-recording-stage__missing-camera">
            <Camera className="h-4 w-4" />
            Camera preview is waking up
          </div>
        ) : null}
      </footer>
    </div>
  )
}
