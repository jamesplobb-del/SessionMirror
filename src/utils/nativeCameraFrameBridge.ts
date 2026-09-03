import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isNativeCameraTestAvailable } from './nativeCameraTest'

export interface NativeCameraPreviewFrameEvent {
  jpegBase64?: string
  /** @deprecated Legacy data-URL payloads */
  dataUrl?: string
  width?: number
  height?: number
  frameId?: number
}

async function acknowledgeNativePreviewFrame(frameId?: number): Promise<void> {
  if (!Number.isSafeInteger(frameId) || (frameId ?? -1) < 0) return
  try {
    await BestTakeAudioPlugin.ackNativeCameraPreviewFrame({ frameId: frameId as number })
  } catch {
    // Older native bundles do not expose acknowledgements. The native timeout
    // still prevents a stalled consumer from freezing the preview permanently.
  }
}

function extractJpegBase64(event: NativeCameraPreviewFrameEvent): string | null {
  if (event.jpegBase64) return event.jpegBase64
  if (!event.dataUrl) return null
  const comma = event.dataUrl.indexOf(',')
  return comma >= 0 ? event.dataUrl.slice(comma + 1) : event.dataUrl
}

function base64ToJpegBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: 'image/jpeg' })
}

export async function decodeNativePreviewFrame(
  event: NativeCameraPreviewFrameEvent,
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const base64 = extractJpegBase64(event)
  if (!base64) throw new Error('missing frame payload')

  const blob = base64ToJpegBlob(base64)
  const bitmap = await createImageBitmap(blob)
  const width = event.width && event.width > 0 ? event.width : bitmap.width
  const height = event.height && event.height > 0 ? event.height : bitmap.height
  return { bitmap, width, height }
}

export function subscribeNativeCameraPreviewFrames(
  onFrame: (event: NativeCameraPreviewFrameEvent) => void,
): Promise<PluginListenerHandle> | null {
  if (!isNativeCameraTestAvailable()) return null
  return BestTakeAudioPlugin.addListener('nativeCameraPreviewFrame', onFrame)
}

/** Draw a frame into a cover-fit canvas (mirrors video.camera-preview object-fit: cover). */
export function drawCoverFrameOnCanvas(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  mirrored = false,
): void {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const displayWidth = Math.round(canvas.clientWidth * dpr)
  const displayHeight = Math.round(canvas.clientHeight * dpr)
  if (displayWidth <= 0 || displayHeight <= 0) return

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth
    canvas.height = displayHeight
  }

  const imageRatio = sourceWidth / sourceHeight
  const canvasRatio = displayWidth / displayHeight

  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (imageRatio > canvasRatio) {
    sw = sourceHeight * canvasRatio
    sx = (sourceWidth - sw) / 2
  } else {
    sh = sourceWidth / canvasRatio
    sy = (sourceHeight - sh) / 2
  }

  ctx.save()
  if (mirrored) {
    ctx.translate(displayWidth, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, displayWidth, displayHeight)
  ctx.restore()
}

export function createNativePreviewFramePump(
  canvasRef: { current: HTMLCanvasElement | null },
  /** Fires each time a decoded frame is actually painted onto the canvas — used to know when it's safe to reveal the canvas instead of a stale/frozen frame. */
  onFrameDrawn?: () => void,
): {
  push: (event: NativeCameraPreviewFrameEvent) => void
  stop: () => void
} {
  let cancelled = false
  let latestFrame: NativeCameraPreviewFrameEvent | null = null
  let decoding = false
  let displayedBitmap: ImageBitmap | null = null
  let pendingFrame: ImageBitmap | null = null
  let rafId: number | null = null

  const cancelRaf = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const scheduleDraw = () => {
    if (rafId != null || cancelled) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (cancelled) return

      const canvas = canvasRef.current
      const bitmap = pendingFrame
      if (!bitmap) return

      pendingFrame = null
      if (!canvas) {
        bitmap.close()
        return
      }

      drawCoverFrameOnCanvas(canvas, bitmap, bitmap.width, bitmap.height)
      displayedBitmap?.close()
      displayedBitmap = bitmap
      onFrameDrawn?.()
    })
  }

  const stop = () => {
    cancelled = true
    if (latestFrame) {
      latestFrame = null
    }
    cancelRaf()
    displayedBitmap?.close()
    displayedBitmap = null
    if (pendingFrame) {
      pendingFrame.close()
      pendingFrame = null
    }
  }

  const decodeLoop = async () => {
    if (decoding || cancelled) return
    decoding = true

    while (latestFrame && !cancelled) {
      const frame = latestFrame
      latestFrame = null

      try {
        const decoded = await decodeNativePreviewFrame(frame)
        if (cancelled) {
          decoded.bitmap.close()
          continue
        }

        if (pendingFrame) {
          pendingFrame.close()
        }
        pendingFrame = decoded.bitmap
        scheduleDraw()
      } catch {
        /* receipt was already acknowledged; skip a malformed frame */
      }
    }

    decoding = false
    if (latestFrame && !cancelled) {
      void decodeLoop()
    }
  }

  return {
    push: (event: NativeCameraPreviewFrameEvent) => {
      /* Acknowledging at receipt keeps exactly one native-to-WebKit delivery in
       * flight, but removes decode + paint + bridge round-trip latency from the
       * camera cadence. The decode loop itself remains latest-frame-only. */
      void acknowledgeNativePreviewFrame(event.frameId)
      if (cancelled || !extractJpegBase64(event)) return
      latestFrame = event
      void decodeLoop()
    },
    stop,
  }
}
