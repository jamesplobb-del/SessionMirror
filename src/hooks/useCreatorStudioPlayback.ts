import { useCallback, useEffect, useRef, useState } from 'react'
import { useCapacitorVideoSrc } from './useCapacitorVideoSrc'
import { formatTime } from './useVideoPlayback'
import {
  assignMediaPlaybackSrc,
  prepareInlineMediaElement,
  resolveMediaPlaybackSrc,
} from '../utils/mediaPlayback'
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
  const [mediaNode, setMediaNode] = useState<HTMLVideoElement | HTMLAudioElement | null>(null)
  const trimRef = useRef(trim)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const nativeResolvedSrc = useCapacitorVideoSrc(take?.filePath ?? '', take?.videoUrl ?? '')
  const fallbackSrc = take?.videoUrl ? resolveMediaPlaybackSrc(take.videoUrl) : null
  const resolvedSrc = nativeResolvedSrc || fallbackSrc

  trimRef.current = trim

  const bindMediaRef = useCallback((node: HTMLVideoElement | HTMLAudioElement | null) => {
    mediaRef.current = node
    setMediaNode(node)
  }, [])

  useEffect(() => {
    if (!isOpen || !take || !resolvedSrc || !mediaNode) return

    prepareInlineMediaElement(mediaNode)
    assignMediaPlaybackSrc(mediaNode, resolvedSrc)
    mediaNode.load()
    primeTakePlaybackForUserGesture(mediaNode)
    routeTakePlaybackToSpeaker(mediaNode, 1, false)

    const syncDuration = () => {
      const next = mediaNode.duration
      if (next && Number.isFinite(next)) {
        setDuration(next)
      }
    }

    const onTimeUpdate = () => {
      const time = mediaNode.currentTime
      setCurrentTime(time)

      const mediaDuration = mediaNode.duration
      if (!mediaDuration || !Number.isFinite(mediaDuration)) return

      const { start, end } = getTrimBounds(trimRef.current, mediaDuration)
      if (time < start - 0.04) {
        mediaNode.currentTime = start
      } else if (time >= end - 0.03 && !mediaNode.paused) {
        mediaNode.pause()
        mediaNode.currentTime = start
        setIsPlaying(false)
      }
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      const mediaDuration = mediaNode.duration
      if (!mediaDuration) return
      mediaNode.currentTime = getTrimBounds(trimRef.current, mediaDuration).start
    }

    mediaNode.addEventListener('loadedmetadata', syncDuration)
    mediaNode.addEventListener('durationchange', syncDuration)
    mediaNode.addEventListener('timeupdate', onTimeUpdate)
    mediaNode.addEventListener('play', onPlay)
    mediaNode.addEventListener('pause', onPause)
    mediaNode.addEventListener('ended', onEnded)
    syncDuration()

    return () => {
      mediaNode.pause()
      mediaNode.removeEventListener('loadedmetadata', syncDuration)
      mediaNode.removeEventListener('durationchange', syncDuration)
      mediaNode.removeEventListener('timeupdate', onTimeUpdate)
      mediaNode.removeEventListener('play', onPlay)
      mediaNode.removeEventListener('pause', onPause)
      mediaNode.removeEventListener('ended', onEnded)
    }
  }, [isOpen, take, resolvedSrc, mediaNode])

  useEffect(() => {
    if (!isOpen) {
      const media = mediaRef.current
      if (media) {
        media.pause()
        media.removeAttribute('src')
        media.load()
      }
      void finalizeTakePlaybackCleanup()
      setDuration(0)
      setCurrentTime(0)
      setIsPlaying(false)
      setMediaNode(null)
    }
  }, [isOpen])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const muted = audio.source === 'mute'
    const volume = audio.instrumentVolume / 100
    routeTakePlaybackToSpeaker(media, volume, muted)
    updateTakePlaybackSpeakerGain(media, volume, muted)
  }, [audio.instrumentVolume, audio.source, mediaNode])

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
    bindMediaRef,
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
