import { useCallback, useEffect, useRef, useState } from 'react'
import { playTakeMediaAudible } from '../../utils/takePlaybackAudio'
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
      routeTakePlaybackToSpeaker(element, 1, false)
      element.addEventListener('loadedmetadata', refreshDuration)
    } else {
      mediaMapRef.current.get(panelId)?.removeEventListener('loadedmetadata', refreshDuration)
      mediaMapRef.current.delete(panelId)
    }
    refreshDuration()
  }, [refreshDuration])

  const syncAllTo = useCallback((time: number) => {
    for (const el of mediaMapRef.current.values()) {
      if (Math.abs(el.currentTime - time) > 0.05) el.currentTime = time
    }
    setCurrentTime(time)
  }, [])

  const play = useCallback(async () => {
    const master = getMaster()
    syncAllTo(master?.currentTime ?? 0)
    await Promise.allSettled([...mediaMapRef.current.values()].map(async (el) => {
      routeTakePlaybackToSpeaker(el, 1, false)
      await playTakeMediaAudible(el)
    }))
    setIsPlaying(true)
  }, [getMaster, syncAllTo])

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
        for (const el of mediaMapRef.current.values()) {
          if (el !== master && Math.abs(el.currentTime - master.currentTime) > 0.12) el.currentTime = master.currentTime
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [getMaster, isPlaying])

  return { registerMedia, play, pause, restart, seek, state: { isPlaying, currentTime, duration } }
}
