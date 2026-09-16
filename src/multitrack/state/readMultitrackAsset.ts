import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

/** Read original bytes from native storage, not the WebView's video URL. */
export async function readMultitrackAsset(src: string, label: string, filePath?: string): Promise<Blob> {
  const path = filePath || (src.startsWith('file://') ? src : undefined)
  if (Capacitor.isNativePlatform() && path) {
    try {
      const location = { path, ...(!path.startsWith('file://') && !path.startsWith('/') ? { directory: Directory.Data } : {}) }
      const stat = await Filesystem.stat(location)
      if (!stat.size || stat.size > 512 * 1024 * 1024) throw new Error('File is empty or exceeds 512 MB')
      const chunks: BlobPart[] = []
      for (let offset = 0; offset < stat.size;) {
        const length = Math.min(3 * 1024 * 1024, stat.size - offset)
        const { data } = await Filesystem.readFile({ ...location, offset, length })
        const chunk = typeof data === 'string' ? Uint8Array.from(atob(data), c => c.charCodeAt(0)) : new Uint8Array(await data.arrayBuffer())
        if (chunk.length !== length) throw new Error('Incomplete file read')
        chunks.push(chunk); offset += chunk.length
      }
      return new Blob(chunks)
    } catch (error) {
      console.warn('[Multitrack file] Native asset read failed', error)
      // An imported recording may still have a valid in-memory URL.
    }
  }
  try {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    if (!blob.size) throw new Error('Empty file')
    return blob
  } catch {
    throw new Error(`${label} could not be read from storage. Choose that recording or attachment again, then retry sharing.`)
  }
}
