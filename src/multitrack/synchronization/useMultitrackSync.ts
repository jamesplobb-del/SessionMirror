import { useCallback, useEffect, useRef, useState } from 'react'
import { playTakeMediaAudible, primeTakePlaybackAudioSync } from '../../utils/takePlaybackAudio'
import { routeTakePlaybackToSpeaker } from '../../utils/takePlaybackSpeaker'

export function useMultitrackSync() {
  const mediaMapRef = useRef<Map<string, HTMLMediaElement>>(new Map())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number | null>(null)

  const getMaster = useCallback(() => {
    const entries = [...mediaMapRef.current.values()]
    return entries.find((el) => Number.isFinite(el.duration) && el.duration > 0) ?? entries[0] ?? null
  }, [])

  const refreshDuration = useCallback(() => {
    const durations = [...mediaMapRef.current.values()].map((el) => el.duration).filter((v) => Number.isFinite(v) && v > 0)
    setDuration(durations.length > 0 ? Math.max(...durations) : 0)
  }, [])

  const registerMedia = useCallback((panelId: string, element: HTMLMediaElement | null) => {
    if (element) {
      mediaMapRef.current.set(panelId, element)
      element.muted = false
      element.volume = 1
      element.preload = 'auto'
      element.setAttribute('playsinline', 'true')
      routeTakePlaybackToSpeaker(element, 1, false)
      element.addEventListener('loadedmetadata', refreshDuration)
      element.addEventListener('durationchange', refreshDuration)
    } else {
      mediaMapRef.current.get(panelId)?.removeEventListener('loadedmetadata', refreshDuration)
      mediaMapRef.current.get(panelId)?.removeEventListener('durationchange', refreshDuration)
      mediaMapRef.current.delete(panelId)
    }
    refreshDuration()
  }, [refreshDuration])

  const syncAllTo = useCallback((time: number) => {
    for (const el of mediaMapRef.current.values()) {
      try {
        if (Math.abs(el.currentTime - time) > 0.05) el.currentTime = time
      } catch {
        /* Some media elements reject seeks until metadata is ready. */
      }
    }
    setCurrentTime(time)
  }, [])

  const play = useCallback(async () => {
    const master = getMaster()
    const elements = [...mediaMapRef.current.values()]
    if (elements.length === 0) return

    const startTime = master?.currentTime ?? currentTime
    for (const el of elements) {
      el.muted = false
      el.volume = 1
      el.preload = 'auto'
      el.setAttribute('playsinline', 'true')
      routeTakePlaybackToSpeaker(el, 1, false)
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
    primeTakePlaybackAudioSync(...elements)
    const starts = await Promise.allSettled(
      elements.map((el) =>
        el.play().catch(() => playTakeMediaAudible(el, { skipRoutePrep: true })),
      ),
    )
    setIsPlaying(starts.some((result) => result.status === 'fulfilled'))
  }, [currentTime, getMaster])

  const pause = useCallback(() => {
    for (const el of mediaMapRef.current.values()) el.pause()
    setIsPlaying(false)
  }, [])

  const restart = useCallback(async () => { syncAllTo(0); await play() }, [play, syncAllTo])
  const seek = useCallback((time: number) => syncAllTo(time), [syncAllTo])

  useEffect(() => {
    if (!isPlaying) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return }
    const tick = () => {
      const master = getMaster()
      if (master) {
        setCurrentTime(master.currentTime)
        const elements = [...mediaMapRef.current.values()]
        if (elements.length > 0 && elements.every((el) => el.paused || el.ended)) {
          setIsPlaying(false)
          return
        }
        for (const el of mediaMapRef.current.values()) {
          try {
            if (el !== master && !el.paused && Math.abs(el.currentTime - master.currentTime) > 0.18) el.currentTime = master.currentTime
          } catch {
            /* ignore */
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [getMaster, isPlaying])

  return { registerMedia, play, pause, restart, seek, state: { isPlaying, currentTime, duration } }
}
