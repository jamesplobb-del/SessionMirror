import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  applyStrictPlaybackSrc,
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
    return fallbackUrl ? applyStrictPlaybackSrc(fallbackUrl) : null
  })

  useEffect(() => {
    let cancelled = false

    const resolve = async (): Promise<string | null> => {
      try {
        if (!Capacitor.isNativePlatform()) {
          return fallbackUrl || null
        }

        if (filePath) {
          return await toCapacitorPlaybackSrc(filePath)
        }

        if (fallbackUrl) {
          return await toCapacitorPlaybackSrc(fallbackUrl)
        }

        return null
      } catch {
        if (fallbackUrl.startsWith('file://')) {
          return Capacitor.convertFileSrc(fallbackUrl)
        }
        return fallbackUrl || null
      }
    }

    void resolve().then((resolved) => {
      if (!cancelled) {
        setSrc(resolved ? applyStrictPlaybackSrc(resolved) : null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}
