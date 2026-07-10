import { nativeDataFileExists } from './filesystemInit'
import { resolveMediaPlaybackSrc } from './mediaPlayback'
import { resolveTakePlaybackUrl } from './takeStorage'

export interface TakePlaybackReadinessResult {
  playbackUrl: string
  durationSeconds: number
}

function waitForMediaMetadataAndPlaybackData(
  media: HTMLMediaElement,
  playbackUrl: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let metadataLoaded = false
    let settled = false

    const cleanup = () => {
      media.removeEventListener('loadedmetadata', onMetadata)
      media.removeEventListener('loadeddata', onPlayable)
      media.removeEventListener('canplay', onPlayable)
      media.removeEventListener('error', onError)
      media.removeAttribute('src')
      media.load()
    }

    const finish = (durationSeconds: number) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(durationSeconds)
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    const completeWhenPlayable = () => {
      const durationSeconds = media.duration
      if (!metadataLoaded || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return
      if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        finish(durationSeconds)
      }
    }

    const onMetadata = () => {
      metadataLoaded = true
      if (!Number.isFinite(media.duration) || media.duration <= 0) {
        fail('The saved audio file has no playable duration.')
        return
      }
      completeWhenPlayable()
    }

    const onPlayable = () => completeWhenPlayable()
    const onError = () => {
      const code = media.error?.code
      fail(`The saved audio file could not be loaded${code ? ` (media error ${code})` : ''}.`)
    }

    media.addEventListener('loadedmetadata', onMetadata)
    media.addEventListener('loadeddata', onPlayable)
    media.addEventListener('canplay', onPlayable)
    media.addEventListener('error', onError)
    media.src = playbackUrl
    media.load()
  })
}

/**
 * Verifies a newly saved take using the same WebView source shape the take UI
 * will use. This deliberately waits on media events instead of a timer.
 */
export async function prepareTakePlaybackReadiness({
  filePath,
  fallbackUrl,
}: {
  filePath: string
  fallbackUrl: string
}): Promise<TakePlaybackReadinessResult> {
  if (filePath && !(await nativeDataFileExists(filePath))) {
    throw new Error('The saved audio file is not available yet.')
  }

  const playbackUrl = resolveMediaPlaybackSrc(
    fallbackUrl || (await resolveTakePlaybackUrl(filePath, fallbackUrl)),
  )
  if (!playbackUrl) {
    throw new Error('A playback source could not be created for this take.')
  }

  const media = document.createElement('audio')
  media.preload = 'auto'
  media.muted = true
  const durationSeconds = await waitForMediaMetadataAndPlaybackData(media, playbackUrl)

  return { playbackUrl, durationSeconds }
}
