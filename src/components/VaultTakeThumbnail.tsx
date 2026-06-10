import { useEffect, useState } from 'react'
import { AUDIO_TAKE_THUMBNAIL, isAudioTake } from '../utils/mediaType'
import type { Take } from '../types'

interface VaultTakeThumbnailProps {
  take: Take
  className?: string
}

/** Vault list thumbnail — static image only (no inline video decode). */
export default function VaultTakeThumbnail({
  take,
  className = 'h-full w-full object-cover pointer-events-none',
}: VaultTakeThumbnailProps) {
  const audio = isAudioTake(take)
  const [cachedFailed, setCachedFailed] = useState(false)

  useEffect(() => {
    setCachedFailed(false)
  }, [take.id, take.thumbnailUrl])

  if (audio) {
    return (
      <img
        src={take.thumbnailUrl || AUDIO_TAKE_THUMBNAIL}
        alt=""
        className={className}
        draggable={false}
        loading="lazy"
        decoding="async"
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
        decoding="async"
        onError={() => setCachedFailed(true)}
      />
    )
  }

  return (
    <div className={`${className} vault-thumb-placeholder`} aria-hidden>
      <span className="vault-thumb-placeholder__label">Video</span>
    </div>
  )
}
