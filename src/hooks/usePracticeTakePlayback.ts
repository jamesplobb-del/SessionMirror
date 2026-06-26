import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assignMediaPlaybackSrc,
  prepareInlineMediaElement,
  resolveMediaPlaybackSrc,
} from '../utils/mediaPlayback'
import { finalizeTakePlaybackCleanup } from '../utils/takePlaybackAudio'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import type { Take } from '../types'
import { takeHasPlaybackMedia } from '../utils/takes'

export function usePracticeTakePlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncProgress = () => {
      if (!audio.duration || !Number.isFinite(audio.duration)) {
        setProgress(0)
        return
      }
      setProgress(audio.currentTime / audio.duration)
    }

    const onPlay = () => syncProgress()
    const onPause = () => syncProgress()
    const onEnded = () => {
      setPlayingTakeId(null)
      setProgress(0)
      void finalizeTakePlaybackCleanup()
    }
    const onTimeUpdate = () => syncProgress()

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [])

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    setPlayingTakeId(null)
    setProgress(0)
    void finalizeTakePlaybackCleanup()
  }, [])

  const toggleTakePlayback = useCallback(
    (take: Take | null) => {
      if (!take || !takeHasPlaybackMedia(take)) return

      const audio = audioRef.current
      if (!audio) return

      if (playingTakeId === take.id && !audio.paused) {
        toggleInlineTakePlayback(audio, {
          onPaused: () => {
            setPlayingTakeId(null)
            setProgress(0)
          },
        })
        return
      }

      stopPlayback()
      prepareInlineMediaElement(audio, { preload: 'metadata' })
      const src = resolveMediaPlaybackSrc(take.videoUrl)
      if (!src) return
      assignMediaPlaybackSrc(audio, src)
      audio.load()

      toggleInlineTakePlayback(audio, {
        onPlaying: () => setPlayingTakeId(take.id),
        onFailure: () => {
          setPlayingTakeId(null)
          setProgress(0)
        },
      })
    },
    [playingTakeId, stopPlayback],
  )

  return {
    audioRef,
    playingTakeId,
    progress,
    toggleTakePlayback,
    stopPlayback,
  }
}
