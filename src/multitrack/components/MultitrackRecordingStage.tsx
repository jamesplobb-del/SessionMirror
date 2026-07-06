import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Camera, FileAudio, Grid2X2, Mic, Pause, Play, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { Take } from '../../types'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import MetronomeIcon from '../../components/icons/MetronomeIcon'
import { assignMediaPlaybackSrc } from '../../utils/mediaPlayback'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { playTakeMediaAudible } from '../../utils/takePlaybackAudio'
import { resolveTakePlaybackUrl } from '../../utils/takeStorage'
import {
  createNativePreviewFramePump,
  subscribeNativeCameraPreviewFrames,
} from '../../utils/nativeCameraFrameBridge'
import type { MultitrackBackingTrack, MultitrackPracticeSettings, MultitrackRecordingPhase } from '../types'
import MultitrackPracticeOverlay from '../practiceWidgets/MultitrackPracticeOverlay'
import MultitrackBackingTrackPanel from '../backing/MultitrackBackingTrackPanel'

interface MultitrackRecordingStageProps {
  panelLabel: string
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  practice: MultitrackPracticeSettings
  phase: MultitrackRecordingPhase
  countInRemaining: number
  isRecording: boolean
  reviewTake: Take | null
  backing: MultitrackBackingTrack
  backingAudioRef: RefObject<HTMLAudioElement | null>
  backingYoutubeIframeRef: RefObject<HTMLIFrameElement | null>
  backingPlaying: boolean
  /** Native iOS camera bridge is delivering live frames — show the canvas, hide the WebKit video. */
  nativeLivePreviewActive?: boolean
  /** Keep the bridge canvas mounted so record-start handoff can paint instantly. */
  nativeCameraBridgeEnabled?: boolean
  onPracticeChange: (patch: Partial<MultitrackPracticeSettings>) => void
  onBackingChange: (backing: MultitrackBackingTrack) => void
  onToggleBackingPlayback: () => void
  onRecord: () => void
  onStop: () => void
  onUseExisting: () => void
  onClose: () => void
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
  reviewTake,
  backing,
  backingAudioRef,
  backingYoutubeIframeRef,
  backingPlaying,
  nativeLivePreviewActive = false,
  nativeCameraBridgeEnabled = false,
  onPracticeChange,
  onBackingChange,
  onToggleBackingPlayback,
  onRecord,
  onStop,
  onUseExisting,
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
  const [backingWidgetHidden, setBackingWidgetHidden] = useState(false)
  const showNativeBridgeCanvas = nativeCameraBridgeEnabled || nativeLivePreviewActive

  useEffect(() => {
    setBackingWidgetHidden(false)
  }, [backing.kind])

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

  // Native iOS camera bridge — paints JPEG frames pushed from
  // NativeCameraRecordingEngine onto a dedicated canvas. Multiple concurrent
  // subscribers are safe; this mirrors LiveCameraBackground's own subscription.
  useEffect(() => {
    if (!nativeCameraBridgeEnabled) return

    let cancelled = false
    let removeListener: (() => void) | null = null

    if (!nativeFramePumpRef.current) {
      nativeFramePumpRef.current = createNativePreviewFramePump(nativePreviewCanvasRef)
    }
    const pump = nativeFramePumpRef.current

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
        <div>
          <p className="multitrack-recording-stage__kicker">Recording into</p>
          <h2>{panelLabel}</h2>
        </div>
      </header>

      {phase === 'count-in' ? (
        <div className="multitrack-recording-stage__count">
          {countInRemaining > 0 ? Math.max(1, countInRemaining) : 'NOW'}
        </div>
      ) : null}

      <div className="multitrack-recording-stage__widgets">
        {backing.kind !== 'none' && backingWidgetHidden ? (
          <Pressable
            type="button"
            intensity="soft"
            aria-label="Show backing track"
            onClick={() => setBackingWidgetHidden(false)}
          >
            <FileAudio className="h-4 w-4" />
          </Pressable>
        ) : null}
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

      {!backingWidgetHidden ? (
        <MultitrackBackingTrackPanel
          backing={backing}
          audioRef={backingAudioRef}
          youtubeIframeRef={backingYoutubeIframeRef}
          isPlaying={backingPlaying}
          placement="stage"
          onBackingChange={onBackingChange}
          onTogglePlayback={onToggleBackingPlayback}
          onDismiss={() => setBackingWidgetHidden(true)}
        />
      ) : null}

      <footer className="multitrack-recording-stage__controls">
        <div
          className={`multitrack-recording-stage__settings ${practice.clickEnabled ? '' : 'multitrack-recording-stage__settings--click-only'}`}
        >
          <label>
            <span>Click</span>
            <IOSSwitch
              checked={practice.clickEnabled}
              onChange={(clickEnabled) => onPracticeChange({ clickEnabled })}
            />
          </label>
          {practice.clickEnabled ? (
            <>
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
            </>
          ) : null}
        </div>

        <div className="multitrack-recording-stage__actions">
          <Pressable type="button" intensity="soft" onClick={onUseExisting} disabled={busy}>
            <Grid2X2 className="h-4 w-4" />
            Takes
          </Pressable>
          {reviewTake ? (
            <Pressable type="button" intensity="soft" onClick={handleReview} disabled={busy} className="multitrack-recording-stage__review">
              {reviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {reviewPlaying ? 'Pause' : 'Review'}
            </Pressable>
          ) : null}
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

        {!streamRef.current && !nativeLivePreviewActive ? (
          <div className="multitrack-recording-stage__missing-camera">
            <Camera className="h-4 w-4" />
            Camera preview is waking up
          </div>
        ) : null}
      </footer>
    </div>
  )
}
