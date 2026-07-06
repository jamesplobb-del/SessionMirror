import { Directory, Filesystem } from '@capacitor/filesystem'

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read asset'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.readAsDataURL(blob)
  })
}

/** Sniffs a Blob's mime type (falling back to a file name's extension) for native cache file naming. */
export function extensionForBlob(blob: Blob, fallbackName: string): string {
  if (blob.type === 'application/pdf') return 'pdf'
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/heic') return 'heic'
  const extension = fallbackName.split('.').pop()?.toLowerCase()
  return extension && extension.length <= 5 ? extension : 'jpg'
}

/** Writes a Blob into the native Cache directory and returns its file:// URI. */
export async function writeBlobToNativeCache(
  dirName: string,
  fileName: string,
  blob: Blob,
): Promise<string> {
  const path = `${dirName}/${fileName}`
  await Filesystem.mkdir({
    path: dirName,
    directory: Directory.Cache,
    recursive: true,
  })
  await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: await blobToBase64(blob),
  })
  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  })
  return uri
}
