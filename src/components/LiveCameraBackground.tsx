import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import AudioModeHeroMic from './audioPractice/AudioModeHeroMic'
import type { RecordingMode } from '../types'
import { useCameraPreviewResume } from '../hooks/useCameraPreviewResume'
import { iosBulletproofVideoProps, withWebKitThumbnailHint } from '../utils/mobileVideo'
import { getFrontCameraZoomRange, getCssPreviewZoom, setFrontCameraZoom } from '../utils/videoCapture'
import {
  assignMediaPlaybackSrc,
  waitForMediaReadyWithRetry,
} from '../utils/mediaPlayback'
import { resetVideoPlayback } from '../utils/videoPlayback'
import { playTakeMediaAudible } from '../utils/takePlaybackAudio'
import {
  completePlaybackRouteRestore,
  preparePlaybackRoute,
} from '../utils/playbackRouteCoordinator'
import { attachVideoDecoderStallRecovery } from '../utils/videoDecoderStallRecovery'
import { applyAutoPlaybackLeadIn, attachAutoPlaybackTailSkip } from '../utils/autoRecordPlayback'
import {
  createNativePreviewFramePump,
  subscribeNativeCameraPreviewFrames,
} from '../utils/nativeCameraFrameBridge'
import { drawPreviewFrameOnCanvas, paintPreviewVideoOnCanvas } from '../utils/capturePreviewFrame'

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
  /** Native iOS live preview via canvas frame bridge (opaque WebView). */
  nativeLivePreviewActive?: boolean
  /** Keep the bridge canvas mounted so record-start handoff can paint instantly. */
  nativeCameraBridgeEnabled?: boolean
  /** Seamless handoff: last WebKit frame shown until native bridge delivers. */
  nativeLivePreviewSeedUrl?: string | null
  /** Saved-take playback is using the video decoder; pause live preview until it ends. */
  holdPreviewForTakePlayback?: boolean
  /** Hands-free video take replaces the live camera fullscreen during playback. */
  handsFreePlaybackTakeId?: string | null
  handsFreePlaybackSrc?: string | null
  handsFreePlaybackPerformanceStartSeconds?: number
  handsFreePlaybackTailSkipSeconds?: number
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
  nativeLivePreviewActive = false,
  nativeCameraBridgeEnabled = false,
  nativeLivePreviewSeedUrl = null,
  holdPreviewForTakePlayback = false,
  handsFreePlaybackTakeId = null,
  handsFreePlaybackSrc = null,
  handsFreePlaybackPerformanceStartSeconds,
  handsFreePlaybackTailSkipSeconds = 0,
  onHandsFreePlaybackPlayingChange,
  onHandsFreePlaybackComplete,
}: LiveCameraBackgroundProps) {
  const handsFreePlaybackVideoRef = useRef<HTMLVideoElement>(null)
  const handsFreePlaybackSessionRef = useRef(false)
  const handsFreeStallRecoveryRef = useRef<(() => void) | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const nativePreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const nativeFramePumpRef = useRef<ReturnType<typeof createNativePreviewFramePump> | null>(null)
  const nativeBridgePrimedRef = useRef(false)
  /** True once a frame has actually been painted since the bridge was last (re)primed — gates revealing the canvas so a stale/frozen frame from before backgrounding is never shown as if live. */
  const [nativeFrameFresh, setNativeFrameFresh] = useState(false)
  const [handsFreePlaybackReady, setHandsFreePlaybackReady] = useState(false)
  /**
   * Mirrors whether `nativeFrameFresh` has already been signaled true for the
   * current priming cycle. The frame pump paints on every native frame
   * (~60/sec) — without this guard, `setNativeFrameFresh(true)` (and the
   * closure call itself) fired on every single one of those frames instead of
   * once when the canvas actually becomes safe to reveal, competing with
   * concurrent sheet/overlay animations for main-thread time for no visual
   * benefit. Reset alongside `setNativeFrameFresh(false)` below.
   */
  const frameFreshSignaledRef = useRef(false)
  const pinchPointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistanceRef = useRef(0)
  const pinchStartZoomRef = useRef(1)
  const zoomRequestFrameRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<number | null>(null)
  const isAudioMode = recordingMode === 'audio'
  const showAudioIdle =
    isAudioMode && !pitchStageActive && !metronomeStageActive && !audioPracticeOverlayActive
  const isEmbedded = variant === 'embedded'
  const previewWorkSuppressed = visuallySuppressed && !isEmbedded
  const handsFreeTakePlaybackRequested =
    recordingMode === 'video' &&
    Boolean(handsFreePlaybackTakeId) &&
    Boolean(handsFreePlaybackSrc) &&
    !isAudioMode &&
    !visuallySuppressed
  // Keep the live preview visible until the saved take has loaded. Hiding it
  // before the decoder is ready leaves a black camera surface if a just-saved
  // file needs another moment to become readable on iOS.
  const showHandsFreeTakePlayback =
    handsFreeTakePlaybackRequested && handsFreePlaybackReady
  const nativePreviewSuppressedForPlayback =
    showHandsFreeTakePlayback ||
    (holdPreviewForTakePlayback && !handsFreeTakePlaybackRequested)
  const activeNativeLivePreview =
    nativeLivePreviewActive && !previewWorkSuppressed && !nativePreviewSuppressedForPlayback
  const overlayClass = isEmbedded
    ? 'camera-background-overlay camera-background-overlay--embedded'
    : 'camera-background-overlay'
  const webPreviewMode = activeNativeLivePreview ? 'audio' : recordingMode

  const showNativeBridgeCanvas =
    !previewWorkSuppressed &&
    !showHandsFreeTakePlayback &&
    (nativeCameraBridgeEnabled || activeNativeLivePreview)

  useLayoutEffect(() => {
    if (!activeNativeLivePreview) return
    const canvas = nativePreviewCanvasRef.current
    if (!canvas) return

    const video = previewRef.current
    if (video && paintPreviewVideoOnCanvas(canvas, video)) {
      return
    }
    if (nativeLivePreviewSeedUrl) {
      drawPreviewFrameOnCanvas(canvas, nativeLivePreviewSeedUrl)
    }
  }, [activeNativeLivePreview, nativeLivePreviewSeedUrl, previewRef])

  useEffect(() => {
    if (!activeNativeLivePreview) return

    let cancelled = false
    let removeListener: (() => void) | null = null

    if (!nativeFramePumpRef.current) {
      nativeFramePumpRef.current = createNativePreviewFramePump(nativePreviewCanvasRef, () => {
        if (frameFreshSignaledRef.current) return
        frameFreshSignaledRef.current = true
        setNativeFrameFresh(true)
      })
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
  }, [activeNativeLivePreview])

  useEffect(() => {
    nativeBridgePrimedRef.current = activeNativeLivePreview
    if (!activeNativeLivePreview) {
      // Bridge just went inactive (backgrounded, mode switch, session
      // recovery) — the canvas may still hold a stale frame. Require a fresh
      // one to be painted before the next activation reveals it, instead of
      // instantly showing whatever frozen pixels are already there.
      frameFreshSignaledRef.current = false
      setNativeFrameFresh(false)
    }
  }, [activeNativeLivePreview])

  useEffect(() => {
    if (!holdPreviewForTakePlayback && !handsFreePlaybackTakeId) return
    const video = previewRef.current
    if (!video) return

    try {
      video.pause()
      video.srcObject = null
    } catch {
      /* ignore preview release failures */
    }
  }, [holdPreviewForTakePlayback, handsFreePlaybackTakeId, previewRef])

  useEffect(() => {
    if (!previewWorkSuppressed) return
    const video = previewRef.current
    if (!video) return

    try {
      video.pause()
      video.srcObject = null
    } catch {
      /* ignore hidden preview release failures */
    }
  }, [previewRef, previewWorkSuppressed])

  const { resumingPreview, placeholderUrl, placeholderFading, showSlowIndicator } =
    useCameraPreviewResume({
      previewRef,
      streamRef,
      streamGeneration,
      recordingMode: webPreviewMode,
      resumeNonce,
    })

  useEffect(() => {
    if (previewWorkSuppressed) return
    if (activeNativeLivePreview) return
    if (holdPreviewForTakePlayback) return
    if (handsFreePlaybackTakeId) return
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
  }, [previewRef, streamRef, streamGeneration, recordingMode, isAudioMode, activeNativeLivePreview, holdPreviewForTakePlayback, handsFreePlaybackTakeId, modePreparing, previewWorkSuppressed])

  useEffect(() => {
    if (previewWorkSuppressed) return
    if (activeNativeLivePreview) return
    if (holdPreviewForTakePlayback) return
    if (handsFreePlaybackTakeId) return
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
  }, [handsFreePlaybackTakeId, holdPreviewForTakePlayback, isAudioMode, modePreparing, activeNativeLivePreview, previewRef, resumingPreview, streamRef, streamGeneration, previewWorkSuppressed])

  useEffect(() => {
    if (previewWorkSuppressed) return
    if (activeNativeLivePreview) return
    if (holdPreviewForTakePlayback) return
    if (handsFreePlaybackTakeId) return
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
  }, [handsFreePlaybackTakeId, holdPreviewForTakePlayback, isAudioMode, modePreparing, activeNativeLivePreview, previewRef, streamRef, streamGeneration, visuallySuppressed, previewWorkSuppressed])

  useEffect(() => {
    const wantsPlayback =
      recordingMode === 'video' &&
      handsFreeTakePlaybackRequested

    if (!wantsPlayback) {
      handsFreePlaybackSessionRef.current = false
      setHandsFreePlaybackReady(false)
      return
    }

    handsFreePlaybackSessionRef.current = true
    let cancelled = false
    let stopTailSkip: (() => void) | null = null

    void (async () => {
      const media = handsFreePlaybackVideoRef.current
      if (!media) {
        onHandsFreePlaybackComplete?.()
        return
      }

      resetVideoPlayback(media)
      media.removeAttribute('src')
      media.load()
      assignMediaPlaybackSrc(media, withWebKitThumbnailHint(handsFreePlaybackSrc!))
      media.load()

      // Preflight while the preview is still visible. This is the critical
      // difference from the old path: a file that is not ready cannot replace
      // the camera with an empty black video element.
      const ready = await waitForMediaReadyWithRetry(media)
      if (cancelled || !handsFreePlaybackSessionRef.current) {
        return
      }

      if (!ready) {
        console.warn('Hands-free background playback media not ready', {
          takeId: handsFreePlaybackTakeId,
          readyState: media.readyState,
        })
        onHandsFreePlaybackComplete?.()
        return
      }

      try {
        await preparePlaybackRoute({ suspendCamera: true })
      } catch (error) {
        console.warn('[HandsFree] playback route prep failed', error)
        onHandsFreePlaybackComplete?.()
        return
      }
      if (cancelled || !handsFreePlaybackSessionRef.current) {
        await completePlaybackRouteRestore()
        return
      }

      setHandsFreePlaybackReady(true)

      await applyAutoPlaybackLeadIn(media, undefined, handsFreePlaybackPerformanceStartSeconds)

      const stopStallRecovery = () => {
        handsFreeStallRecoveryRef.current?.()
        handsFreeStallRecoveryRef.current = null
      }

      const onEnded = () => {
        if (!handsFreePlaybackSessionRef.current) return
        handsFreePlaybackSessionRef.current = false
        media.removeEventListener('ended', onEnded)
        stopTailSkip?.()
        stopTailSkip = null
        stopStallRecovery()
        onHandsFreePlaybackPlayingChange?.(false)
        onHandsFreePlaybackComplete?.()
      }

      media.addEventListener('ended', onEnded, { once: true })
      stopTailSkip = attachAutoPlaybackTailSkip(
        media,
        handsFreePlaybackTailSkipSeconds,
        onEnded,
      )

      stopStallRecovery()
      handsFreeStallRecoveryRef.current = attachVideoDecoderStallRecovery(media, {
        hasSource: () => Boolean(handsFreePlaybackSrc),
        debugLabel: 'HandsFree',
      })

      const started = await playTakeMediaAudible(media, {
        skipRoutePrep: true,
        suspendCameraForRoute: false,
        onFailure: () => onHandsFreePlaybackPlayingChange?.(false),
      })
      if (cancelled || !handsFreePlaybackSessionRef.current) {
        media.removeEventListener('ended', onEnded)
        stopTailSkip?.()
        stopTailSkip = null
        stopStallRecovery()
        return
      }

      if (started) {
        onHandsFreePlaybackPlayingChange?.(true)
      } else {
        media.removeEventListener('ended', onEnded)
        stopTailSkip?.()
        stopTailSkip = null
        handsFreePlaybackSessionRef.current = false
        setHandsFreePlaybackReady(false)
        onHandsFreePlaybackComplete?.()
      }
    })()

    return () => {
      cancelled = true
      handsFreePlaybackSessionRef.current = false
      setHandsFreePlaybackReady(false)
      stopTailSkip?.()
      stopTailSkip = null
      handsFreeStallRecoveryRef.current?.()
      handsFreeStallRecoveryRef.current = null
      const media = handsFreePlaybackVideoRef.current
      if (media) {
        resetVideoPlayback(media)
        media.removeAttribute('src')
        media.load()
      }
      void completePlaybackRouteRestore()
    }
  }, [
    handsFreePlaybackSrc,
    handsFreePlaybackPerformanceStartSeconds,
    handsFreePlaybackTailSkipSeconds,
    handsFreePlaybackTakeId,
    handsFreeTakePlaybackRequested,
    onHandsFreePlaybackComplete,
    onHandsFreePlaybackPlayingChange,
    recordingMode,
    visuallySuppressed,
  ])

  const pinchZoomEnabled =
    !isEmbedded &&
    !isAudioMode &&
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
    const zoom = String(getCssPreviewZoom())
    const video = previewRef.current
    const canvas = nativePreviewCanvasRef.current
    if (video) {
      video.style.setProperty('--camera-preview-zoom', zoom)
    }
    if (canvas) {
      canvas.style.setProperty('--camera-preview-zoom', zoom)
    }
  }, [pinchZoomEnabled, previewRef, streamGeneration, activeNativeLivePreview])

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
        : 'camera-background',
    pinchZoomEnabled ? 'camera-background--pinch-zoom' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const previewClassName = [
    isEmbedded ? 'camera-preview--embedded' : 'camera-preview',
    'camera-preview--mirror',
    'camera-preview--live',
    isAudioMode || activeNativeLivePreview || showHandsFreeTakePlayback || previewWorkSuppressed ? 'camera-preview--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showPreparingOverlay = modePreparing && !resumingPreview
  const showPlaceholder =
    !showHandsFreeTakePlayback &&
    !activeNativeLivePreview &&
    !previewWorkSuppressed &&
    resumingPreview &&
    Boolean(placeholderUrl)

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
      {showNativeBridgeCanvas && (
        <>
          <canvas
            ref={nativePreviewCanvasRef}
            className={`${isEmbedded ? 'camera-preview-canvas--embedded' : 'camera-preview-canvas'} ${
              activeNativeLivePreview
                ? 'camera-preview-canvas--live'
                : 'camera-preview-canvas--primed'
            }`}
            aria-hidden
          />
          {activeNativeLivePreview && (
            <div
              className={`camera-preview-priming-veil ${
                isEmbedded ? 'camera-preview-priming-veil--embedded' : ''
              } ${nativeFrameFresh ? 'camera-preview-priming-veil--fading' : ''}`}
              aria-hidden
            >
              <div className="camera-preview-resume-spinner" />
            </div>
          )}
        </>
      )}

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

      {handsFreeTakePlaybackRequested && (
        <video
          key={handsFreePlaybackTakeId ?? handsFreePlaybackSrc ?? 'handsfree-take-playback'}
          ref={handsFreePlaybackVideoRef}
          playsInline
          {...iosBulletproofVideoProps}
          className={`${isEmbedded ? 'camera-preview--embedded' : 'camera-preview'} camera-preview--take-playback camera-preview--live ${
            handsFreePlaybackReady ? '' : 'camera-preview--hidden'
          }`}
        />
      )}

      {isAudioMode && pitchStageActive && (
        <div className="pitch-stage-ambient pitch-stage-ambient--live-tuner" aria-hidden />
      )}

      {isAudioMode && metronomeStageActive && (
        <div className="metronome-stage-ambient metronome-stage-ambient--live" aria-hidden />
      )}

      <div
        className={`${overlayClass} camera-background-overlay--audio-hero flex flex-col items-center justify-center ${
          isEmbedded ? 'camera-background-overlay--audio-hero-embedded' : ''
        } transition-all duration-500 ease-out ${
          showAudioIdle
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}
      >
        <AudioModeHeroMic isRecording={isRecording} compact={isEmbedded} />
        {!isEmbedded && (
          <p className="audio-mode-hero-mic__caption mt-4 text-sm font-medium">Audio Mode</p>
        )}
      </div>

      <div
        className={`${overlayClass} pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-black/25 ${
          showAudioIdle ? 'opacity-40' : isAudioMode ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <div
        className={`camera-recording-border ${isRecording ? 'camera-recording-border--active' : ''}`}
        aria-hidden
      />

      {showPreparingOverlay && !previewWorkSuppressed && (
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
    prev.nativeLivePreviewActive === next.nativeLivePreviewActive &&
    prev.nativeCameraBridgeEnabled === next.nativeCameraBridgeEnabled &&
    prev.nativeLivePreviewSeedUrl === next.nativeLivePreviewSeedUrl &&
    prev.holdPreviewForTakePlayback === next.holdPreviewForTakePlayback &&
    prev.handsFreePlaybackTakeId === next.handsFreePlaybackTakeId &&
    prev.handsFreePlaybackSrc === next.handsFreePlaybackSrc &&
    prev.handsFreePlaybackPerformanceStartSeconds ===
      next.handsFreePlaybackPerformanceStartSeconds,
)
