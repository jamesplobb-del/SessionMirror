import { useCallback, useEffect, useRef, useState } from 'react'
import { assignMediaPlaybackSrc, prepareInlineMediaElement } from '../utils/mediaPlayback'
import {
  routeTakePlaybackToSpeaker,
  updateTakePlaybackSpeakerGain,
} from '../utils/takePlaybackSpeaker'
import { primeTakePlaybackForUserGesture } from '../utils/takePlaybackAudio'
import { getTrimBounds, trimPercentToTime } from './useCreatorStudioPlayback'
import type { CreatorStudioBackingTrack } from '../creatorStudio/types'
import { loadBackingTrackBlob } from '../creatorStudio/projectStorage'

export function useCreatorStudioBackingTrack(
  isOpen: boolean,
  backingTrack: CreatorStudioBackingTrack | null,
  instrumentMediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>,
  backingVolume: number,
  isMuted: boolean,
) {
  const backingRef = useRef<HTMLAudioElement>(null)
  const [backingSrc, setBackingSrc] = useState<string | null>(null)
  const [backingDuration, setBackingDuration] = useState(0)
  const [backingCurrentTime, setBackingCurrentTime] = useState(0)
  const backingTrackRef = useRef(backingTrack)
  backingTrackRef.current = backingTrack

  useEffect(() => {
    if (!isOpen || !backingTrack) {
      setBackingSrc(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    void loadBackingTrackBlob(backingTrack.storageKey).then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setBackingSrc(objectUrl)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setBackingSrc(null)
    }
  }, [backingTrack, isOpen])

  useEffect(() => {
    const backing = backingRef.current
    if (!isOpen || !backing || !backingSrc) return

    prepareInlineMediaElement(backing)
    assignMediaPlaybackSrc(backing, backingSrc)
    primeTakePlaybackForUserGesture(backing)

    const syncDuration = () => {
      if (backing.duration && Number.isFinite(backing.duration)) {
        setBackingDuration(backing.duration)
      }
    }
    const onTimeUpdate = () => setBackingCurrentTime(backing.currentTime)

    backing.addEventListener('loadedmetadata', syncDuration)
    backing.addEventListener('durationchange', syncDuration)
    backing.addEventListener('timeupdate', onTimeUpdate)
    syncDuration()

    const volume = isMuted ? 0 : backingVolume / 100
    routeTakePlaybackToSpeaker(backing, volume, isMuted)
    updateTakePlaybackSpeakerGain(backing, volume, isMuted)

    return () => {
      backing.removeEventListener('loadedmetadata', syncDuration)
      backing.removeEventListener('durationchange', syncDuration)
      backing.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [backingSrc, backingVolume, isMuted, isOpen])

  useEffect(() => {
    const instrument = instrumentMediaRef.current
    const backing = backingRef.current
    if (!instrument || !backing || !backingTrackRef.current) return

    const syncBacking = () => {
      const track = backingTrackRef.current
      if (!track || !instrument.duration) return

      const offsetSec = track.syncOffsetMs / 1000
      const { start, end } = getTrimBounds(track.trim, backing.duration || instrument.duration)
      const target = instrument.currentTime + offsetSec

      if (target < start || target > end) {
        if (!backing.paused) backing.pause()
        return
      }

      if (Math.abs(backing.currentTime - target) > 0.12) {
        backing.currentTime = target
      }

      if (!instrument.paused && backing.paused) {
        void backing.play().catch(() => undefined)
      } else if (instrument.paused && !backing.paused) {
        backing.pause()
      }
    }

    instrument.addEventListener('timeupdate', syncBacking)
    instrument.addEventListener('play', syncBacking)
    instrument.addEventListener('pause', syncBacking)
    instrument.addEventListener('seeking', syncBacking)

    return () => {
      instrument.removeEventListener('timeupdate', syncBacking)
      instrument.removeEventListener('play', syncBacking)
      instrument.removeEventListener('pause', syncBacking)
      instrument.removeEventListener('seeking', syncBacking)
    }
  }, [instrumentMediaRef, backingSrc])

  const seekBackingToPercent = useCallback((percent: number) => {
    const backing = backingRef.current
    if (!backing || !backing.duration) return
    backing.currentTime = trimPercentToTime(percent, backing.duration)
  }, [])

  return {
    backingRef,
    backingSrc,
    backingDuration,
    backingPlayheadPercent: backingDuration
      ? Math.min(100, Math.max(0, (backingCurrentTime / backingDuration) * 100))
      : 0,
    seekBackingToPercent,
  }
}
