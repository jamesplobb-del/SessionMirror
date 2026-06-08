import { Capacitor } from '@capacitor/core'
import { FilePicker } from '@capawesome/capacitor-file-picker'

export interface PickedVideo {
  blob: Blob
  mimeType: string
}

function pickViaHtmlInput(): Promise<PickedVideo | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    input.style.display = 'none'

    input.onchange = () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) {
        resolve(null)
        return
      }
      resolve({
        blob: file,
        mimeType: file.type || 'video/mp4',
      })
    }

    input.oncancel = () => {
      input.remove()
      resolve(null)
    }

    document.body.appendChild(input)
    input.click()
  })
}

/**
 * Opens the native iOS/Android video gallery picker (no HTML action sheet).
 * Web dev fallback uses a hidden file input.
 */
export async function pickBenchmarkVideo(): Promise<PickedVideo | null> {
  if (!Capacitor.isNativePlatform()) {
    return pickViaHtmlInput()
  }

  try {
    const result = await FilePicker.pickVideos({
      readData: false,
      skipTranscoding: true,
      limit: 1,
    })

    const file = result.files[0]
    if (!file) {
      return null
    }

    const mimeType = file.mimeType || 'video/mp4'

    if (file.blob) {
      return { blob: file.blob, mimeType }
    }

    if (file.data) {
      const binary = atob(file.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return { blob: new Blob([bytes], { type: mimeType }), mimeType }
    }

    if (file.path) {
      const response = await fetch(Capacitor.convertFileSrc(file.path))
      if (!response.ok) {
        return null
      }
      const blob = await response.blob()
      return {
        blob: blob.type ? blob : new Blob([blob], { type: mimeType }),
        mimeType: blob.type || mimeType,
      }
    }

    return null
  } catch {
    return null
  }
}
