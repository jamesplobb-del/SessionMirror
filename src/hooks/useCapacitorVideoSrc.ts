import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { toCapacitorPlaybackSrc } from '../utils/takeStorage'

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
    return fallbackUrl || null
  })

  useEffect(() => {
    let cancelled = false

    const resolve = async () => {
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
        if (!Capacitor.isNativePlatform()) {
          return fallbackUrl || null
        }
        if (fallbackUrl.startsWith('file://')) {
          try {
            return Capacitor.convertFileSrc(fallbackUrl)
          } catch {
            return null
          }
        }
        return fallbackUrl || null
      }
    }

    void resolve().then((resolved) => {
      if (!cancelled) {
        setSrc(resolved || null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}
