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

function primeElementForAudiblePlayback(element: HTMLMediaElement): void {
  element.muted = false
  element.volume = 1
  element.preload = 'auto'
  element.setAttribute('playsinline', 'true')
  routeTakePlaybackToSpeaker(element, 1, false)
}

export function useMultitrackSync() {
  const mediaMapRef = useRef<Map<string, HTMLMediaElement>>(new Map())
  const preparedRef = useRef(false)
  const excludePanelIdRef = useRef<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number | null>(null)

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
      primeElementForAudiblePlayback(element)
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

  const prepareFromStart = useCallback(async (startTime = 0) => {
    const elements = getElements()
    if (elements.length === 0) {
      preparedRef.current = false
      return false
    }

    for (const el of elements) {
      primeElementForAudiblePlayback(el)
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
      preparedRef.current = false
      return false
    }

    primeTakePlaybackForUserGesture(...elements)
    await resumePlaybackAudioContext()
    await Promise.allSettled(elements.map((el) => waitForMediaReady(el, 2000)))
    preparedRef.current = true
    return true
  }, [getElements])

  const startPrepared = useCallback(async () => {
    let elements = getElements()
    if (elements.length === 0) {
      setIsPlaying(false)
      return false
    }

    if (!preparedRef.current) {
      const prepared = await prepareFromStart(0)
      if (!prepared) {
        setIsPlaying(false)
        return false
      }
      elements = getElements()
    }

    preparedRef.current = false
    const starts = await Promise.all(
      elements.map((el) => playTakeMediaAudible(el, { skipRoutePrep: true })),
    )
    const playing = starts.some(Boolean)
    setIsPlaying(playing)
    return playing
  }, [getElements, prepareFromStart])

  const playAllFromUserGesture = useCallback(() => {
    const elements = getElements()
    if (elements.length === 0) {
      setIsPlaying(false)
      return
    }

    preparedRef.current = false
    syncAllTo(0)

    void (async () => {
      for (const el of elements) {
        primeElementForAudiblePlayback(el)
      }

      try {
        await preparePlaybackRoute({ suspendCamera: false })
      } catch {
        setIsPlaying(false)
        return
      }

      primeTakePlaybackForUserGesture(...elements)
      await resumePlaybackAudioContext()
      await Promise.allSettled(elements.map((el) => waitForMediaReady(el, 900)))

      const starts = await Promise.all(
        elements.map((el) => playTakeMediaAudible(el, { skipRoutePrep: true })),
      )
      setIsPlaying(starts.some(Boolean))
    })()
  }, [getElements, syncAllTo])

  const play = useCallback(async () => {
    preparedRef.current = false
    await prepareFromStart(currentTime)
    await startPrepared()
  }, [currentTime, prepareFromStart, startPrepared])

  const pause = useCallback(() => {
    for (const el of mediaMapRef.current.values()) el.pause()
    preparedRef.current = false
    setIsPlaying(false)
  }, [])

  const restart = useCallback(async () => {
    preparedRef.current = false
    syncAllTo(0)
    await prepareFromStart(0)
    await startPrepared()
  }, [prepareFromStart, startPrepared, syncAllTo])

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
        const anyPlaying = elements.some((el) => !el.paused && !el.ended)
        if (!anyPlaying) {
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
    prepareFromStart,
    startPrepared,
    playAllFromUserGesture,
    play,
    pause,
    restart,
    seek,
    state: { isPlaying, currentTime, duration },
  }
}
