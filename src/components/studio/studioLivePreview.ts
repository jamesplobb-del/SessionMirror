/** Attach a live camera stream and start inline preview (iOS-safe). */
export async function attachLiveStreamPreview(
  el: HTMLVideoElement,
  stream: MediaStream,
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
    } catch {
      return false
    }
  }

  if (await tryPlay()) return true

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
