import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Camera,
  Check,
  Grid2X2,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { RefObject } from 'react'
import type { Take } from '../../types'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet'
import MetronomeIcon from '../../components/icons/MetronomeIcon'
import { assignMediaPlaybackSrc } from '../../utils/mediaPlayback'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { playTakeMediaAudible } from '../../utils/takePlaybackAudio'
import { resolveTakePlaybackUrl } from '../../utils/takeStorage'
import {
  isHeadphoneOutputActive,
  subscribeHeadphoneOutput,
} from '../../utils/headphoneOutput'
import {
  createNativePreviewFramePump,
  subscribeNativeCameraPreviewFrames,
} from '../../utils/nativeCameraFrameBridge'
import { setNativeCameraFrameBridgeEnabled } from '../../utils/nativeCameraTest'
import type { MultitrackPracticeSettings, MultitrackRecordingPhase } from '../types'
import MultitrackPracticeOverlay from '../practiceWidgets/MultitrackPracticeOverlay'

/** Above the stage (z-150). */
const STAGE_SHEET_Z = { backdrop: 'z-[155]', sheet: 'z-[160]' }

export interface MultitrackMonitorSource {
  id: string
  label: string
  muted: boolean
}

interface MultitrackRecordingStageProps {
  panelLabel: string
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  practice: MultitrackPracticeSettings
  phase: MultitrackRecordingPhase
  countInRemaining: number
  isRecording: boolean
  /** True while a native recording stop is still settling — a new recording must not start yet. */
  isStopping: boolean
  /** Recording elapsed seconds (drives the top-bar timer). */
  elapsed: number
  reviewTake: Take | null
  /** "You'll hear" chips: other tiles + backing + click, all-on by default. */
  monitorSources: MultitrackMonitorSource[]
  onToggleMonitorSource: (id: string) => void
  /** Native iOS camera bridge is delivering live frames — show the canvas, hide the WebKit video. */
  nativeLivePreviewActive?: boolean
  /** Keep the bridge canvas mounted so record-start handoff can paint instantly. */
  nativeCameraBridgeEnabled?: boolean
  onPracticeChange: (patch: Partial<MultitrackPracticeSettings>) => void
  onRecord: () => void
  onStop: () => void
  onUseExisting: () => void
  onConfirmTake: () => void
  onRetryTake: () => void
  onClose: () => void
}

