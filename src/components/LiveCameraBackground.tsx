import { memo, useEffect, type RefObject } from 'react'
import { Mic } from 'lucide-react'
import type { RecordingMode } from '../types'
import { iosBulletproofVideoProps } from '../utils/mobileVideo'

interface LiveCameraBackgroundProps {
  previewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  error: string | null
  recordingMode: RecordingMode
  isRecording: boolean
  /** Brief overlay while switching between camera and audio capture. */
  modePreparing?: boolean
  /** Hide the idle audio-mode mic UI while main-screen pitch analysis is showing. */
  pitchStageActive?: boolean
  /** fullscreen = behind HUD; embedded = inside split-view panel */
  variant?: 'fullscreen' | 'embedded'
  /** Keep the preview element mounted but off-screen (split view uses embedded preview). */
  visuallySuppressed?: boolean
}

function LiveCameraBackground({
  previewRef,
  streamRef,
  streamGeneration,
  error,
  recordingMode,
  isRecording,
  modePreparing = false,
  pitchStageActive = false,
  variant = 'fullscreen',
  visuallySuppressed = false,
}: LiveCameraBackgroundProps) {
  const isAudioMode = recordingMode === 'audio'
  const showAudioIdle = isAudioMode && !pitchStageActive
  const isEmbedded = variant === 'embedded'
  const overlayClass = isEmbedded
    ? 'camera-background-overlay camera-background-overlay--embedded'
    : 'camera-background-overlay'

  useEffect(() => {
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
      void video.play().catch((err) => console.warn('Playback intercepted:', err))
    } else if (video.paused) {
      void video.play().catch((err) => console.warn('Playback intercepted:', err))
    }
  }, [previewRef, streamRef, streamGeneration, recordingMode, isAudioMode])

  useEffect(() => {
    if (isAudioMode) return

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
      if (video.paused) {
        void video.play().catch((err) => console.warn('Playback intercepted:', err))
      }
    }

    revivePreview()
    const intervalId = window.setInterval(revivePreview, 350)
    const video = previewRef.current
    video?.addEventListener('pause', revivePreview)
    video?.addEventListener('stalled', revivePreview)
    video?.addEventListener('suspend', revivePreview)

    return () => {
      window.clearInterval(intervalId)
      video?.removeEventListener('pause', revivePreview)
      video?.removeEventListener('stalled', revivePreview)
      video?.removeEventListener('suspend', revivePreview)
    }
  }, [isAudioMode, previewRef, streamRef, streamGeneration, visuallySuppressed])

  useEffect(() => {
    if (visuallySuppressed || isAudioMode) return
    const video = previewRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    void video.play().catch((err) => console.warn('Playback intercepted:', err))
  }, [isAudioMode, previewRef, streamRef, streamGeneration, visuallySuppressed])

  const shellClass = isEmbedded
    ? 'camera-background camera-background--embedded'
    : visuallySuppressed
      ? 'camera-background camera-background--visually-suppressed'
      : 'camera-background'

  // #region agent log
  if (isEmbedded || visuallySuppressed) {
    fetch('http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fba730'},body:JSON.stringify({sessionId:'fba730',location:'LiveCameraBackground.tsx:render',message:'camera preview variant',data:{variant,isEmbedded,visuallySuppressed,isRecording,recordingMode},timestamp:Date.now(),hypothesisId:'H,I'})}).catch(()=>{});
  }
  // #endregion

  return (
    <div className={shellClass} aria-hidden={!isEmbedded && !visuallySuppressed}>
      <video
        ref={previewRef}
        autoPlay
        muted
        {...iosBulletproofVideoProps}
        className={`${
          isEmbedded ? 'camera-preview--embedded' : 'camera-preview'
        } camera-preview--mirror camera-preview--live ${
          isAudioMode ? 'camera-preview--hidden' : ''
        }`}
      />

      {isAudioMode && pitchStageActive && (
        <div className="pitch-stage-ambient pitch-stage-ambient--live-tuner" aria-hidden />
      )}

      {showAudioIdle && (
        <div
          className={`${overlayClass} camera-background-overlay--audio-idle pitch-audio-idle flex flex-col items-center justify-center`}
        >
          <div
            className={`pitch-audio-idle__orb mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full ${
              isRecording ? 'pitch-audio-idle__orb--recording' : ''
            }`}
          >
            <Mic className={`h-7 w-7 ${isRecording ? 'text-sky-200' : 'text-sky-300/90'}`} />
          </div>
          <div className="flex h-9 items-end justify-center gap-1.5">
            {[0, 1, 2, 3, 4].map((bar) => (
              <div
                key={bar}
                className={`pitch-audio-idle__bar w-[3px] rounded-full ${
                  isRecording ? 'pitch-audio-idle__bar--live' : ''
                }`}
                style={{
                  height: `${14 + bar * 5}px`,
                  animationDelay: `${bar * 90}ms`,
                }}
              />
            ))}
          </div>
          <p className="pitch-audio-idle__label mt-5 text-sm font-medium">
            Audio Mode
          </p>
        </div>
      )}

      {error && (
        <div className={`${overlayClass} flex items-center justify-center bg-black`}>
          <p className="max-w-sm px-6 text-center text-sm text-white/70">{error}</p>
        </div>
      )}

      <div
        className={`${overlayClass} pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-black/25 ${
          showAudioIdle ? 'opacity-40' : isAudioMode ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {modePreparing && (
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
    prev.error === next.error &&
    prev.recordingMode === next.recordingMode &&
    prev.isRecording === next.isRecording &&
    prev.modePreparing === next.modePreparing &&
    prev.pitchStageActive === next.pitchStageActive &&
    prev.variant === next.variant &&
    prev.visuallySuppressed === next.visuallySuppressed,
)
