import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AUDIO_TAKE_THUMBNAIL, isAudioTake } from '../utils/mediaType'
import { withWebKitThumbnailHint } from '../utils/mobileVideo'
import { resolveNativeVideoPlaybackSrc } from '../utils/takeStorage'
import type { Take } from '../types'

interface VaultTakeThumbnailProps {
  take: Take
  className?: string
}

const THUMBNAIL_SEEK = 0.1

/** Vault card poster — cached JPEG, WebKit video frame, or audio placeholder. */
export default function VaultTakeThumbnail({
  take,
  className = 'h-full w-full object-cover pointer-events-none',
}: VaultTakeThumbnailProps) {
  const audio = isAudioTake(take)
  const [cachedFailed, setCachedFailed] = useState(false)
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(() => {
    if (audio || take.thumbnailUrl) return null
    return take.videoUrl ? withWebKitThumbnailHint(take.videoUrl) : null
  })

  useEffect(() => {
    setCachedFailed(false)
  }, [take.id, take.thumbnailUrl])

  useEffect(() => {
    if (audio || take.thumbnailUrl) return

    let cancelled = false

    void resolveNativeVideoPlaybackSrc(take.filePath, take.videoUrl).then((resolved) => {
      if (cancelled || !resolved) return
      setPlaybackSrc(withWebKitThumbnailHint(resolved))
    })

    return () => {
      cancelled = true
    }
  }, [audio, take.filePath, take.thumbnailUrl, take.videoUrl])

  if (audio) {
    return (
      <img
        src={take.thumbnailUrl || AUDIO_TAKE_THUMBNAIL}
        alt=""
        className={className}
        draggable={false}
        loading="lazy"
      />
    )
  }

  if (take.thumbnailUrl && !cachedFailed) {
    return (
      <img
        src={take.thumbnailUrl}
        alt=""
        className={className}
        draggable={false}
        loading="lazy"
        onError={() => setCachedFailed(true)}
      />
    )
  }

  if (playbackSrc) {
    const mirror = take.mirrorPlayback !== false
    return (
      <video
        key={playbackSrc}
        src={playbackSrc}
        className={className}
        style={mirror ? { transform: 'scaleX(-1)' } : undefined}
        muted
        playsInline
        preload="metadata"
        disablePictureInPicture
        tabIndex={-1}
        aria-hidden
        onPlay={(event) => {
          event.currentTarget.pause()
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          try {
            video.currentTime = THUMBNAIL_SEEK
          } catch {
            /* frame may still paint on some WebKit builds */
          }
        }}
        onLoadedData={(event) => {
          event.currentTarget.pause()
        }}
        onSeeked={(event) => {
          if (Capacitor.isNativePlatform()) {
            event.currentTarget.pause()
          }
        }}
      />
    )
  }

  return (
    <div
      className={`${className} bg-stone-800`}
      aria-hidden
    />
  )
}
