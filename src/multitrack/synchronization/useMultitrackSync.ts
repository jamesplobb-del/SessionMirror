import { useCallback, useEffect, useRef, useState } from 'react'
import {
  playTakeMediaAudible,
  primeTakePlaybackForUserGesture,
} from '../../utils/takePlaybackAudio'
import { waitForMediaReady } from '../../utils/mediaPlayback'
import { preparePlaybackRoute } from '../../utils/playbackRouteCoordinator'
import { resumePlaybackAudioContext } from '../../utils/playbackAudioContext'
import { routeTakePlaybackToSpeaker } from '../../utils/takePlaybackSpeaker'

function pickSyncMaster(elements: HTMLMediaElement[]): HTMLMediaElement | null {
  if (elements.length === 0) return null
  return elements.reduce<HTMLMediaElement | null>((longest, element) => {
    const duration = Number.isFinite(element.duration) ? element.duration : 0
    const longestDuration =
      longest && Number.isFinite(longest.duration) ? longest.duration : 0
    return duration > longestDuration ? element : longest
  }, null)
}

function primeElementForPlayback(element: HTMLMediaElement): void {
  element.preload = 'auto'
  element.setAttribute('playsinline', 'true')
  routeTakePlaybackToSpeaker(element, 1, false)
}

export function useMultitrackSync() {
  const mediaMapRef = useRef<Map<string, HTMLMediaElement>>(new Map())
  const excludePanelIdRef = useRef<string | null>(null)
  /** Mixer state (per-panel playback balance). */
  const panelVolumeRef = useRef<Map<string, number>>(new Map())
  const panelMutedRef = useRef<Set<string>>(new Set())
  /** Per-take monitor mutes ("You'll hear" chips) — cleared after each recording. */
  const monitorMutedRef = useRef<Set<string>>(new Set())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number | null>(null)

  const applyMixState = useCallback((panelId: string, element: HTMLMediaElement) => {
    element.volume = panelVolumeRef.current.get(panelId) ?? 1
    element.muted =
      panelMutedRef.current.has(panelId) || monitorMutedRef.current.has(panelId)
  }, [])

  /** Playback helpers (playTakeMediaAudible) force unmute at start — reassert the mix after. */
  const applyMixStateToAll = useCallback(() => {
    for (const [panelId, element] of mediaMapRef.current.entries()) {
      applyMixState(panelId, element)
    }
  }, [applyMixState])

  const setPanelVolume = useCallback((panelId: string, volume: number) => {
    panelVolumeRef.current.set(panelId, Math.max(0, Math.min(1, volume)))
    const element = mediaMapRef.current.get(panelId)
    if (element) applyMixState(panelId, element)
  }, [applyMixState])

  const setPanelMuted = useCallback((panelId: string, muted: boolean) => {
    if (muted) panelMutedRef.current.add(panelId)
    else panelMutedRef.current.delete(panelId)
    const element = mediaMapRef.current.get(panelId)
    if (element) applyMixState(panelId, element)
  }, [applyMixState])

  const setMonitorMutedPanelIds = useCallback((panelIds: string[]) => {
    monitorMutedRef.current = new Set(panelIds)
    applyMixStateToAll()
  }, [applyMixStateToAll])

  const getElements = useCallback((excludePanelId: string | null = excludePanelIdRef.current) => {
    const entries = [...mediaMapRef.current.entries()]
    return entries
      .filter(([panelId]) => panelId !== excludePanelId)
      .map(([, element]) => element)
  }, [])

  const getMaster = useCallback(
    () => pickSyncMaster(getElements()),
    [getElements],
  )

  const refreshDuration = useCallback(() => {
    const durations = getElements(null)
      .map((el) => el.duration)
      .filter((v) => Number.isFinite(v) && v > 0)
    setDuration(durations.length > 0 ? Math.max(...durations) : 0)
  }, [getElements])

  const setExcludePanelId = useCallback((panelId: string | null) => {
    excludePanelIdRef.current = panelId
  }, [])

  const registerMedia = useCallback((panelId: string, element: HTMLMediaElement | null) => {
    if (element) {
      mediaMapRef.current.set(panelId, element)
      applyMixState(panelId, element)
      element.addEventListener('loadedmetadata', refreshDuration)
      element.addEventListener('durationchange', refreshDuration)
    } else {
      mediaMapRef.current.get(panelId)?.removeEventListener('loadedmetadata', refreshDuration)
      mediaMapRef.current.get(panelId)?.removeEventListener('durationchange', refreshDuration)
      mediaMapRef.current.delete(panelId)
    }
    refreshDuration()
  }, [refreshDuration])

  const syncAllTo = useCallback((time: number, excludePanelId: string | null = excludePanelIdRef.current) => {
    for (const [panelId, el] of mediaMapRef.current.entries()) {
      if (panelId === excludePanelId) continue
      try {
        if (Math.abs(el.currentTime - time) > 0.05) el.currentTime = time
      } catch {
        /* Some media elements reject seeks until metadata is ready. */
      }
    }
    setCurrentTime(time)
  }, [])

  const playElements = useCallback(async (elements: HTMLMediaElement[], startTime: number) => {
    if (elements.length === 0) return false

    for (const el of elements) {
      primeElementForPlayback(el)
      if (el.readyState < HTMLMediaElement.HAVE_METADATA && (el.src || el.currentSrc)) {
        try {
          el.load()
        } catch {
          /* ignore */
        }
      }
      try {
        el.currentTime = startTime
      } catch {
        /* ignore */
      }
    }

    setCurrentTime(startTime)

    try {
      await preparePlaybackRoute({ suspendCamera: false })
    } catch {
      return false
    }

    primeTakePlaybackForUserGesture(...elements)
    await resumePlaybackAudioContext()
    await Promise.allSettled(elements.map((el) => waitForMediaReady(el, 900)))

    const starts = await Promise.all(
      elements.map((el) => playTakeMediaAudible(el, { skipRoutePrep: true })),
    )
    applyMixStateToAll()
    const playing = starts.some(Boolean)
    setIsPlaying(playing)
    return playing
  }, [applyMixStateToAll])

  const prepareAtStart = useCallback(async (startTime = 0) => {
    const elements = getElements()
    if (elements.length === 0) return false

    for (const el of elements) {
      primeElementForPlayback(el)
      if (el.readyState < HTMLMediaElement.HAVE_METADATA && (el.src || el.currentSrc)) {
        try {
          el.load()
        } catch {
          /* ignore */
        }
      }
      try {
        el.currentTime = startTime
      } catch {
        /* ignore */
      }
      el.pause()
    }

    setCurrentTime(startTime)

    try {
      await preparePlaybackRoute({ suspendCamera: false })
    } catch {
      return false
    }

    primeTakePlaybackForUserGesture(...elements)
    await resumePlaybackAudioContext()
    await Promise.allSettled(elements.map((el) => waitForMediaReady(el, 2000)))
    return true
  }, [getElements])

  const startPrepared = useCallback(async () => {
    const elements = getElements()
    if (elements.length === 0) {
      setIsPlaying(false)
      return false
    }

    const starts = await Promise.all(
      elements.map((el) => playTakeMediaAudible(el, { skipRoutePrep: true })),
    )
    applyMixStateToAll()
    const playing = starts.some(Boolean)
    setIsPlaying(playing)
    return playing
  }, [applyMixStateToAll, getElements])

  const play = useCallback(async () => {
    const master = getMaster()
    const elements = getElements()
    const startTime = master?.currentTime ?? currentTime
    return playElements(elements, startTime)
  }, [currentTime, getElements, getMaster, playElements])

  const playAllFromUserGesture = useCallback(() => {
    const elements = getElements()
    syncAllTo(0)
    void playElements(elements, 0)
  }, [getElements, playElements, syncAllTo])

  const pause = useCallback(() => {
    for (const el of mediaMapRef.current.values()) el.pause()
    setIsPlaying(false)
  }, [])

  const restart = useCallback(async () => {
    syncAllTo(0)
    await playElements(getElements(), 0)
  }, [getElements, playElements, syncAllTo])

  const seek = useCallback((time: number) => syncAllTo(time), [syncAllTo])

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = () => {
      const master = getMaster()
      if (master) {
        setCurrentTime(master.currentTime)
        const elements = getElements()
        if (elements.length > 0 && elements.every((el) => el.paused || el.ended)) {
          setIsPlaying(false)
          return
        }
        for (const el of elements) {
          try {
            if (
              el !== master &&
              !el.paused &&
              !el.ended &&
              Math.abs(el.currentTime - master.currentTime) > 0.18
            ) {
              el.currentTime = master.currentTime
            }
          } catch {
            /* ignore */
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [getElements, getMaster, isPlaying])

  return {
    registerMedia,
    setExcludePanelId,
    setPanelVolume,
    setPanelMuted,
    setMonitorMutedPanelIds,
    prepareAtStart,
    startPrepared,
    playAllFromUserGesture,
    play,
    pause,
    restart,
    seek,
    state: { isPlaying, currentTime, duration },
  }
}
