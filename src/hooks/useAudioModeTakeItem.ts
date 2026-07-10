import { useCallback, useMemo } from 'react'
import { useAudioModePlayback } from '../context/AudioModePlaybackContext'
import { useCapacitorVideoSrc } from './useCapacitorVideoSrc'
import { buildAudioModePlaybackItem } from '../utils/audioModePlaybackItem'
import type { Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'

export function useAudioModeTakeItem({
  tone,
  take,
  libraryPlayback = null,
}: {
  tone: 'current' | 'best'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
}) {
  const audioPlayback = useAudioModePlayback()
  const filePath = libraryPlayback?.filePath ?? take?.filePath ?? ''
  const rawMediaUrl = libraryPlayback?.playbackUrl ?? take?.videoUrl ?? ''
  const resolvedMediaUrl = useCapacitorVideoSrc(filePath, rawMediaUrl)
  const playbackItem = useMemo(
    () => buildAudioModePlaybackItem({ tone, take, libraryPlayback, resolvedMediaUrl }),
    [libraryPlayback, resolvedMediaUrl, take, tone]
  )
  const hasMedia = Boolean(playbackItem)
  const isCurrentItem = playbackItem ? audioPlayback.matchesCurrentSource(playbackItem) : false
  const isPlaying = isCurrentItem && audioPlayback.state.isPlaying
  const durationSeconds =
    isCurrentItem && Number.isFinite(audioPlayback.state.duration) && audioPlayback.state.duration > 0
      ? audioPlayback.state.duration
      : 0
  const currentTime =
    isCurrentItem && Number.isFinite(audioPlayback.state.currentTime)
      ? Math.max(0, Math.min(audioPlayback.state.currentTime, durationSeconds || audioPlayback.state.currentTime))
      : 0
  const playbackProgress = durationSeconds > 0 ? Math.max(0, Math.min(1, currentTime / durationSeconds)) : 0
  const displayName =
    libraryPlayback?.name ?? take?.name ?? (tone === 'best' ? 'No Best Take' : 'No Current Take')

  const togglePlayback = useCallback(() => {
    if (!playbackItem) return
    audioPlayback.toggle(playbackItem)
  }, [audioPlayback, playbackItem])

  const openTake = useCallback(
    (onOpen?: () => void) => {
      if (!playbackItem) return
      audioPlayback.select(playbackItem)
      if (!onOpen) return
      window.requestAnimationFrame(() => {
        onOpen()
      })
    },
    [audioPlayback, playbackItem]
  )

  return {
    playbackItem,
    hasMedia,
    isCurrentItem,
    isPlaying,
    durationSeconds,
    currentTime,
    playbackProgress,
    displayName,
    togglePlayback,
    openTake,
    audioPlayback,
  }
}
