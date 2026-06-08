import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { resolveTakePlaybackUrl } from '../utils/takeStorage'

/** Resolve a native file path to a WebView-safe playback URL (convertFileSrc). */
export function useCapacitorVideoSrc(
  filePath: string,
  fallbackUrl: string,
): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (filePath && Capacitor.isNativePlatform()) return null
    return fallbackUrl || null
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const resolved = await resolveTakePlaybackUrl(filePath, fallbackUrl)
        if (!cancelled) {
          setSrc(resolved || null)
        }
      } catch {
        if (!cancelled) {
          setSrc(fallbackUrl || null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}
