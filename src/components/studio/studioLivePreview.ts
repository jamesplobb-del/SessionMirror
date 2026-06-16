import { agentDebugLog } from '../../utils/agentDebugLog'

/** Attach a live camera stream and start inline preview (iOS-safe). */
export async function attachLiveStreamPreview(
  el: HTMLVideoElement,
  stream: MediaStream,
  logContext: string,
): Promise<boolean> {
  if (el.srcObject !== stream) {
    el.srcObject = stream
    el.removeAttribute('src')
  }
  el.muted = true
  el.defaultMuted = true
  el.playsInline = true
  el.setAttribute('playsinline', 'true')
  el.setAttribute('webkit-playsinline', 'true')

  const tryPlay = async (): Promise<boolean> => {
    try {
      await el.play()
      return true
    } catch (error) {
      // #region agent log
      agentDebugLog(
        'studioLivePreview.ts:tryPlay',
        'preview play rejected',
        {
          logContext,
          error: error instanceof Error ? error.name : String(error),
          readyState: el.readyState,
          videoWidth: el.videoWidth,
          videoHeight: el.videoHeight,
        },
        'H1',
        'studio-camera',
      )
      // #endregion
      return false
    }
  }

  if (await tryPlay()) {
    // #region agent log
    agentDebugLog(
      'studioLivePreview.ts:attach',
      'preview play ok',
      {
        logContext,
        readyState: el.readyState,
        videoWidth: el.videoWidth,
        videoHeight: el.videoHeight,
      },
      'H1',
      'studio-camera',
    )
    // #endregion
    return true
  }

  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return tryPlay()
  }

  return new Promise((resolve) => {
    const onReady = () => {
      el.removeEventListener('loadedmetadata', onReady)
      void tryPlay().then(resolve)
    }
    el.addEventListener('loadedmetadata', onReady, { once: true })
  })
}