function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export default function MultitrackRecordingStage({
  panelLabel,
  streamRef,
  streamGeneration,
  tunerInstrument,
  practice,
  phase,
  countInRemaining,
  isRecording,
  isStopping,
  elapsed,
  reviewTake,
  monitorSources,
  onToggleMonitorSource,
  nativeLivePreviewActive = false,
  nativeCameraBridgeEnabled = false,
  onPracticeChange,
  onRecord,
  onStop,
  onUseExisting,
  onConfirmTake,
  onRetryTake,
  onClose,
}: MultitrackRecordingStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reviewVideoRef = useRef<HTMLVideoElement>(null)
  const emptyMediaRef = useRef<HTMLMediaElement | null>(null)
  const nativePreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const nativeFramePumpRef = useRef<ReturnType<typeof createNativePreviewFramePump> | null>(null)
  const nativeBridgePrimedRef = useRef(false)
  const [reviewPlaying, setReviewPlaying] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [headphonesActive, setHeadphonesActive] = useState(() => isHeadphoneOutputActive())
  const showNativeBridgeCanvas = nativeCameraBridgeEnabled || nativeLivePreviewActive

  useEffect(() => subscribeHeadphoneOutput(setHeadphonesActive), [])

  // WebKit self-preview — only relevant when the native camera bridge isn't
  // supplying frames. Re-runs on streamGeneration so it re-attaches whenever
  // the shared stream is replaced (e.g. after native recording releases it).
  useEffect(() => {
    if (nativeLivePreviewActive) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    void video.play().catch(() => {})
    return () => {
      video.srcObject = null
    }
  }, [streamRef, streamGeneration, nativeLivePreviewActive])

  // Native iOS camera preview — the stage sits on an opaque overlay, so the
  // main passthrough layer can't show through here. Request the JPEG frame
  // pump on demand and paint frames onto the stage canvas.
  useEffect(() => {
    if (!nativeCameraBridgeEnabled) return

    let cancelled = false
    let removeListener: (() => void) | null = null

    if (!nativeFramePumpRef.current) {
      nativeFramePumpRef.current = createNativePreviewFramePump(nativePreviewCanvasRef)
    }
    const pump = nativeFramePumpRef.current

    void setNativeCameraFrameBridgeEnabled(true)

    void (async () => {
      const subscription = await subscribeNativeCameraPreviewFrames((event) => {
        if (cancelled || !nativeBridgePrimedRef.current) return
        pump.push(event)
      })
      if (!subscription) return
      if (cancelled) {
        void subscription.remove()
        return
      }
      removeListener = () => {
        void subscription.remove()
      }
    })()

    return () => {
      cancelled = true
      removeListener?.()
      void setNativeCameraFrameBridgeEnabled(false)
      nativeBridgePrimedRef.current = false
      pump.stop()
      nativeFramePumpRef.current = null
      const canvas = nativePreviewCanvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [nativeCameraBridgeEnabled])

  useEffect(() => {
    nativeBridgePrimedRef.current = nativeLivePreviewActive
  }, [nativeLivePreviewActive])

  useEffect(() => {
    setReviewPlaying(false)
    const video = reviewVideoRef.current
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.load()
  }, [reviewTake?.id])

  const handleReview = useCallback(() => {
    const video = reviewVideoRef.current
    if (!video || !reviewTake) return

    if (reviewPlaying) {
      video.pause()
      setReviewPlaying(false)
      return
    }

    void (async () => {
      const url = await resolveTakePlaybackUrl(reviewTake.filePath, reviewTake.videoUrl)
      if (!url) return
      assignMediaPlaybackSrc(video, url)
      try {
        video.currentTime = 0
      } catch {
        /* media may still be loading */
      }
      video.muted = false
      video.volume = 1
      video.preload = 'auto'
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      const started = await playTakeMediaAudible(video)
      setReviewPlaying(started)
    })()
  }, [reviewPlaying, reviewTake])

  const busy = phase !== 'idle' || isRecording
  const anyMonitorAudible = monitorSources.some((source) => !source.muted)

  return (
    <div ref={stageRef} className="multitrack-recording-stage">
      {showNativeBridgeCanvas && (
        <canvas
          ref={nativePreviewCanvasRef}
          className={`multitrack-recording-stage__preview-canvas ${
            nativeLivePreviewActive
              ? 'multitrack-recording-stage__preview-canvas--live'
              : 'multitrack-recording-stage__preview-canvas--primed'
          }`}
          aria-hidden
        />
      )}
      <video
        ref={videoRef}
        className={`multitrack-recording-stage__preview ${
          nativeLivePreviewActive ? 'multitrack-recording-stage__preview--hidden' : ''
        }`}
        muted
        playsInline
      />
      <video
        ref={reviewVideoRef}
        className={`multitrack-recording-stage__review-video ${reviewPlaying ? 'is-visible' : ''}`}
        playsInline
        onEnded={() => setReviewPlaying(false)}
      />
      <div className="multitrack-recording-stage__shade" />

      <header className="multitrack-recording-stage__header">
        <Pressable type="button" intensity="icon" onClick={onClose} aria-label="Close recorder">
          <X className="h-5 w-5" />
        </Pressable>
        {isRecording ? (
          <div className="multitrack-recording-stage__rec" role="status">
            <span className="multitrack-recording-stage__rec-dot" aria-hidden />
            {formatElapsed(elapsed)}
          </div>
        ) : (
          <h2 className="multitrack-recording-stage__title">{panelLabel}</h2>
        )}
        <span className="multitrack-recording-stage__header-spacer" aria-hidden />
      </header>

      {/* Monitor mix: what plays in your ears while you record. */}
      {phase !== 'review' && monitorSources.length > 0 ? (
        <div className="multitrack-monitor-row" aria-label="You'll hear while recording">
          <span className="multitrack-monitor-row__label">You'll hear</span>
          {monitorSources.map((source) => (
            <Pressable
              key={source.id}
              type="button"
              intensity="soft"
              onClick={() => onToggleMonitorSource(source.id)}
              className={`multitrack-monitor-chip ${source.muted ? 'multitrack-monitor-chip--muted' : ''}`}
            >
              {source.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              {source.label}
            </Pressable>
          ))}
          {anyMonitorAudible ? (
            <span
              className={`multitrack-headphone-chip ${headphonesActive ? 'multitrack-headphone-chip--on' : 'multitrack-headphone-chip--warn'}`}
            >
              <Headphones className="h-3 w-3" />
              {headphonesActive ? 'Headphones' : 'Speaker — parts will bleed in'}
            </span>
          ) : null}
        </div>
      ) : null}

      {phase === 'arming' ? (
        <div className="multitrack-recording-stage__count multitrack-recording-stage__count--arming">
          …
        </div>
      ) : phase === 'count-in' ? (
        <div className="multitrack-recording-stage__count">
          {countInRemaining > 0 ? Math.max(1, countInRemaining) : 'NOW'}
        </div>
      ) : null}

      <div className="multitrack-recording-stage__widgets">
        <Pressable
          type="button"
          intensity="soft"
          className={practice.showMetronome ? 'is-active' : ''}
          onClick={() => onPracticeChange({ showMetronome: !practice.showMetronome })}
        >
          <MetronomeIcon className="h-4 w-4" />
        </Pressable>
        <Pressable
          type="button"
          intensity="soft"
          className={practice.showPitch ? 'is-active' : ''}
          onClick={() => onPracticeChange({ showPitch: !practice.showPitch })}
        >
          <AudioLines className="h-4 w-4" strokeWidth={2.1} />
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
        {phase === 'review' ? (
          <div className="multitrack-recording-stage__actions multitrack-recording-stage__actions--review">
            <Pressable type="button" intensity="soft" onClick={onRetryTake} className="multitrack-recording-stage__retry">
              <RotateCcw className="h-4 w-4" />
              Retry
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              onClick={handleReview}
              className="multitrack-recording-stage__preview-btn"
            >
              {reviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {reviewPlaying ? 'Pause' : 'Preview'}
            </Pressable>
            <Pressable type="button" intensity="normal" haptic="medium" onClick={onConfirmTake} className="multitrack-recording-stage__confirm">
              <Check className="h-5 w-5" />
              Keep
            </Pressable>
          </div>
        ) : (
          <div className="multitrack-recording-stage__actions multitrack-recording-stage__actions--live">
            <Pressable
              type="button"
              intensity="soft"
              onClick={onUseExisting}
              disabled={busy}
              className="multitrack-recording-stage__side-btn"
              aria-label="Choose from Take Vault"
            >
              <Grid2X2 className="h-5 w-5" />
              <span>Takes</span>
            </Pressable>
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className={`multitrack-recording-stage__record-big ${isRecording ? 'is-recording' : ''}`}
              onClick={isRecording ? onStop : onRecord}
              disabled={!isRecording && isStopping}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              <span className="multitrack-recording-stage__record-glyph" />
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              onClick={() => setSettingsOpen(true)}
              disabled={busy}
              className="multitrack-recording-stage__side-btn"
              aria-label="Count-in settings"
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span>Count-in</span>
            </Pressable>
          </div>
        )}
        {phase === 'arming' ? (
          <p className="multitrack-recording-stage__hint">Loading reference…</p>
        ) : phase === 'count-in' ? (
          <p className="multitrack-recording-stage__hint">Counting in… tap the button to stop</p>
        ) : isStopping ? (
          <p className="multitrack-recording-stage__hint">Saving…</p>
        ) : null}

        {!streamRef.current && !nativeLivePreviewActive ? (
          <div className="multitrack-recording-stage__missing-camera">
            <Camera className="h-4 w-4" />
            Camera is waking up
          </div>
        ) : null}
      </footer>

      <AnimatedBottomSheet
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        ariaLabel="Count-in settings"
        elevated
        zClass={STAGE_SHEET_Z}
        maxHeightClass="max-h-[60vh]"
      >
        <div className="multitrack-sheet multitrack-sheet--dark">
          <p className="multitrack-sheet__title">Count-in</p>
          <div className="multitrack-countin-sheet">
            <label className="multitrack-countin-sheet__row">
              <span>Click track</span>
              <IOSSwitch
                checked={practice.clickEnabled}
                onChange={(clickEnabled) => onPracticeChange({ clickEnabled })}
              />
            </label>
            <label className="multitrack-countin-sheet__row">
              <span>Count-in bars</span>
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
            <label className="multitrack-countin-sheet__row">
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
        </div>
      </AnimatedBottomSheet>
    </div>
  )
}
