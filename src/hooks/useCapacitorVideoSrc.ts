import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { resolveMediaPlaybackSrc } from '../utils/mediaPlayback'
import {
  readCachedPlaybackSrc,
  resolveNativeVideoPlaybackSrc,
} from '../utils/takeStorage'

/**
 * Resolve a native file path or video URL once for `<video src>`.
 * Skips Filesystem.getUri when the fallback URL is already converted.
 * Dedupes state updates to avoid re-render / getUri loops.
 */
export function useCapacitorVideoSrc(
  filePath: string,
  fallbackUrl: string,
): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    const cached = readCachedPlaybackSrc(filePath, fallbackUrl)
    return cached ? resolveMediaPlaybackSrc(cached) : null
  })

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setSrc((current) => {
        const next = fallbackUrl ? resolveMediaPlaybackSrc(fallbackUrl) : null
        return current === next ? current : next
      })
      return
    }

    let cancelled = false

    void resolveNativeVideoPlaybackSrc(filePath, fallbackUrl).then((resolved) => {
      if (cancelled) return
      const safe = resolved ? resolveMediaPlaybackSrc(resolved) : null
      setSrc((current) => (current === safe ? current : safe))
    })

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}
