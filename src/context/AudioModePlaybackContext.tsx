import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  prepareInlineMediaElement,
  resolveMediaPlaybackSrc,
  waitForMediaReadyWithRetry,
} from '../utils/mediaPlayback'
import {
  completePlaybackRouteRestore,
  isPlaybackRouteHoldActive,
  preparePlaybackRoute,
} from '../utils/playbackRouteCoordinator'
import {
  playTakeMediaAudible,
  primeTakePlaybackForPreparedSession,
  releaseTakePlaybackAudio,
} from '../utils/takePlaybackAudio'
import { readCachedPlaybackSrc, resolveTakePlaybackUrl } from '../utils/takeStorage'
import {
  attachPlaybackPipelineInstrumentation,
  createPlaybackDiagSession,
  logAudioSessionSnapshot,
  setActivePlaybackDiagSession,
} from '../utils/audioPlaybackDiagnostics'
import {
  releaseAudioModeNativePlaybackRoute,
  setAudioModeNativePlaybackEndedHandler,
  shouldUseAudioModeNativePlayback,
  startAudioModeNativePlayback,
  stopAudioModeNativePlayback,
  teardownAudioModeNativePlaybackListener,
} from '../utils/audioModeNativePlayback'

export interface AudioModePlaybackItem {
  id: string
  name: string
  filePath: string
  mediaUrl: string
  mimeType: string
  takeId?: string
  /** Reserved for the hands-free loop; ordinary Audio-tab takes stay on WebKit playback. */
  nativePlayback?: boolean
  /** Native hands-free playback applies this measured, limiter-protected gain. */
  playbackGainDb?: number
}

interface AudioModePlaybackState {
  currentItem: AudioModePlaybackItem | null
  isPlaying: boolean
  currentTime: number
  duration: number
  sessionPrepared: boolean
  playerExists: boolean
}

interface AudioModePlaybackContextValue {
  playerRef: RefObject<HTMLAudioElement | null>
  state: AudioModePlaybackState
  select: (item: AudioModePlaybackItem) => void
  prime: (item: AudioModePlaybackItem) => void
  play: (
    item: AudioModePlaybackItem,
    options?: {
      startTime?: number
      onStarted?: (duration: number) => void
      onFailed?: () => void
      onEnded?: () => void
    },
  ) => void
  toggle: (item: AudioModePlaybackItem) => void
  pause: () => void
  seek: (time: number) => void
  openFullscreen: (item: AudioModePlaybackItem) => void
  closeFullscreen: () => void
  matchesCurrentSource: (item: Pick<AudioModePlaybackItem, 'filePath' | 'mediaUrl'>) => boolean
}

const AudioModePlaybackContext = createContext<AudioModePlaybackContextValue | null>(null)
/** App-level hook for pausing inline audio-mode take playback (vault, settings, review). */
export const audioModePlaybackControlsRef: {
  pause: (() => void) | null
  play: AudioModePlaybackContextValue['play'] | null
} = { pause: null, play: null }

interface AudioModePlaybackProviderProps {
  children: ReactNode
  onBeforePlay?: () => void | Promise<void>
  onPlaybackActiveChange?: (active: boolean) => void
}

function logPlayback(message: string, details: Record<string, unknown> = {}): void {
  console.info('[Playback]', message, details)
}

function sourceKeyFor(item: Pick<AudioModePlaybackItem, 'filePath' | 'mediaUrl'>): string {
  return item.filePath ? `file:${item.filePath}` : `url:${item.mediaUrl || ''}`
}

function usesNativeHandsFreePlayback(item: AudioModePlaybackItem): boolean {
  return item.nativePlayback === true && shouldUseAudioModeNativePlayback(item)
}

function resolveItemSrc(item: AudioModePlaybackItem): string {
  const cached = readCachedPlaybackSrc(item.filePath, item.mediaUrl)
  return resolveMediaPlaybackSrc(cached ?? item.mediaUrl)
}

async function resolveItemSrcForPlayback(item: AudioModePlaybackItem): Promise<string> {
  const cached = readCachedPlaybackSrc(item.filePath, item.mediaUrl)
  if (cached) return resolveMediaPlaybackSrc(cached)
  const resolved = await resolveTakePlaybackUrl(item.filePath, item.mediaUrl)
  return resolveMediaPlaybackSrc(resolved || item.mediaUrl)
}

