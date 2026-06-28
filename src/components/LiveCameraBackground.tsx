import { memo, useEffect, type RefObject } from 'react'
import AudioModeHeroMic from './audioPractice/AudioModeHeroMic'
import type { RecordingMode } from '../types'
import { useCameraPreviewResume } from '../hooks/useCameraPreviewResume'
import { iosBulletproofVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  recordingMode: RecordingMode
  isRecording: boolean
  resumeNonce?: number
  /** Brief overlay while switching between camera and audio capture. */
  modePreparing?: boolean
  /** Hide the idle audio-mode mic UI while main-screen pitch analysis is showing. */
  pitchStageActive?: boolean
  /** Hide the idle audio-mode mic UI while the full-screen metronome stage is showing. */
  metronomeStageActive?: boolean
  /** Hide idle audio UI while a dedicated Audio Mode practice tab is active. */
  audioPracticeOverlayActive?: boolean
  /** fullscreen = behind HUD; embedded = inside split-view panel */
  variant?: 'fullscreen' | 'embedded'
  /** Keep the preview element mounted but off-screen (split view uses embedded preview). */
  visuallySuppressed?: boolean
  /** Native iOS preview is rendered below the transparent WebView. */
  nativePreviewActive?: boolean
}

function LiveCameraBackground({
  previewRef,
  streamRef,
  streamGeneration,
  recordingMode,
  isRecording,
  resumeNonce = 0,
  modePreparing = false,
  pitchStageActive = false,
  metronomeStageActive = false,
  audioPracticeOverlayActive = false,
  variant = 'fullscreen',
  visuallySuppressed = false,
  nativePreviewActive = false,
}: LiveCameraBackgroundProps) {
  const isAudioMode = recordingMode === 'audio'
  const showAudioIdle =
    isAudioMode && !pitchStageActive && !metronomeStageActive && !audioPracticeOverlayActive
  const isEmbedded = variant === 'embedded'
  const overlayClass = isEmbedded
    ? 'camera-background-overlay camera-background-overlay--embedded'
    : 'camera-background-overlay'
  const webPreviewMode = nativePreviewActive ? 'audio' : recordingMode

  const { resumingPreview, placeholderUrl, placeholderFading, showSlowIndicator } =
    useCameraPreviewResume({
      previewRef,
      streamRef,
      streamGeneration,
      recordingMode: webPreviewMode,
      resumeNonce,
    })

  useEffect(() => {
    if (nativePreviewActive) return
    const video = previewRef.current
    if (!video || isAudioMode) {
      if (video?.srcObject) {
        video.srcObject = null
      }
      return
    }

    const stream = streamRef.current
    if (!stream) return

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      void video.play().catch((err) => console.warn('Playback intercepted:', err))
    }
  }, [previewRef, streamRef, streamGeneration, recordingMode, isAudioMode, nativePreviewActive])

  useEffect(() => {
    if (nativePreviewActive) return
    if (isAudioMode || modePreparing || resumingPreview) return

    let reviveTimer: number | null = null

    const revivePreview = () => {
      const video = previewRef.current
      const stream = streamRef.current
      if (!video || !stream) return

      const videoLive = stream
        .getVideoTracks()
        .some((track) => track.readyState === 'live' && track.enabled)
      if (!videoLive) return

      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        void video.play().catch((err) => console.warn('Playback intercepted:', err))
      }
    }

    const scheduleRevive = () => {
      if (reviveTimer !== null) return
      reviveTimer = window.setTimeout(() => {
        reviveTimer = null
        revivePreview()
      }, 400)
    }

    revivePreview()
    const video = previewRef.current
    video?.addEventListener('pause', scheduleRevive)
    video?.addEventListener('stalled', scheduleRevive)
    video?.addEventListener('suspend', scheduleRevive)

    return () => {
      if (reviveTimer !== null) window.clearTimeout(reviveTimer)
      video?.removeEventListener('pause', scheduleRevive)
      video?.removeEventListener('stalled', scheduleRevive)
      video?.removeEventListener('suspend', scheduleRevive)
    }
  }, [isAudioMode, modePreparing, nativePreviewActive, previewRef, resumingPreview, streamRef, streamGeneration, visuallySuppressed])

  useEffect(() => {
    if (nativePreviewActive) return
    if (visuallySuppressed || isAudioMode || modePreparing) return
    const video = previewRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      void video.play().catch((err) => console.warn('Playback intercepted:', err))
    }
  }, [isAudioMode, modePreparing, nativePreviewActive, previewRef, streamRef, streamGeneration, visuallySuppressed])

  const shellClass = isEmbedded
    ? 'camera-background camera-background--embedded'
    : visuallySuppressed
      ? 'camera-background camera-background--visually-suppressed'
      : nativePreviewActive
        ? 'camera-background camera-background--native-preview'
        : 'camera-background'

  const previewClassName = [
    isEmbedded ? 'camera-preview--embedded' : 'camera-preview',
    'camera-preview--mirror',
    'camera-preview--live',
    isAudioMode || nativePreviewActive ? 'camera-preview--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showPreparingOverlay = modePreparing && !resumingPreview
  const showPlaceholder = !nativePreviewActive && resumingPreview && Boolean(placeholderUrl)

  return (
    <div className={shellClass} aria-hidden={!isEmbedded && !visuallySuppressed}>
      {showPlaceholder && (
        <div
          className={`camera-preview-placeholder ${
            isEmbedded ? 'camera-preview-placeholder--embedded' : ''
          } ${placeholderFading ? 'camera-preview-placeholder--fading' : ''}`}
          aria-hidden
        >
          <img
            src={placeholderUrl ?? undefined}
            alt=""
            className="camera-preview-placeholder__frame"
            draggable={false}
            decoding="async"
          />
          {showSlowIndicator && (
            <div className="camera-preview-placeholder__indicator" aria-hidden>
              <div className="camera-preview-resume-spinner" />
            </div>
          )}
        </div>
      )}

      <video
        ref={previewRef}
        autoPlay
        muted
        {...iosBulletproofVideoProps}
        className={previewClassName}
      />

      {isAudioMode && pitchStageActive && (
        <div className="pitch-stage-ambient pitch-stage-ambient--live-tuner" aria-hidden />
      )}

      {isAudioMode && metronomeStageActive && (
        <div className="metronome-stage-ambient metronome-stage-ambient--live" aria-hidden />
      )}

      {showAudioIdle && (
        <div
          className={`${overlayClass} camera-background-overlay--audio-hero flex flex-col items-center justify-center ${
            isEmbedded ? 'camera-background-overlay--audio-hero-embedded' : ''
          }`}
        >
          <AudioModeHeroMic isRecording={isRecording} compact={isEmbedded} />
          {!isEmbedded && (
            <p className="audio-mode-hero-mic__caption mt-4 text-sm font-medium">Audio Mode</p>
          )}
        </div>
      )}

      <div
        className={`${overlayClass} pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-black/25 ${
          showAudioIdle ? 'opacity-40' : isAudioMode ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {showPreparingOverlay && (
        <div
          className={`${overlayClass} camera-background-overlay--preparing pointer-events-none`}
          aria-hidden
        />
      )}
    </div>
  )
}

export default memo(
  LiveCameraBackground,
  (prev, next) =>
    prev.previewRef === next.previewRef &&
    prev.streamRef === next.streamRef &&
    prev.streamGeneration === next.streamGeneration &&
    prev.recordingMode === next.recordingMode &&
    prev.isRecording === next.isRecording &&
    prev.resumeNonce === next.resumeNonce &&
    prev.modePreparing === next.modePreparing &&
    prev.pitchStageActive === next.pitchStageActive &&
    prev.metronomeStageActive === next.metronomeStageActive &&
    prev.audioPracticeOverlayActive === next.audioPracticeOverlayActive &&
    prev.variant === next.variant &&
    prev.visuallySuppressed === next.visuallySuppressed &&
    prev.nativePreviewActive === next.nativePreviewActive,
)
