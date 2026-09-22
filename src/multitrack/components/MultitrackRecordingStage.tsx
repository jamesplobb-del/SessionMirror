import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Camera,
  Check,
  FolderOpen,
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
import { useActionSheet } from '../../context/ActionSheetContext'
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
import { APP_FOREGROUND_RECOVERY_EVENT } from '../../utils/appForeground'
import type { MultitrackPracticeSettings, MultitrackRecordingPhase } from '../types'
import MultitrackCountInControls from './MultitrackCountInControls'

/** Above the stage (z-150). */
const STAGE_SHEET_Z = { backdrop: 'z-[155]', sheet: 'z-[160]' }

export interface MultitrackMonitorSource {
  id: string
  label: string
  muted: boolean
  unavailableReason?: string
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
  /** Render camera/review inside the chosen grid tile; this component becomes the control dock. */
  inGrid?: boolean
  dock?: boolean
  reviewMediaRef?: RefObject<HTMLMediaElement | null>
  /** "You'll hear" chips: other tiles + backing + click, all-on by default. */
  monitorSources: MultitrackMonitorSource[]
  onToggleMonitorSource: (id: string) => void
  /** A backing track is loaded — the click starts off because it rarely lines up with it. */
  hasBacking?: boolean
  /** Headphones went away mid-take, so the mix was silenced to keep it out of the mic. */
  speakerMuted?: boolean
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
  onDiscardTake: () => void
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
  tunerInstrument: _tunerInstrument,
  practice,
  phase,
  countInRemaining,
  isRecording,
  isStopping,
  elapsed,
  reviewTake,
  inGrid = false,
  dock = false,
  reviewMediaRef: externalReviewMediaRef,
  monitorSources,
  onToggleMonitorSource,
  hasBacking = false,
  speakerMuted = false,
  nativeLivePreviewActive = false,
  nativeCameraBridgeEnabled = false,
  onPracticeChange,
  onRecord,
  onStop,
  onUseExisting,
  onConfirmTake,
  onRetryTake,
  onDiscardTake,
  onClose,
}: MultitrackRecordingStageProps) {
  const { showAlert } = useActionSheet()
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const internalReviewVideoRef = useRef<HTMLMediaElement | null>(null)
  const reviewVideoRef = externalReviewMediaRef ?? internalReviewVideoRef
  const nativePreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const nativeFramePumpRef = useRef<ReturnType<typeof createNativePreviewFramePump> | null>(null)
  const nativeBridgePrimedRef = useRef(nativeLivePreviewActive)
  const [reviewPlaying, setReviewPlaying] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [headphonesActive, setHeadphonesActive] = useState(() => isHeadphoneOutputActive())
  const showNativeBridgeCanvas = nativeCameraBridgeEnabled || nativeLivePreviewActive

  // Kept in sync every render — see MultitrackCapturePanel: an effect keyed on
  // `nativeLivePreviewActive` alone cannot re-arm this after a teardown that
  // happened while the flag never changed (Retry), and the canvas then silently
  // drops every frame.
  nativeBridgePrimedRef.current = nativeLivePreviewActive

  useEffect(() => subscribeHeadphoneOutput(setHeadphonesActive), [])

  // WebKit self-preview — only relevant when the native camera bridge isn't
  // supplying frames. Re-runs on streamGeneration so it re-attaches whenever
  // the shared stream is replaced (e.g. after native recording releases it).
  useEffect(() => {
    if (inGrid || nativeLivePreviewActive) return
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
  }, [inGrid, streamRef, streamGeneration, nativeLivePreviewActive])

  // Native iOS camera preview — the stage sits on an opaque overlay, so the
  // main passthrough layer can't show through here. Request the JPEG frame
  // pump on demand and paint frames onto the stage canvas.
  useEffect(() => {
    if (inGrid || !nativeCameraBridgeEnabled) return

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
      pump.stop()
      nativeFramePumpRef.current = null
      const canvas = nativePreviewCanvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [inGrid, nativeCameraBridgeEnabled])

  // Stopping the native capture session for background also clears its
  // frame-bridge request; re-ask for frames whenever the app comes back.
  useEffect(() => {
    if (inGrid || !nativeCameraBridgeEnabled) return
    const reassertFrameBridge = () => {
      void setNativeCameraFrameBridgeEnabled(true)
    }
    window.addEventListener(APP_FOREGROUND_RECOVERY_EVENT, reassertFrameBridge)
    return () => window.removeEventListener(APP_FOREGROUND_RECOVERY_EVENT, reassertFrameBridge)
  }, [inGrid, nativeCameraBridgeEnabled])

  useEffect(() => {
    setReviewPlaying(false)
    const video = reviewVideoRef.current
    if (!video) return
    video.pause()
    if (inGrid) return
    video.removeAttribute('src')
    video.load()
  }, [inGrid, reviewTake?.id, reviewVideoRef])

  useEffect(() => {
    const media = reviewVideoRef.current
    if (!media) return
    const onEnded = () => setReviewPlaying(false)
    media.addEventListener('ended', onEnded)
    return () => media.removeEventListener('ended', onEnded)
  }, [reviewTake?.id, reviewVideoRef])

  const reviewGenerationRef = useRef(0)
  useEffect(() => () => {
    reviewGenerationRef.current += 1
    reviewVideoRef.current?.pause()
  }, [reviewTake?.id, reviewVideoRef])

  const handleReview = useCallback(() => {
    const video = reviewVideoRef.current
    if (!video || !reviewTake) return

    if (reviewPlaying) {
      video.pause()
      setReviewPlaying(false)
      return
    }

    const generation = ++reviewGenerationRef.current
    void (async () => {
      const url = await resolveTakePlaybackUrl(reviewTake.filePath, reviewTake.videoUrl)
      if (!url || generation !== reviewGenerationRef.current) return
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
      if (generation !== reviewGenerationRef.current) return
      setReviewPlaying(started)
    })().catch(() => {
      if (generation === reviewGenerationRef.current) {
        setReviewPlaying(false)
        void showAlert({ message: 'Could not preview this recording. Please try again.', tone: 'error' })
      }
    })
  }, [reviewPlaying, reviewTake, showAlert])

  const reviewReady = phase === 'review' && !!reviewTake && !isStopping
  const savingTake = phase === 'review' && !reviewReady
  const busy = phase !== 'idle' || isRecording
  const anyMonitorAudible = monitorSources.some((source) => !source.muted)

  return (
    <div ref={stageRef} className={`multitrack-recording-stage ${inGrid ? 'multitrack-recording-stage--in-grid' : ''} ${dock ? 'multitrack-recording-stage--dock' : ''}`}>
      {inGrid && !dock ? <div className="multitrack-recording-stage__interaction-guard" aria-hidden /> : null}
      {!inGrid && showNativeBridgeCanvas && (
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
      {!inGrid ? (
        <>
          <video
            ref={videoRef}
            className={`multitrack-recording-stage__preview ${
              nativeLivePreviewActive ? 'multitrack-recording-stage__preview--hidden' : ''
            }`}
            muted
            playsInline
          />
          <video
            ref={reviewVideoRef as RefObject<HTMLVideoElement | null>}
            className={`multitrack-recording-stage__review-video ${reviewPlaying ? 'is-visible' : ''}`}
            playsInline
            onEnded={() => setReviewPlaying(false)}
          />
          <div className="multitrack-recording-stage__shade" />
        </>
      ) : null}

      <header className="multitrack-recording-stage__header">
        <Pressable type="button" intensity="icon" onClick={onClose} disabled={savingTake} aria-label="Close recorder">
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
              disabled={busy || !!source.unavailableReason}
              aria-pressed={!source.muted}
              className={`multitrack-monitor-chip ${source.muted ? 'multitrack-monitor-chip--muted' : ''}`}
            >
              {source.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              {source.id === 'click' && !headphonesActive ? 'Count-in only' : source.label}
              {source.unavailableReason ? ` · ${source.unavailableReason}` : ''}
            </Pressable>
          ))}
          {monitorSources.some(source => source.unavailableReason) && <span>Adjust part mute and volume in the Editor.</span>}
          {speakerMuted ? (
            <span className="multitrack-headphone-chip multitrack-headphone-chip--warn" role="status">
              <Headphones className="h-3 w-3" />
              Headphones disconnected — playback muted, still recording
            </span>
          ) : anyMonitorAudible ? (
            <span
              className={`multitrack-headphone-chip ${headphonesActive ? 'multitrack-headphone-chip--on' : 'multitrack-headphone-chip--warn'}`}
            >
              <Headphones className="h-3 w-3" />
              {headphonesActive ? 'Headphones' : 'Speaker — parts will bleed in'}
            </span>
          ) : null}
        </div>
      ) : null}

      {!inGrid && phase === 'arming' ? (
        <div className="multitrack-recording-stage__count multitrack-recording-stage__count--arming">
          …
        </div>
      ) : !inGrid && phase === 'count-in' && countInRemaining > 0 ? (
        <div className="multitrack-recording-stage__count">
          {countInRemaining}
        </div>
      ) : null}

      {!dock && <>
      <div className="multitrack-recording-stage__widgets">
        <Pressable
          type="button"
          intensity="soft"
          className={practice.showMetronome ? 'is-active' : ''}
          aria-label="Metronome"
          aria-pressed={practice.showMetronome}
          onClick={() => onPracticeChange({ showMetronome: !practice.showMetronome })}
        >
          <MetronomeIcon className="h-4 w-4" /><span>Metronome</span>
        </Pressable>
        <Pressable
          type="button"
          intensity="soft"
          className={practice.showPitch ? 'is-active' : ''}
          aria-label="Tuner"
          aria-pressed={practice.showPitch}
          onClick={() => onPracticeChange({ showPitch: !practice.showPitch })}
        >
          <AudioLines className="h-4 w-4" strokeWidth={2.1} /><span>Tuner</span>
        </Pressable>
      </div>

      </>}
      <footer className="multitrack-recording-stage__controls">
        {phase === 'review' ? (
          <div className="multitrack-recording-stage__actions multitrack-recording-stage__actions--review">
            {savingTake && <span role="status">Saving recording…</span>}
            <Pressable type="button" intensity="soft" disabled={!reviewReady} onClick={onRetryTake} className="multitrack-recording-stage__retry">
              <RotateCcw className="h-4 w-4" />
              Retake
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              onClick={handleReview}
              disabled={!reviewReady}
              className="multitrack-recording-stage__preview-btn"
            >
              {reviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {reviewPlaying ? 'Pause' : 'Preview'}
            </Pressable>
            <Pressable type="button" intensity="normal" haptic="medium" disabled={!reviewReady} onClick={onConfirmTake} className="multitrack-recording-stage__confirm">
              <Check className="h-5 w-5" />
              Keep take
            </Pressable>
            <Pressable type="button" intensity="soft" disabled={!reviewReady} onClick={onDiscardTake} className="multitrack-recording-stage__retry">Discard take</Pressable>
            <span className="multitrack-review-note">Retry or close keeps this recording in your Take Vault.</span>
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
              <FolderOpen className="h-5 w-5" />
              <span>Take Vault</span>
            </Pressable>
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className={`multitrack-recording-stage__record-big ${isRecording ? 'is-recording' : ''}`}
              onClick={isRecording || phase === 'count-in' || phase === 'arming' ? onStop : onRecord}
              disabled={!isRecording && isStopping}
              aria-label={isRecording ? 'Stop recording' : phase === 'count-in' || phase === 'arming' ? 'Cancel count-in' : 'Start recording'}
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
              <span>Setup</span>
            </Pressable>
          </div>
        )}
        {phase === 'arming' ? (
          <p className="multitrack-recording-stage__hint">Loading reference…</p>
        ) : phase === 'count-in' && countInRemaining > 0 ? (
          <p className="multitrack-recording-stage__hint">Counting in… tap the button to stop</p>
        ) : isStopping ? (
          <p className="multitrack-recording-stage__hint">Saving…</p>
        ) : null}

        {!inGrid && !streamRef.current && !nativeLivePreviewActive ? (
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
        elevatedLight
        zClass={STAGE_SHEET_Z}
        maxHeightClass="max-h-[60vh]"
      >
        <div className="multitrack-sheet multitrack-sheet--countin">
          <p className="multitrack-sheet__title">Click &amp; count-in</p>
          <MultitrackCountInControls practice={practice} onChange={onPracticeChange} hasBacking={hasBacking} />
        </div>
      </AnimatedBottomSheet>
    </div>
  )
}
