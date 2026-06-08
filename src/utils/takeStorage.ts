import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

const TAKES_DIR = 'takes'

export interface PersistedTakeVideo {
  filePath: string
  videoUrl: string
}

export interface RecordingCompletePayload {
  takeId: string
  mimeType: string
  filePath: string
  videoUrl: string
  /** Only set on web dev fallback — native recordings are already on disk */
  blob?: Blob
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('webm')) return 'webm'
  return 'mp4'
}

function isAlreadyExistsError(err: unknown): boolean {
  if (err == null) return false

  if (typeof err === 'string') {
    const lower = err.toLowerCase()
    return lower.includes('already exists') || err.includes('OS-PLUG-FILE-0010')
  }

  if (typeof err === 'object') {
    const e = err as {
      code?: string
      message?: string
      errorMessage?: string
    }
    const code = e.code ?? ''
    const message = `${e.message ?? ''} ${e.errorMessage ?? ''}`.toLowerCase()
    return (
      code === 'OS-PLUG-FILE-0010' ||
      message.includes('already exists') ||
      message.includes('os-plug-file-0010')
    )
  }

  return false
}

async function ensureTakesDirectory(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: TAKES_DIR,
      directory: Directory.Data,
      recursive: true,
    })
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      return
    }
    /* Non-fatal — proceed even if mkdir fails; writes may still succeed */
  }
}

/** True when the URL is already safe for WebView `<video src>`. */
function isConvertedPlaybackUrl(url: string): boolean {
  return (
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.includes('_capacitor_file_') ||
    url.startsWith('capacitor://')
  )
}

/**
 * Always returns a WebView-safe playback URL on native.
 * Handles relative paths, raw file:/// URIs, and pre-converted URLs.
 */
export async function toCapacitorPlaybackSrc(
  uriOrPath: string,
): Promise<string> {
  if (!uriOrPath) return ''

  if (!Capacitor.isNativePlatform()) {
    return uriOrPath
  }

  if (isConvertedPlaybackUrl(uriOrPath)) {
    return uriOrPath
  }

  if (uriOrPath.startsWith('file://')) {
    return Capacitor.convertFileSrc(uriOrPath)
  }

  const { uri } = await Filesystem.getUri({
    path: uriOrPath,
    directory: Directory.Data,
  })
  return Capacitor.convertFileSrc(uri)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode recording chunk'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read chunk'))
    reader.readAsDataURL(blob)
  })
}

async function toPlaybackUrl(filePath: string): Promise<string> {
  return toCapacitorPlaybackSrc(filePath)
}

/**
 * Streams MediaRecorder chunks to disk while recording (native only).
 * Chunks are appended sequentially so memory stays flat on long takes.
 */
export class StreamingTakeWriter {
  readonly takeId: string
  readonly filePath: string
  readonly mimeType: string

  private writeChain = Promise.resolve()
  private chunkCount = 0
  private closed = false
  private aborted = false
  /** iOS mp4 must be written as one file — appended fragments won't play back */
  private readonly bufferChunks: Blob[] = []
  private readonly useBufferedWrite: boolean

  private constructor(takeId: string, filePath: string, mimeType: string) {
    this.takeId = takeId
    this.filePath = filePath
    this.mimeType = mimeType
    this.useBufferedWrite = mimeType.includes('mp4')
  }

  static async open(
    takeId: string,
    mimeType: string,
  ): Promise<StreamingTakeWriter | null> {
    if (!Capacitor.isNativePlatform()) {
      return null
    }

    await ensureTakesDirectory()

    const ext = extensionForMime(mimeType)
    const filePath = `${TAKES_DIR}/${takeId}.${ext}`

    await deleteTakeFile(filePath)

    return new StreamingTakeWriter(takeId, filePath, mimeType)
  }

  /** Queue a recorder chunk for sequential disk write; resolves when flushed. */
  enqueue(chunk: Blob): Promise<void> {
    if (this.closed || this.aborted || chunk.size === 0) {
      return Promise.resolve()
    }

    if (this.useBufferedWrite) {
      this.bufferChunks.push(chunk)
      this.chunkCount += 1
      return Promise.resolve()
    }

    const task = this.writeChain.then(() => this.writeChunk(chunk))
    this.writeChain = task.catch(() => {
      /* keep chain alive after a failed append */
    })
    return task
  }

  private async writeChunk(chunk: Blob): Promise<void> {
    if (this.aborted) return

    const base64 = await blobToBase64(chunk)

    if (this.chunkCount === 0) {
      await Filesystem.writeFile({
        path: this.filePath,
        data: base64,
        directory: Directory.Data,
      })
    } else {
      await Filesystem.appendFile({
        path: this.filePath,
        data: base64,
        directory: Directory.Data,
      })
    }

    this.chunkCount += 1
  }

  async finalize(): Promise<PersistedTakeVideo> {
    if (this.aborted) {
      throw new Error('Recording was aborted')
    }

    this.closed = true
    await this.writeChain

    if (this.chunkCount === 0) {
      await deleteTakeFile(this.filePath)
      throw new Error('Recording contained no data')
    }

    if (this.useBufferedWrite) {
      const blob = new Blob(this.bufferChunks, { type: this.mimeType })
      this.bufferChunks.length = 0

      if (blob.size === 0) {
        await deleteTakeFile(this.filePath)
        throw new Error('Recording contained no data')
      }

      const base64 = await blobToBase64(blob)
      await Filesystem.writeFile({
        path: this.filePath,
        data: base64,
        directory: Directory.Data,
      })

      return {
        filePath: this.filePath,
        videoUrl: await toPlaybackUrl(this.filePath),
      }
    }

    return {
      filePath: this.filePath,
      videoUrl: await toPlaybackUrl(this.filePath),
    }
  }

  /** Discard a partial take and remove any bytes already written. */
  async abort(): Promise<void> {
    if (this.aborted) return

    this.aborted = true
    this.closed = true
    this.bufferChunks.length = 0
    await this.writeChain.catch(() => {})
    await deleteTakeFile(this.filePath)
  }
}

/** Web-only: expose a blob URL after recording stops. */
export async function persistRecordingBlob(
  blob: Blob,
  _takeId: string,
  _mimeType: string,
): Promise<PersistedTakeVideo> {
  return {
    filePath: '',
    videoUrl: URL.createObjectURL(blob),
  }
}

export async function resolveTakePlaybackUrl(
  filePath: string,
  fallbackUrl: string,
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return fallbackUrl
  }

  if (filePath) {
    return toCapacitorPlaybackSrc(filePath)
  }

  if (fallbackUrl) {
    return toCapacitorPlaybackSrc(fallbackUrl)
  }

  return fallbackUrl
}

export async function deleteTakeFile(filePath: string): Promise<void> {
  if (!filePath || !Capacitor.isNativePlatform()) return

  try {
    await Filesystem.deleteFile({
      path: filePath,
      directory: Directory.Data,
    })
  } catch {
    /* file may already be gone */
  }
}
