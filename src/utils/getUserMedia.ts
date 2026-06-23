/**
 * Robust `getUserMedia` accessor.
 *
 * On iOS WKWebView `navigator.mediaDevices` is only exposed in a secure
 * context (the `capacitor://` / `https://` app origin). When the app is loaded
 * over an insecure origin (e.g. a plain `http://` dev-server during live
 * reload) the whole `navigator.mediaDevices` object is `undefined`, which made
 * the camera hook crash with "undefined is not an object (evaluating
 * 'navigator.mediaDevices.getUserMedia')" and permanently greyed out the
 * record buttons.
 *
 * This wrapper:
 *  - uses the modern Promise-based API when available,
 *  - falls back to the legacy callback API (`navigator.getUserMedia` /
 *    `webkitGetUserMedia`) if that is all the WebView exposes,
 *  - otherwise throws a clear, actionable error instead of a raw TypeError.
 */

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  onSuccess: (stream: MediaStream) => void,
  onError: (error: unknown) => void,
) => void

interface LegacyNavigator {
  getUserMedia?: LegacyGetUserMedia
  webkitGetUserMedia?: LegacyGetUserMedia
  mozGetUserMedia?: LegacyGetUserMedia
}

export class MediaDevicesUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaDevicesUnavailableError'
  }
}

/** True when the current context can actually request camera/microphone access. */
export function isGetUserMediaSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    return true
  }
  const legacy = navigator as Navigator & LegacyNavigator
  return Boolean(legacy.getUserMedia || legacy.webkitGetUserMedia || legacy.mozGetUserMedia)
}

function describeUnavailableReason(): string {
  if (typeof navigator === 'undefined') {
    return 'Media capture is unavailable in this environment.'
  }
  const insecure =
    typeof window !== 'undefined' &&
    'isSecureContext' in window &&
    window.isSecureContext === false
  if (insecure) {
    return 'Camera and microphone access requires a secure context. Run the installed app build (not the http dev server).'
  }
  return 'Camera and microphone access is not available in this WebView.'
}

export async function getUserMediaCompat(
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints)
  }

  const legacy = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & LegacyNavigator)
    | undefined
  const legacyGetUserMedia =
    legacy?.getUserMedia || legacy?.webkitGetUserMedia || legacy?.mozGetUserMedia

  if (legacy && legacyGetUserMedia) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacyGetUserMedia.call(legacy, constraints, resolve, reject)
    })
  }

  throw new MediaDevicesUnavailableError(describeUnavailableReason())
}
