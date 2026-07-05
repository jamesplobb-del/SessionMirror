import { memo, useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import AudioModeHeroMic from './audioPractice/AudioModeHeroMic'
import type { RecordingMode } from '../types'
import { useCameraPreviewResume } from '../hooks/useCameraPreviewResume'
import { iosBulletproofVideoProps } from '../utils/mobileVideo'
import { getFrontCameraZoomRange, getCssPreviewZoom, setFrontCameraZoom } from '../utils/videoCapture'
import {
  assignMediaPlaybackSrc,
  waitForMediaReadyWithRetry,
} from '../utils/mediaPlayback'
import { resetVideoPlayback } from '../utils/videoPlayback'
import { playTakeMediaAudible } from '../utils/takePlaybackAudio'

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
  /** Hands-free video take replaces the live camera fullscreen during playback. */
  handsFreePlaybackTakeId?: string | null
  handsFreePlaybackSrc?: string | null
  /** PiP / review playback — release the live preview decoder so the take can decode. */
  inlineTakePlaybackActive?: boolean
  onHandsFreePlaybackPlayingChange?: (playing: boolean) => void
  onHandsFreePlaybackComplete?: () => void
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
  handsFreePlaybackTakeId = null,
  handsFreePlaybackSrc = null,
  inlineTakePlaybackActive = false,
  onHandsFreePlaybackPlayingChange,
  onHandsFreePlaybackComplete,
}: LiveCameraBackgroundProps) {
  const handsFreePlaybackVideoRef = useRef<HTMLVideoElement>(null)
  const handsFreePlaybackSessionRef = useRef(false)
  const deferredPreviewStreamRef = useRef<MediaStream | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const pinchPointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistanceRef = useRef(0)
  const pinchStartZoomRef = useRef(1)
  const zoomRequestFrameRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<number | null>(null)
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
    if (handsFreePlaybackTakeId) return
    if (inlineTakePlaybackActive) return
    if (modePreparing) return
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
  }, [previewRef, streamRef, streamGeneration, recordingMode, isAudioMode, nativePreviewActive, handsFreePlaybackTakeId, inlineTakePlaybackActive, modePreparing])

  useEffect(() => {
    if (nativePreviewActive) return
    if (handsFreePlaybackTakeId) return
    if (inlineTakePlaybackActive) return
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
  }, [handsFreePlaybackTakeId, inlineTakePlaybackActive, isAudioMode, modePreparing, nativePreviewActive, previewRef, resumingPreview, streamRef, streamGeneration, visuallySuppressed])

  useEffect(() => {
    if (nativePreviewActive) return
    if (handsFreePlaybackTakeId) return
    if (inlineTakePlaybackActive) return
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
  }, [handsFreePlaybackTakeId, inlineTakePlaybackActive, isAudioMode, modePreparing, nativePreviewActive, previewRef, streamRef, streamGeneration, visuallySuppressed])

  useEffect(() => {
    if (nativePreviewActive || isAudioMode || isRecording) return
    if (!inlineTakePlaybackActive) return

    const video = previewRef.current
    if (!video) return

    deferredPreviewStreamRef.current = (video.srcObject as MediaStream | null) ?? streamRef.current
    video.pause()
    video.srcObject = null

    return () => {
      const stream = streamRef.current ?? deferredPreviewStreamRef.current
      deferredPreviewStreamRef.current = null
      if (!video || !stream) return
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        void video.play().catch((err) => console.warn('Playback intercepted:', err))
      }
    }
  }, [
    inlineTakePlaybackActive,
    isAudioMode,
    isRecording,
    nativePreviewActive,
    previewRef,
    streamRef,
    streamGeneration,
  ])

  useEffect(() => {
    const wantsPlayback =
      recordingMode === 'video' &&
      Boolean(handsFreePlaybackTakeId) &&
      Boolean(handsFreePlaybackSrc) &&
      !isAudioMode &&
      !visuallySuppressed

    if (!wantsPlayback) {
      handsFreePlaybackSessionRef.current = false
      return
    }

    handsFreePlaybackSessionRef.current = true
    let cancelled = false

    void (async () => {
      const media = handsFreePlaybackVideoRef.current
      if (!media) {
        onHandsFreePlaybackComplete?.()
        return
      }

      resetVideoPlayback(media)
      assignMediaPlaybackSrc(media, handsFreePlaybackSrc!)
      media.load()

      const ready = await waitForMediaReadyWithRetry(media)
      if (cancelled || !handsFreePlaybackSessionRef.current) return

      if (!ready) {
        console.warn('Hands-free background playback media not ready', {
          takeId: handsFreePlaybackTakeId,
          readyState: media.readyState,
        })
        onHandsFreePlaybackComplete?.()
        return
      }

      const onEnded = () => {
        if (!handsFreePlaybackSessionRef.current) return
        handsFreePlaybackSessionRef.current = false
        onHandsFreePlaybackPlayingChange?.(false)
        onHandsFreePlaybackComplete?.()
      }

      media.addEventListener('ended', onEnded, { once: true })

      const started = await playTakeMediaAudible(media, {
        onFailure: () => onHandsFreePlaybackPlayingChange?.(false),
      })
      if (cancelled || !handsFreePlaybackSessionRef.current) {
        media.removeEventListener('ended', onEnded)
        return
      }

      if (started) {
        onHandsFreePlaybackPlayingChange?.(true)
      } else {
        media.removeEventListener('ended', onEnded)
        handsFreePlaybackSessionRef.current = false
        onHandsFreePlaybackComplete?.()
      }
    })()

    return () => {
      cancelled = true
      handsFreePlaybackSessionRef.current = false
      const media = handsFreePlaybackVideoRef.current
      if (media) {
        resetVideoPlayback(media)
      }
    }
  }, [
    handsFreePlaybackSrc,
    handsFreePlaybackTakeId,
    isAudioMode,
    onHandsFreePlaybackComplete,
    onHandsFreePlaybackPlayingChange,
    recordingMode,
    visuallySuppressed,
  ])

  const showHandsFreeTakePlayback =
    recordingMode === 'video' &&
    Boolean(handsFreePlaybackTakeId) &&
    Boolean(handsFreePlaybackSrc) &&
    !isAudioMode &&
    !visuallySuppressed

  const pinchZoomEnabled =
    !isEmbedded &&
    !isAudioMode &&
    !nativePreviewActive &&
    !visuallySuppressed &&
    !showHandsFreeTakePlayback

  const getPinchDistance = useCallback(() => {
    const points = Array.from(pinchPointersRef.current.values())
    if (points.length < 2) return 0
    const [first, second] = points
    return Math.hypot(second.x - first.x, second.y - first.y)
  }, [])

  const scheduleZoom = useCallback(
    (zoom: number) => {
      pendingZoomRef.current = zoom
      if (zoomRequestFrameRef.current !== null) return

      zoomRequestFrameRef.current = window.requestAnimationFrame(() => {
        zoomRequestFrameRef.current = null
        const nextZoom = pendingZoomRef.current
        pendingZoomRef.current = null
        if (nextZoom === null) return
        void setFrontCameraZoom(streamRef.current, nextZoom)
      })
    },
    [streamRef],
  )

  const beginPinchGesture = useCallback(() => {
    const range = getFrontCameraZoomRange(streamRef.current)
    if (!range) return false

    const distance = getPinchDistance()
    if (distance <= 0) return false

    pinchStartDistanceRef.current = distance
    pinchStartZoomRef.current = range.current
    return true
  }, [getPinchDistance, streamRef])

  const updatePinchGesture = useCallback(() => {
    const range = getFrontCameraZoomRange(streamRef.current)
    const startDistance = pinchStartDistanceRef.current
    if (!range || startDistance <= 0) return false

    const distance = getPinchDistance()
    if (distance <= 0) return false

    scheduleZoom(pinchStartZoomRef.current * (distance / startDistance))
    return true
  }, [getPinchDistance, scheduleZoom, streamRef])

  const handleCameraPinchPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pinchZoomEnabled) return
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return

      pinchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
      event.currentTarget.setPointerCapture?.(event.pointerId)

      if (pinchPointersRef.current.size === 2 && !beginPinchGesture()) {
        pinchPointersRef.current.clear()
      }
    },
    [beginPinchGesture, pinchZoomEnabled],
  )

  const handleCameraPinchPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pinchZoomEnabled) return
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      if (!pinchPointersRef.current.has(event.pointerId)) return

      pinchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })

      if (pinchPointersRef.current.size < 2) return
      if (updatePinchGesture()) {
        event.preventDefault()
      }
    },
    [pinchZoomEnabled, updatePinchGesture],
  )

  const handleCameraPinchPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    pinchPointersRef.current.delete(event.pointerId)
    if (pinchPointersRef.current.size < 2) {
      pinchStartDistanceRef.current = 0
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }, [])

  useEffect(() => {
    if (pinchZoomEnabled) return
    pinchPointersRef.current.clear()
    pinchStartDistanceRef.current = 0
  }, [pinchZoomEnabled])

  useEffect(() => {
    if (!pinchZoomEnabled) return
    const video = previewRef.current
    if (!video) return
    video.style.setProperty('--camera-preview-zoom', String(getCssPreviewZoom()))
  }, [pinchZoomEnabled, previewRef, streamGeneration])

  useEffect(() => {
    if (!pinchZoomEnabled) return
    const el = shellRef.current
    if (!el) return

    const touchPoints = new Map<number, { x: number; y: number }>()

    const syncTouchToPinchRefs = () => {
      pinchPointersRef.current.clear()
      for (const [id, point] of touchPoints) {
        pinchPointersRef.current.set(id, point)
      }
    }

    const onTouchStart = (event: TouchEvent) => {
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        const touch = event.changedTouches[index]
        touchPoints.set(touch.identifier, { x: touch.clientX, y: touch.clientY })
      }

      if (touchPoints.size === 2) {
        syncTouchToPinchRefs()
        if (!beginPinchGesture()) {
          touchPoints.clear()
          pinchPointersRef.current.clear()
        }
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      if (touchPoints.size < 2) return

      for (let index = 0; index < event.changedTouches.length; index += 1) {
        const touch = event.changedTouches[index]
        if (!touchPoints.has(touch.identifier)) continue
        touchPoints.set(touch.identifier, { x: touch.clientX, y: touch.clientY })
      }

      syncTouchToPinchRefs()
      if (updatePinchGesture()) {
        event.preventDefault()
      }
    }

    const onTouchEnd = (event: TouchEvent) => {
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        touchPoints.delete(event.changedTouches[index].identifier)
      }
      syncTouchToPinchRefs()
      if (touchPoints.size < 2) {
        pinchStartDistanceRef.current = 0
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [beginPinchGesture, pinchZoomEnabled, updatePinchGesture])

  useEffect(
    () => () => {
      if (zoomRequestFrameRef.current !== null) {
        window.cancelAnimationFrame(zoomRequestFrameRef.current)
      }
    },
    [],
  )

  const shellClass = [
    isEmbedded
      ? 'camera-background camera-background--embedded'
      : visuallySuppressed
        ? 'camera-background camera-background--visually-suppressed'
        : nativePreviewActive
          ? 'camera-background camera-background--native-preview'
          : 'camera-background',
    pinchZoomEnabled ? 'camera-background--pinch-zoom' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const previewClassName = [
    isEmbedded ? 'camera-preview--embedded' : 'camera-preview',
    'camera-preview--mirror',
    'camera-preview--live',
    isAudioMode || nativePreviewActive || showHandsFreeTakePlayback ? 'camera-preview--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showPreparingOverlay = modePreparing && !resumingPreview
  const showPlaceholder = !nativePreviewActive && resumingPreview && Boolean(placeholderUrl)

  return (
    <div
      ref={shellRef}
      className={shellClass}
      aria-hidden={!isEmbedded && !visuallySuppressed}
      onPointerDown={handleCameraPinchPointerDown}
      onPointerMove={handleCameraPinchPointerMove}
      onPointerUp={handleCameraPinchPointerEnd}
      onPointerCancel={handleCameraPinchPointerEnd}
      onPointerLeave={handleCameraPinchPointerEnd}
    >
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

      {showHandsFreeTakePlayback && (
        <video
          ref={handsFreePlaybackVideoRef}
          autoPlay
          playsInline
          {...iosBulletproofVideoProps}
          className={`${isEmbedded ? 'camera-preview--embedded' : 'camera-preview'} camera-preview--take-playback camera-preview--live`}
        />
      )}

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
    prev.nativePreviewActive === next.nativePreviewActive &&
    prev.handsFreePlaybackTakeId === next.handsFreePlaybackTakeId &&
    prev.handsFreePlaybackSrc === next.handsFreePlaybackSrc &&
    prev.inlineTakePlaybackActive === next.inlineTakePlaybackActive,
)
