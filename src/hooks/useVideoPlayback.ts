import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function useVideoPlayback(
  src: string | null,
  externalRef?: RefObject<HTMLVideoElement | null>,
) {
  const internalRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalRef ?? internalRef
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [src, videoRef])

  useEffect(() => {
    setIsPlaying(false)
  }, [src])

  const handleVolume = useCallback((value: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = value
    setVolume(value)
  }, [videoRef])

  return {
    videoRef,
    isPlaying,
    volume,
    handleVolume,
  }
}