function playableDuration(player: HTMLMediaElement): number | null {
  return Number.isFinite(player.duration) && player.duration > 0 ? player.duration : null
}

/**
 * Never treat a short timeout as readiness. Large local takes can need more
 * decoder time on iOS; playback only proceeds after the element reports both
 * current media data and a real duration.
 */
async function waitForAudioModePlaybackReady(player: HTMLAudioElement): Promise<number> {
  const existingDuration = playableDuration(player)
  if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && existingDuration !== null) {
    return existingDuration
  }

  const ready = await waitForMediaReadyWithRetry(player, {
    attempts: 15,
    intervalMs: 250,
    timeoutMs: 1200,
  })
  const duration = playableDuration(player)
  if (!ready || duration === null) {
    const code = player.error?.code
    throw new Error(
      `Audio take did not become playable${code ? ` (media error ${code})` : ''}.`,
    )
  }

  return duration
}

export function AudioModePlaybackProvider({
  children,
  onBeforePlay,
  onPlaybackActiveChange,
}: AudioModePlaybackProviderProps) {
  const playerRef = useRef<HTMLAudioElement>(null)
  const onBeforePlayRef = useRef(onBeforePlay)
  const onPlaybackActiveChangeRef = useRef(onPlaybackActiveChange)
  const sessionPreparedRef = useRef(false)
  const pendingStartTimeRef = useRef<number | null>(null)
  const currentSourceKeyRef = useRef('')
  const endedListenerSourceKeyRef = useRef('')
  const progressRafRef = useRef<number | null>(null)
  const pipelineDetachRef = useRef<(() => void) | null>(null)
  const desiredPlayingRef = useRef(false)
  const resumeTimerRef = useRef<number | null>(null)
  const resumeInFlightRef = useRef(false)
  const primingSourceKeyRef = useRef('')
  const primeInFlightRef = useRef<Promise<void> | null>(null)
  const playbackRequestIdRef = useRef(0)
  const nativePlaybackActiveRef = useRef(false)
  const nativePlaybackStartingRef = useRef(false)
  const nativePlaybackStartMsRef = useRef(0)
  const nativePlaybackOffsetRef = useRef(0)
  const nativeDurationRef = useRef(0)
  const externalNativePlaybackEndedRef = useRef<(() => void) | null>(null)
  const [state, setState] = useState<AudioModePlaybackState>({
    currentItem: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    sessionPrepared: false,
    playerExists: false,
  })

  useEffect(() => {
    onBeforePlayRef.current = onBeforePlay
  }, [onBeforePlay])

  useEffect(() => {
    onPlaybackActiveChangeRef.current = onPlaybackActiveChange
  }, [onPlaybackActiveChange])

  const updateSessionPrepared = useCallback((prepared: boolean) => {
    sessionPreparedRef.current = prepared
    setState((prev) => ({ ...prev, sessionPrepared: prepared }))
  }, [])

  const stopProgressLoop = useCallback(() => {
    if (progressRafRef.current !== null) {
      cancelAnimationFrame(progressRafRef.current)
      progressRafRef.current = null
    }
  }, [])

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }, [])

  const startProgressLoop = useCallback(() => {
    stopProgressLoop()

    const tick = () => {
      if (nativePlaybackActiveRef.current) {
        const elapsedSeconds = (performance.now() - nativePlaybackStartMsRef.current) / 1000
        const duration = nativeDurationRef.current
        const nextTime = Math.min(
          nativePlaybackOffsetRef.current + elapsedSeconds,
          duration > 0 ? duration : nativePlaybackOffsetRef.current + elapsedSeconds,
        )
        setState((prev) => ({
          ...prev,
          currentTime: nextTime,
          duration: duration > 0 ? duration : prev.duration,
        }))
        if (duration > 0 && nextTime >= duration - 0.05) {
          progressRafRef.current = null
          return
        }
        progressRafRef.current = requestAnimationFrame(tick)
        return
      }

      const player = playerRef.current
      if (!player || player.paused || player.ended) {
        progressRafRef.current = null
        return
      }

      setState((prev) => ({
        ...prev,
        currentTime: Number.isFinite(player.currentTime) ? player.currentTime : 0,
        duration: playableDuration(player) ?? prev.duration,
      }))
      progressRafRef.current = requestAnimationFrame(tick)
    }

    progressRafRef.current = requestAnimationFrame(tick)
  }, [stopProgressLoop])

  const finishNativePlayback = useCallback(() => {
    nativePlaybackActiveRef.current = false
    nativePlaybackStartingRef.current = false
    desiredPlayingRef.current = false
    clearResumeTimer()
    stopProgressLoop()
    onPlaybackActiveChangeRef.current?.(false)
    updateSessionPrepared(false)
    const duration = nativeDurationRef.current
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: duration > 0 ? duration : prev.currentTime,
    }))
    logPlayback('Stopped', {
      takeId: state.currentItem?.takeId ?? state.currentItem?.id,
      position: duration > 0 ? duration : nativePlaybackOffsetRef.current,
      playerExists: false,
      sessionPrepared: false,
      path: 'native-avplayer',
    })
  }, [clearResumeTimer, state.currentItem, stopProgressLoop, updateSessionPrepared])

  const ensurePlayerSource = useCallback((item: AudioModePlaybackItem): HTMLAudioElement | null => {
    const player = playerRef.current
    if (!player) {
      logPlayback('Player missing', { takeId: item.takeId ?? item.id })
      return null
    }

    const nextSourceKey = sourceKeyFor(item)
    const nextSrc = resolveItemSrc(item)
    const playerAlreadyExists = Boolean(player.src || player.currentSrc)

    if (currentSourceKeyRef.current === nextSourceKey && (player.src || player.currentSrc)) {
      logPlayback('Reusing player', {
        takeId: item.takeId ?? item.id,
        position: player.currentTime,
        playerAlreadyExists,
        sessionPrepared: sessionPreparedRef.current,
      })
      return player
    }

    logPlayback(playerAlreadyExists ? 'Reusing player for new source' : 'Creating player', {
      takeId: item.takeId ?? item.id,
      playerAlreadyExists,
      previousSource: currentSourceKeyRef.current,
      nextSource: nextSourceKey,
    })

    player.pause()
    player.src = nextSrc
    player.preload = 'auto'
    prepareInlineMediaElement(player, { preload: 'auto' })
    player.muted = false
    player.volume = 1
    player.load()
    currentSourceKeyRef.current = nextSourceKey
    endedListenerSourceKeyRef.current = ''
    setState((prev) => ({
      ...prev,
      currentItem: item,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playerExists: true,
    }))
    return player
  }, [])

  const prepareSessionOnce = useCallback(
    async (item: AudioModePlaybackItem) => {
      if (sessionPreparedRef.current || isPlaybackRouteHoldActive()) {
        logPlayback('Playback session already prepared', {
          takeId: item.takeId ?? item.id,
          sessionPrepared: sessionPreparedRef.current,
          routeActive: isPlaybackRouteHoldActive(),
        })
        updateSessionPrepared(true)
        return
      }

      logPlayback('Preparing playback session', {
        takeId: item.takeId ?? item.id,
        playerExists: Boolean(playerRef.current),
      })
      await preparePlaybackRoute({ suspendCamera: false })
      updateSessionPrepared(true)
    },
    [updateSessionPrepared]
  )

  const select = useCallback(
    (item: AudioModePlaybackItem) => {
      const player = ensurePlayerSource(item)
      logPlayback('Selected playback item', {
        takeId: item.takeId ?? item.id,
        position: player?.currentTime ?? 0,
        playerExists: Boolean(player),
        sessionPrepared: sessionPreparedRef.current,
      })
    },
    [ensurePlayerSource]
  )

  const prime = useCallback((item: AudioModePlaybackItem) => {
    const player = playerRef.current
    if (!player || desiredPlayingRef.current) return

    const sourceKey = sourceKeyFor(item)
    if (
      primingSourceKeyRef.current === sourceKey &&
      currentSourceKeyRef.current === sourceKey &&
      player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return
    }

    primingSourceKeyRef.current = sourceKey
    primeInFlightRef.current = (async () => {
      const resolvedSrc = await resolveItemSrcForPlayback(item)
      if (!resolvedSrc || desiredPlayingRef.current || primingSourceKeyRef.current !== sourceKey) {
        return
      }

      if (currentSourceKeyRef.current !== sourceKey || player.src !== resolvedSrc) {
        player.pause()
        player.src = resolvedSrc
        currentSourceKeyRef.current = sourceKey
        endedListenerSourceKeyRef.current = ''
        setState((prev) => ({
          ...prev,
          currentItem: item,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          playerExists: true,
        }))
      }

      player.preload = 'auto'
      prepareInlineMediaElement(player, { preload: 'auto' })
      player.muted = false
      player.volume = 1
      if (player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        player.load()
      }
      primeTakePlaybackForPreparedSession(player)
      const duration = playableDuration(player)
      if (duration !== null && currentSourceKeyRef.current === sourceKey) {
        setState((prev) => ({ ...prev, duration }))
      }
    })().catch((error) => {
      if (currentSourceKeyRef.current !== sourceKey) return
      logPlayback('Playback prime not ready', {
        takeId: item.takeId ?? item.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }).finally(() => {
      if (primingSourceKeyRef.current === sourceKey) {
        primeInFlightRef.current = null
      }
    })
  }, [])

  const play = useCallback(
    (
      item: AudioModePlaybackItem,
      options: {
        startTime?: number
        onStarted?: (duration: number) => void
        onFailed?: () => void
        onEnded?: () => void
      } = {},
    ) => {
      logPlayback('Requested playback', {
        takeId: item.takeId ?? item.id,
        requestedStartTime: options.startTime,
        position: options.startTime ?? 0,
        playerExists: Boolean(playerRef.current),
        sessionPrepared: sessionPreparedRef.current,
        path: usesNativeHandsFreePlayback(item) ? 'native-avplayer' : 'webkit',
      })
      const requestId = ++playbackRequestIdRef.current

      if (usesNativeHandsFreePlayback(item)) {
        const startTime =
          typeof options.startTime === 'number' && Number.isFinite(options.startTime)
            ? Math.max(0, options.startTime)
            : 0
        nativePlaybackStartingRef.current = true
        desiredPlayingRef.current = true
        externalNativePlaybackEndedRef.current = options.onEnded ?? null
        clearResumeTimer()
        onPlaybackActiveChangeRef.current?.(true)
        currentSourceKeyRef.current = sourceKeyFor(item)
        setState((prev) => ({
          ...prev,
          currentItem: item,
          playerExists: false,
        }))

        void (async () => {
          try {
            if (nativePlaybackActiveRef.current) {
              await stopAudioModeNativePlayback()
              nativePlaybackActiveRef.current = false
              stopProgressLoop()
            }
            await onBeforePlayRef.current?.()
            if (!desiredPlayingRef.current) {
              nativePlaybackStartingRef.current = false
              return
            }
            const result = await startAudioModeNativePlayback({
              filePath: item.filePath,
              startTime,
              gainDb: item.playbackGainDb,
            })
            if (!result || !desiredPlayingRef.current) {
              if (result) await stopAudioModeNativePlayback()
              throw new Error('Native audio mode playback did not start')
            }
            nativePlaybackActiveRef.current = true
            nativePlaybackStartingRef.current = false
            nativeDurationRef.current = result.duration
            nativePlaybackOffsetRef.current = startTime
            nativePlaybackStartMsRef.current = performance.now()
            updateSessionPrepared(true)
            logPlayback('Starting playback', {
              takeId: item.takeId ?? item.id,
              position: startTime,
              duration: result.duration,
              playerExists: false,
              sessionPrepared: true,
              path: 'native-avplayer',
            })
            setState((prev) => ({
              ...prev,
              currentItem: item,
              isPlaying: true,
              currentTime: startTime,
              duration: result.duration,
              playerExists: false,
            }))
            startProgressLoop()
            options.onStarted?.(result.duration)
          } catch (error) {
            nativePlaybackActiveRef.current = false
            nativePlaybackStartingRef.current = false
            externalNativePlaybackEndedRef.current = null
            onPlaybackActiveChangeRef.current?.(false)
            desiredPlayingRef.current = false
            logPlayback('Playback intercepted', {
              takeId: item.takeId ?? item.id,
              error: error instanceof Error ? error.message : String(error),
              playerExists: false,
              sessionPrepared: sessionPreparedRef.current,
              path: 'native-avplayer',
            })
            setState((prev) => ({ ...prev, isPlaying: false }))
            options.onFailed?.()
          }
        })()
        return
      }

      const sourceKey = sourceKeyFor(item)
      const isCurrentRequest = () =>
        playbackRequestIdRef.current === requestId &&
        desiredPlayingRef.current &&
        currentSourceKeyRef.current === sourceKey

      const player = ensurePlayerSource(item)
      if (!player) return

      if (typeof options.startTime === 'number' && Number.isFinite(options.startTime)) {
        pendingStartTimeRef.current = options.startTime
        try {
          player.currentTime = Math.max(0, options.startTime)
        } catch {
          /* metadata may not be ready yet */
        }
      }

      prepareInlineMediaElement(player, { preload: 'auto' })
      player.muted = false
      player.volume = 1
      desiredPlayingRef.current = true
      clearResumeTimer()
      onPlaybackActiveChangeRef.current?.(true)

      void (async () => {
        const sessionId = createPlaybackDiagSession('audio-mode-playback')
        setActivePlaybackDiagSession(sessionId)
        pipelineDetachRef.current?.()
        pipelineDetachRef.current = attachPlaybackPipelineInstrumentation(player, {
          sessionId,
          takeId: item.takeId ?? item.id,
          path: 'audio-mode-context',
        })
        try {
          await logAudioSessionSnapshot('audio-mode-before-session-prep', sessionId)
          await prepareSessionOnce(item)
          if (!isCurrentRequest()) return
          await logAudioSessionSnapshot('audio-mode-before-prime', sessionId)
          const resolvedSrc = await resolveItemSrcForPlayback(item)
          if (!resolvedSrc) {
            throw new Error('Audio mode playback source is empty')
          }
          if (!isCurrentRequest()) return
          if (resolvedSrc && player.src !== resolvedSrc) {
            player.pause()
            player.src = resolvedSrc
            player.preload = 'auto'
            prepareInlineMediaElement(player, { preload: 'auto' })
            player.muted = false
            player.volume = 1
            logPlayback('[Diag] src assigned, calling load()', {
              takeId: item.takeId ?? item.id,
              resolvedSrc,
              readyState: player.readyState,
              networkState: player.networkState,
              playerSrc: player.src,
            })
            player.load()
            onPlaybackActiveChangeRef.current?.(true)
          } else {
            logPlayback('[Diag] src unchanged, skipping load()', {
              takeId: item.takeId ?? item.id,
              resolvedSrc,
              readyState: player.readyState,
              networkState: player.networkState,
              playerSrc: player.src,
            })
          }
          const duration = await waitForAudioModePlaybackReady(player)
          logPlayback('[Diag] waitForReady resolved', {
            takeId: item.takeId ?? item.id,
            readyState: player.readyState,
            networkState: player.networkState,
            src: player.src,
            duration: player.duration,
            paused: player.paused,
            mediaErrorCode: player.error?.code ?? null,
            mediaErrorMessage: player.error?.message ?? null,
          })
          if (!isCurrentRequest()) return
          setState((prev) => ({ ...prev, duration }))
          if (pendingStartTimeRef.current !== null) {
            try {
              player.currentTime = Math.max(0, Math.min(pendingStartTimeRef.current, duration))
            } catch {
              /* ignore */
            }
            pendingStartTimeRef.current = null
          }
          logPlayback('[Diag] calling playTakeMediaAudible', {
            takeId: item.takeId ?? item.id,
            src: player.src,
            readyState: player.readyState,
            networkState: player.networkState,
            currentTime: player.currentTime,
            duration: player.duration,
            paused: player.paused,
            muted: player.muted,
            volume: player.volume,
            mediaErrorCode: player.error?.code ?? null,
            mediaErrorMessage: player.error?.message ?? null,
          })
          const started = await playTakeMediaAudible(player, { skipRoutePrep: true })
          if (!started || !isCurrentRequest()) {
            throw new Error('Audio mode playback did not start')
          }
          await logAudioSessionSnapshot('audio-mode-after-play', sessionId, {
            duration: player.duration,
            paused: player.paused,
          })
          endedListenerSourceKeyRef.current = currentSourceKeyRef.current
          logPlayback('Starting playback', {
            takeId: item.takeId ?? item.id,
            position: player.currentTime,
            duration: player.duration,
            playerExists: true,
            sessionPrepared: sessionPreparedRef.current,
          })
          setState((prev) => ({
            ...prev,
            isPlaying: true,
            playerExists: true,
          }))
        } catch (error) {
          if (!isCurrentRequest()) return
          pipelineDetachRef.current?.()
          pipelineDetachRef.current = null
          setActivePlaybackDiagSession(null)
          onPlaybackActiveChangeRef.current?.(false)
          desiredPlayingRef.current = false
          logPlayback('Playback intercepted', {
            takeId: item.takeId ?? item.id,
            error: error instanceof Error ? error.message : String(error),
            playerExists: true,
            sessionPrepared: sessionPreparedRef.current,
          })
          setState((prev) => ({ ...prev, isPlaying: false }))
          options.onFailed?.()
        }
      })()
    },
    [clearResumeTimer, ensurePlayerSource, prepareSessionOnce, startProgressLoop, updateSessionPrepared]
  )

  const schedulePlaybackRecovery = useCallback(
    (reason: string) => {
      if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
      const player = playerRef.current
      if (!player || !desiredPlayingRef.current || player.ended) return
      if (resumeTimerRef.current !== null || resumeInFlightRef.current) return

      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null
        if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
        const currentPlayer = playerRef.current
        if (!currentPlayer || !desiredPlayingRef.current || currentPlayer.ended) return
        if (!currentPlayer.paused && currentPlayer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          return
        }

        resumeInFlightRef.current = true
        logPlayback('Recovering playback', {
          reason,
          takeId: state.currentItem?.takeId ?? state.currentItem?.id,
          position: currentPlayer.currentTime,
          readyState: currentPlayer.readyState,
          networkState: currentPlayer.networkState,
        })
        void (async () => {
          try {
            if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
            // Tier 1: a transient stalled/waiting/suspend blip often resolves
            // with a plain play() — no route/graph rebuild needed. Only
            // escalate to the full rebuild (tier 2) if this doesn't actually
            // get the element progressing again; the full rebuild reconnects
            // the Web Audio route/graph (routeTakePlaybackToSpeaker), which is
            // audible as a brief glitch and was firing even for blips that
            // would have recovered on their own.
            let started = false
            try {
              await currentPlayer.play()
              started = !currentPlayer.paused
            } catch {
              started = false
            }
            if (!started) {
              started = await playTakeMediaAudible(currentPlayer, { skipRoutePrep: true })
            }
            if (started && desiredPlayingRef.current) {
              onPlaybackActiveChangeRef.current?.(true)
              startProgressLoop()
              return
            }
            desiredPlayingRef.current = false
            onPlaybackActiveChangeRef.current?.(false)
            setState((prev) => ({
              ...prev,
              isPlaying: false,
              currentTime: currentPlayer.currentTime,
            }))
          } finally {
            resumeInFlightRef.current = false
          }
        })()
      }, 180)
    },
    [startProgressLoop, state.currentItem],
  )

  const pause = useCallback(() => {
    playbackRequestIdRef.current += 1
    if (nativePlaybackActiveRef.current) {
      const elapsedSeconds = (performance.now() - nativePlaybackStartMsRef.current) / 1000
      const duration = nativeDurationRef.current
      nativePlaybackOffsetRef.current = Math.min(
        nativePlaybackOffsetRef.current + elapsedSeconds,
        duration > 0 ? duration : nativePlaybackOffsetRef.current + elapsedSeconds,
      )
      desiredPlayingRef.current = false
      nativePlaybackStartingRef.current = false
      externalNativePlaybackEndedRef.current = null
      clearResumeTimer()
      void (async () => {
        await stopAudioModeNativePlayback()
        nativePlaybackActiveRef.current = false
        onPlaybackActiveChangeRef.current?.(false)
        updateSessionPrepared(false)
        stopProgressLoop()
        logPlayback('Paused', {
          takeId: state.currentItem?.takeId ?? state.currentItem?.id,
          position: nativePlaybackOffsetRef.current,
          playerExists: false,
          sessionPrepared: false,
          path: 'native-avplayer',
        })
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          currentTime: nativePlaybackOffsetRef.current,
        }))
      })()
      return
    }

    const player = playerRef.current
    if (!player) return
    desiredPlayingRef.current = false
    clearResumeTimer()
    player.pause()
    onPlaybackActiveChangeRef.current?.(false)
    logPlayback('Paused', {
      takeId: state.currentItem?.takeId ?? state.currentItem?.id,
      position: player.currentTime,
      playerExists: true,
      sessionPrepared: sessionPreparedRef.current,
    })
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: player.currentTime,
    }))
  }, [clearResumeTimer, state.currentItem, stopProgressLoop, updateSessionPrepared])

  const toggle = useCallback(
    (item: AudioModePlaybackItem) => {
      const sameSource = currentSourceKeyRef.current === sourceKeyFor(item)
      if (usesNativeHandsFreePlayback(item)) {
        if (sameSource && nativePlaybackActiveRef.current) {
          pause()
          return
        }
        play(item)
        return
      }
      const player = playerRef.current
      if (sameSource && player && !player.paused && !player.ended) {
        pause()
        return
      }
      if (sameSource && desiredPlayingRef.current) {
        pause()
        return
      }
      play(item)
    },
    [pause, play]
  )

  const seek = useCallback(
    (time: number) => {
      if (nativePlaybackActiveRef.current && state.currentItem) {
        const duration = nativeDurationRef.current
        const nextTime = Math.max(0, Math.min(time, duration > 0 ? duration : time))
        const wasPlaying = desiredPlayingRef.current
        nativePlaybackOffsetRef.current = nextTime
        setState((prev) => ({ ...prev, currentTime: nextTime }))
        logPlayback('Seeked', {
          takeId: state.currentItem?.takeId ?? state.currentItem?.id,
          position: nextTime,
          playerExists: false,
          sessionPrepared: sessionPreparedRef.current,
          path: 'native-avplayer',
        })
        if (!wasPlaying) return
        void (async () => {
          await stopAudioModeNativePlayback()
          nativePlaybackActiveRef.current = false
          stopProgressLoop()
          play(state.currentItem!, { startTime: nextTime })
        })()
        return
      }

      const player = playerRef.current
      if (!player) return
      const nextTime = Math.max(
        0,
        Math.min(time, Number.isFinite(player.duration) ? player.duration : time)
      )
      player.currentTime = nextTime
      setState((prev) => ({ ...prev, currentTime: nextTime }))
      logPlayback('Seeked', {
        takeId: state.currentItem?.takeId ?? state.currentItem?.id,
        position: nextTime,
        playerExists: true,
        sessionPrepared: sessionPreparedRef.current,
      })
    },
    [play, state.currentItem, stopProgressLoop]
  )

  const openFullscreen = useCallback(
    (item: AudioModePlaybackItem) => {
      select(item)
      const player = playerRef.current
      logPlayback('Opening fullscreen', {
        takeId: item.takeId ?? item.id,
        position: player?.currentTime ?? 0,
        isPlaying: player ? !player.paused && !player.ended : false,
        playerExists: Boolean(player),
        sessionPrepared: sessionPreparedRef.current,
      })
    },
    [select]
  )

  const closeFullscreen = useCallback(() => {
    const player = playerRef.current
    logPlayback('Closing fullscreen', {
      takeId: state.currentItem?.takeId ?? state.currentItem?.id,
      position: player?.currentTime ?? state.currentTime,
      isPlaying: player ? !player.paused && !player.ended : state.isPlaying,
      playerExists: Boolean(player),
      sessionPrepared: sessionPreparedRef.current,
    })
  }, [state.currentItem, state.currentTime, state.isPlaying])

  const matchesCurrentSource = useCallback(
    (item: Pick<AudioModePlaybackItem, 'filePath' | 'mediaUrl'>) =>
      currentSourceKeyRef.current === sourceKeyFor(item),
    []
  )

  useEffect(() => {
    setAudioModeNativePlaybackEndedHandler(() => {
      if (!nativePlaybackActiveRef.current) return
      nativePlaybackActiveRef.current = false
      nativePlaybackStartingRef.current = false
      const onEnded = externalNativePlaybackEndedRef.current
      externalNativePlaybackEndedRef.current = null
      void (async () => {
        await releaseAudioModeNativePlaybackRoute()
        finishNativePlayback()
        onEnded?.()
      })()
    })
    return () => {
      setAudioModeNativePlaybackEndedHandler(null)
      if (nativePlaybackActiveRef.current) {
        void stopAudioModeNativePlayback()
      }
      void teardownAudioModeNativePlaybackListener()
    }
  }, [finishNativePlayback])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    setState((prev) => ({ ...prev, playerExists: true }))

    const syncDuration = () => {
      const duration = Number.isFinite(player.duration) ? player.duration : 0
      setState((prev) => ({ ...prev, duration }))
    }
    const syncTime = () => {
      setState((prev) => ({ ...prev, currentTime: player.currentTime }))
    }
    const onPlay = () => {
      if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
      desiredPlayingRef.current = true
      clearResumeTimer()
      onPlaybackActiveChangeRef.current?.(true)
      setState((prev) => ({ ...prev, isPlaying: true }))
      startProgressLoop()
    }
    const onPause = () => {
      if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
      stopProgressLoop()
      if (desiredPlayingRef.current && !player.ended) {
        schedulePlaybackRecovery('unexpected-pause')
        return
      }
      onPlaybackActiveChangeRef.current?.(false)
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: player.currentTime,
      }))
    }
    const onEnded = () => {
      if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
      desiredPlayingRef.current = false
      clearResumeTimer()
      onPlaybackActiveChangeRef.current?.(false)
      stopProgressLoop()
      updateSessionPrepared(false)
      void releaseTakePlaybackAudio()
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: Number.isFinite(player.duration) ? player.duration : player.currentTime,
      }))
      logPlayback('Stopped', {
        takeId: state.currentItem?.takeId ?? state.currentItem?.id,
        position: player.currentTime,
        playerExists: true,
        sessionPrepared: false,
      })
    }
    const onPlaybackInterrupted = () => {
      if (nativePlaybackActiveRef.current || nativePlaybackStartingRef.current) return
      if (!desiredPlayingRef.current || player.ended) return
      schedulePlaybackRecovery('stalled-or-waiting')
    }

    player.addEventListener('loadedmetadata', syncDuration)
    player.addEventListener('durationchange', syncDuration)
    player.addEventListener('timeupdate', syncTime)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    player.addEventListener('stalled', onPlaybackInterrupted)
    player.addEventListener('waiting', onPlaybackInterrupted)
    player.addEventListener('suspend', onPlaybackInterrupted)
    return () => {
      player.removeEventListener('loadedmetadata', syncDuration)
      player.removeEventListener('durationchange', syncDuration)
      player.removeEventListener('timeupdate', syncTime)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
      player.removeEventListener('stalled', onPlaybackInterrupted)
      player.removeEventListener('waiting', onPlaybackInterrupted)
      player.removeEventListener('suspend', onPlaybackInterrupted)
    }
  }, [
    clearResumeTimer,
    schedulePlaybackRecovery,
    startProgressLoop,
    state.currentItem,
    stopProgressLoop,
    updateSessionPrepared,
  ])

  useLayoutEffect(() => {
    audioModePlaybackControlsRef.pause = pause
    audioModePlaybackControlsRef.play = play
    return () => {
      audioModePlaybackControlsRef.pause = null
      audioModePlaybackControlsRef.play = null
    }
  }, [pause, play])

  useEffect(() => {
    return () => {
      stopProgressLoop()
      desiredPlayingRef.current = false
      clearResumeTimer()
      onPlaybackActiveChangeRef.current?.(false)
      updateSessionPrepared(false)
      void completePlaybackRouteRestore()
    }
  }, [stopProgressLoop, updateSessionPrepared])

  const value = useMemo<AudioModePlaybackContextValue>(
    () => ({
      playerRef,
      state,
      select,
      prime,
      play,
      toggle,
      pause,
      seek,
      openFullscreen,
      closeFullscreen,
      matchesCurrentSource,
    }),
    [
      closeFullscreen,
      matchesCurrentSource,
      pause,
      play,
      prime,
      seek,
      select,
      state,
      toggle,
      openFullscreen,
    ]
  )

  return (
    <AudioModePlaybackContext.Provider value={value}>
      {children}
      <audio ref={playerRef} className="sr-only" preload="auto" playsInline />
    </AudioModePlaybackContext.Provider>
  )
}

export function useAudioModePlayback(): AudioModePlaybackContextValue {
  const value = useContext(AudioModePlaybackContext)
  if (!value) {
    throw new Error('useAudioModePlayback must be used within AudioModePlaybackProvider')
  }
  return value
}
