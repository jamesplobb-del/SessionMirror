import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  applyStrictPlaybackSrc,
  sanitizeNativeVideoSrc,
  toCapacitorPlaybackSrc,
} from '../utils/takeStorage'

/** Resolve a native file path or raw file:/// URI to a WebView-safe playback URL. */
export function useCapacitorVideoSrc(
  filePath: string,
  fallbackUrl: string,
): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (!Capacitor.isNativePlatform()) {
      return fallbackUrl || null
    }
    if (filePath || fallbackUrl.startsWith('file://')) {
      return null
    }
    return sanitizeNativeVideoSrc(fallbackUrl)
  })

  useEffect(() => {
    let cancelled = false

    const resolve = async (): Promise<string | null> => {
      try {
        if (!Capacitor.isNativePlatform()) {
          return fallbackUrl || null
        }

        let resolved: string | null = null

        if (filePath) {
          resolved = await toCapacitorPlaybackSrc(filePath)
        } else if (fallbackUrl) {
          resolved = await toCapacitorPlaybackSrc(fallbackUrl)
        }

        return sanitizeNativeVideoSrc(resolved)
      } catch {
        if (fallbackUrl.startsWith('file://')) {
          return sanitizeNativeVideoSrc(Capacitor.convertFileSrc(fallbackUrl))
        }
        return sanitizeNativeVideoSrc(
          fallbackUrl ? applyStrictPlaybackSrc(fallbackUrl) : null,
        )
      }
    }

    void resolve().then((resolved) => {
      if (!cancelled) {
        setSrc(resolved)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}
