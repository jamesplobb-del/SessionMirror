import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { prepareInlineMediaElement, resolveMediaPlaybackSrc } from '../utils/mediaPlayback'
import {
  completePlaybackRouteRestore,
  isPlaybackRouteHoldActive,
  preparePlaybackRoute,
} from '../utils/playbackRouteCoordinator'
import {
  playTakeMediaAudible,
  releaseTakePlaybackAudio,
} from '../utils/takePlaybackAudio'
import { readCachedPlaybackSrc, resolveTakePlaybackUrl } from '../utils/takeStorage'
import {
  attachPlaybackPipelineInstrumentation,
  createPlaybackDiagSession,
  logAudioSessionSnapshot,
  setActivePlaybackDiagSession,
} from '../utils/audioPlaybackDiagnostics'

export interface AudioModePlaybackItem {
  id: string
  name: string
  filePath: string
  mediaUrl: string
  mimeType: string
  takeId?: string
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
  play: (item: AudioModePlaybackItem, options?: { startTime?: number }) => void
  toggle: (item: AudioModePlaybackItem) => void
  pause: () => void
  seek: (time: number) => void
  openFullscreen: (item: AudioModePlaybackItem) => void
  closeFullscreen: () => void
  matchesCurrentSource: (item: Pick<AudioModePlaybackItem, 'filePath' | 'mediaUrl'>) => boolean
}

const AudioModePlaybackContext = createContext<AudioModePlaybackContextValue | null>(null)

/** App-level hook for pausing inline audio-mode take playback (vault, settings, review). */
export const audioModePlaybackControlsRef: { pause: (() => void) | null } = { pause: null }

interface AudioModePlaybackProviderProps {
  children: ReactNode
  onBeforePlay?: () => void | Promise<void>
  onPlaybackActiveChange?: (active: boolean) => void
}

function logPlayback(message: string, details: Record<string, unknown> = {}): void {
  console.info('[Playback]', message, details)
}

function sourceKeyFor(item: Pick<AudioModePlaybackItem, 'filePath' | 'mediaUrl'>): string {
  return `${item.filePath || ''}::${item.mediaUrl || ''}`
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

  const startProgressLoop = useCallback(() => {
    stopProgressLoop()

    const tick = () => {
      const player = playerRef.current
      if (!player || player.paused || player.ended) {
        progressRafRef.current = null
        return
      }

      setState((prev) => ({
        ...prev,
        currentTime: player.currentTime,
        duration: Number.isFinite(player.duration) ? player.duration : prev.duration,
      }))
      progressRafRef.current = requestAnimationFrame(tick)
    }

    progressRafRef.current = requestAnimationFrame(tick)
  }, [stopProgressLoop])

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
    player.preload = 'metadata'
    prepareInlineMediaElement(player, { preload: 'metadata' })
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

  const play = useCallback(
    (item: AudioModePlaybackItem, options: { startTime?: number } = {}) => {
      const player = ensurePlayerSource(item)
      logPlayback('Requested playback', {
        takeId: item.takeId ?? item.id,
        requestedStartTime: options.startTime,
        position: player?.currentTime ?? 0,
        playerExists: Boolean(player),
        sessionPrepared: sessionPreparedRef.current,
      })
      if (!player) return

      if (typeof options.startTime === 'number' && Number.isFinite(options.startTime)) {
        pendingStartTimeRef.current = options.startTime
        try {
          player.currentTime = Math.max(0, options.startTime)
        } catch {
          /* metadata may not be ready yet */
        }
      }

      prepareInlineMediaElement(player, { preload: 'metadata' })
      player.muted = false
      player.volume = 1
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
          await onBeforePlayRef.current?.()
          await logAudioSessionSnapshot('audio-mode-before-session-prep', sessionId)
          await prepareSessionOnce(item)
          await logAudioSessionSnapshot('audio-mode-before-prime', sessionId)
          const resolvedSrc = await resolveItemSrcForPlayback(item)
          if (!resolvedSrc) {
            throw new Error('Audio mode playback source is empty')
          }
          if (currentSourceKeyRef.current !== sourceKeyFor(item)) {
            pipelineDetachRef.current?.()
            pipelineDetachRef.current = null
            setActivePlaybackDiagSession(null)
            return
          }
          if (resolvedSrc && player.src !== resolvedSrc) {
            player.pause()
            player.src = resolvedSrc
            player.preload = 'metadata'
            prepareInlineMediaElement(player, { preload: 'metadata' })
            player.muted = false
            player.volume = 1
            player.load()
            onPlaybackActiveChangeRef.current?.(true)
          }
          if (pendingStartTimeRef.current !== null) {
            try {
              player.currentTime = Math.max(0, pendingStartTimeRef.current)
            } catch {
              /* ignore */
            }
            pendingStartTimeRef.current = null
          }
          const started = await playTakeMediaAudible(player, { skipRoutePrep: true })
          if (!started) {
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
          pipelineDetachRef.current?.()
          pipelineDetachRef.current = null
          setActivePlaybackDiagSession(null)
          onPlaybackActiveChangeRef.current?.(false)
          logPlayback('Playback intercepted', {
            takeId: item.takeId ?? item.id,
            error: error instanceof Error ? error.message : String(error),
            playerExists: true,
            sessionPrepared: sessionPreparedRef.current,
          })
          setState((prev) => ({ ...prev, isPlaying: false }))
        }
      })()
    },
    [ensurePlayerSource, prepareSessionOnce]
  )

  const pause = useCallback(() => {
    const player = playerRef.current
    if (!player) return
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
  }, [state.currentItem])

  const toggle = useCallback(
    (item: AudioModePlaybackItem) => {
      const sameSource = currentSourceKeyRef.current === sourceKeyFor(item)
      const player = playerRef.current
      if (sameSource && player && !player.paused && !player.ended) {
        pause()
        return
      }
      play(item)
    },
    [pause, play]
  )

  const seek = useCallback(
    (time: number) => {
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
    [state.currentItem]
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
      onPlaybackActiveChangeRef.current?.(true)
      setState((prev) => ({ ...prev, isPlaying: true }))
      startProgressLoop()
    }
    const onPause = () => {
      onPlaybackActiveChangeRef.current?.(false)
      stopProgressLoop()
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: player.currentTime,
      }))
    }
    const onEnded = () => {
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

    player.addEventListener('loadedmetadata', syncDuration)
    player.addEventListener('durationchange', syncDuration)
    player.addEventListener('timeupdate', syncTime)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    return () => {
      player.removeEventListener('loadedmetadata', syncDuration)
      player.removeEventListener('durationchange', syncDuration)
      player.removeEventListener('timeupdate', syncTime)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
    }
  }, [startProgressLoop, state.currentItem, stopProgressLoop, updateSessionPrepared])

  useEffect(() => {
    audioModePlaybackControlsRef.pause = pause
    return () => {
      audioModePlaybackControlsRef.pause = null
    }
  }, [pause])

  useEffect(() => {
    return () => {
      stopProgressLoop()
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
      <audio ref={playerRef} className="sr-only" preload="metadata" playsInline />
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
