import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
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
  const [src, setSrc] = useState<string | null>(() =>
    readCachedPlaybackSrc(filePath, fallbackUrl),
  )

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setSrc((current) => {
        const next = fallbackUrl || null
        return current === next ? current : next
      })
      return
    }

    let cancelled = false

    void resolveNativeVideoPlaybackSrc(filePath, fallbackUrl).then((resolved) => {
      if (cancelled) return
      setSrc((current) => (current === resolved ? current : resolved))
    })

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}
