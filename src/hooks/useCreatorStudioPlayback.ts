import { useCallback, useEffect, useRef, useState } from 'react'
import { useCapacitorVideoSrc } from './useCapacitorVideoSrc'
import { formatTime } from './useVideoPlayback'
import { assignMediaPlaybackSrc, prepareInlineMediaElement } from '../utils/mediaPlayback'
import {
  finalizeTakePlaybackCleanup,
  playTakeMediaFromUserGesture,
  primeTakePlaybackForUserGesture,
} from '../utils/takePlaybackAudio'
import {
  routeTakePlaybackToSpeaker,
  updateTakePlaybackSpeakerGain,
} from '../utils/takePlaybackSpeaker'
import type { CreatorStudioAudioMix, CreatorStudioTrimRange } from '../creatorStudio/types'
import type { Take } from '../types'

export function trimPercentToTime(percent: number, duration: number): number {
  if (!duration || !Number.isFinite(duration)) return 0
  return (duration * percent) / 100
}

export function trimTimeToPercent(time: number, duration: number): number {
  if (!duration || !Number.isFinite(duration)) return 0
  return Math.min(100, Math.max(0, (time / duration) * 100))
}

export function getTrimBounds(trim: CreatorStudioTrimRange, duration: number) {
  const start = trimPercentToTime(trim.start, duration)
  const end = trim.end === null ? duration : trimPercentToTime(trim.end, duration)
  return { start, end: Math.max(start, end) }
}

export function formatTrimLabel(percent: number, duration: number): string {
  return formatTime(trimPercentToTime(percent, duration))
}

export function useCreatorStudioPlayback(
  take: Take | null,
  isOpen: boolean,
  trim: CreatorStudioTrimRange,
  audio: CreatorStudioAudioMix,
) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const trimRef = useRef(trim)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const resolvedSrc = useCapacitorVideoSrc(take?.filePath ?? '', take?.videoUrl ?? '')

  trimRef.current = trim

  useEffect(() => {
    if (!isOpen || !take || !resolvedSrc) return
    const media = mediaRef.current
    if (!media) return

    prepareInlineMediaElement(media)
    assignMediaPlaybackSrc(media, resolvedSrc)
    primeTakePlaybackForUserGesture(media)
    routeTakePlaybackToSpeaker(media, 1, false)

    const syncDuration = () => {
      const next = media.duration
      if (next && Number.isFinite(next)) {
        setDuration(next)
      }
    }

    const onTimeUpdate = () => {
      const time = media.currentTime
      setCurrentTime(time)

      const mediaDuration = media.duration
      if (!mediaDuration || !Number.isFinite(mediaDuration)) return

      const { start, end } = getTrimBounds(trimRef.current, mediaDuration)
      if (time < start - 0.04) {
        media.currentTime = start
      } else if (time >= end - 0.03 && !media.paused) {
        media.pause()
        media.currentTime = start
        setIsPlaying(false)
      }
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      const mediaDuration = media.duration
      if (!mediaDuration) return
      media.currentTime = getTrimBounds(trimRef.current, mediaDuration).start
    }

    media.addEventListener('loadedmetadata', syncDuration)
    media.addEventListener('durationchange', syncDuration)
    media.addEventListener('timeupdate', onTimeUpdate)
    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    media.addEventListener('ended', onEnded)
    syncDuration()

    return () => {
      media.removeEventListener('loadedmetadata', syncDuration)
      media.removeEventListener('durationchange', syncDuration)
      media.removeEventListener('timeupdate', onTimeUpdate)
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      media.removeEventListener('ended', onEnded)
    }
  }, [isOpen, take, resolvedSrc])

  useEffect(() => {
    if (!isOpen) {
      void finalizeTakePlaybackCleanup()
      setDuration(0)
      setCurrentTime(0)
      setIsPlaying(false)
    }
  }, [isOpen])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const muted = audio.source === 'mute'
    const volume = audio.instrumentVolume / 100
    routeTakePlaybackToSpeaker(media, volume, muted)
    updateTakePlaybackSpeakerGain(media, volume, muted)
  }, [audio.instrumentVolume, audio.source])

  const togglePlayback = useCallback(() => {
    const media = mediaRef.current
    if (!media) return

    if (!media.paused) {
      media.pause()
      return
    }

    const mediaDuration = media.duration || duration
    if (!mediaDuration) return

    const { start, end } = getTrimBounds(trimRef.current, mediaDuration)
    if (media.currentTime < start || media.currentTime >= end - 0.02) {
      media.currentTime = start
    }

    playTakeMediaFromUserGesture(media, {
      onFailure: () => setIsPlaying(false),
    })
  }, [duration])

  const seekToPercent = useCallback(
    (percent: number) => {
      const media = mediaRef.current
      if (!media || !duration) return
      media.currentTime = trimPercentToTime(percent, duration)
      setCurrentTime(media.currentTime)
    },
    [duration],
  )

  const playheadPercent = duration ? trimTimeToPercent(currentTime, duration) : 0

  return {
    mediaRef,
    resolvedSrc,
    duration,
    currentTime,
    isPlaying,
    playheadPercent,
    togglePlayback,
    seekToPercent,
    formatTrimLabel: useCallback(
      (percent: number) => formatTrimLabel(percent, duration),
      [duration],
    ),
  }
}
