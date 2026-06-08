import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

const TAKES_DIR = 'takes'
export const NATIVE_VIDEO_MIME = 'video/mp4'

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

function serializeError(err: unknown): string {
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function isAlreadyExistsError(err: unknown): boolean {
  if (err == null) return false

  if (serializeError(err).includes('OS-PLUG-FILE-0010')) {
    return true
  }

  if (typeof err === 'string') {
    return err.toLowerCase().includes('already exists')
  }

  if (typeof err === 'object') {
    const e = err as {
      code?: string
      message?: string
      errorMessage?: string
      error?: { code?: string; message?: string }
    }
    const code = e.code ?? e.error?.code ?? ''
    const message = `${e.message ?? ''} ${e.errorMessage ?? ''} ${e.error?.message ?? ''}`.toLowerCase()
    return code === 'OS-PLUG-FILE-0010' || message.includes('already exists')
  }

  return false
}

function isDoesNotExistError(err: unknown): boolean {
  if (err == null) return false

  const serialized = serializeError(err)
  if (serialized.includes('OS-PLUG-FILE-0008')) {
    return true
  }

  if (typeof err === 'string') {
    const lower = err.toLowerCase()
    return lower.includes('does not exist') || lower.includes('not found')
  }

  if (typeof err === 'object') {
    const e = err as {
      code?: string
      message?: string
      errorMessage?: string
      error?: { code?: string; message?: string }
    }
    const code = e.code ?? e.error?.code ?? ''
    const message = `${e.message ?? ''} ${e.errorMessage ?? ''} ${e.error?.message ?? ''}`.toLowerCase()
    return (
      code === 'OS-PLUG-FILE-0008' ||
      message.includes('does not exist') ||
      message.includes('not found')
    )
  }

  return false
}

async function ensureTakesDirectory(): Promise<void> {
  try {
    await Filesystem.stat({
      path: TAKES_DIR,
      directory: Directory.Data,
    })
    return
  } catch {
    /* directory missing — create below */
  }

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

/** True when the URL is a WebView-safe Capacitor playback URL (never raw file://). */
export function isConvertedPlaybackUrl(url: string): boolean {
  if (!url || url.startsWith('file://')) {
    return false
  }
  return (
    url.startsWith('blob:') ||
    url.includes('_capacitor_file_') ||
    url.startsWith('capacitor://')
  )
}

/**
 * Strict final pass — every native file URI must go through convertFileSrc
 * before reaching `<video src>`. Never returns a raw file:// path.
 */
export function applyStrictPlaybackSrc(uri: string): string {
  if (!uri || !Capacitor.isNativePlatform()) {
    return uri
  }

  if (isConvertedPlaybackUrl(uri)) {
    return uri
  }

  const converted = Capacitor.convertFileSrc(uri)
  if (converted.startsWith('file://')) {
    return Capacitor.convertFileSrc(converted)
  }
  return converted
}

/** Returns null if the URL is still an unsafe raw file path on native. */
export function sanitizeNativeVideoSrc(url: string | null): string | null {
  if (!url) return null
  if (!Capacitor.isNativePlatform()) return url

  const safe = applyStrictPlaybackSrc(url)
  if (safe.startsWith('file://') || !isConvertedPlaybackUrl(safe)) {
    return null
  }
  return safe
}

/** @deprecated Use applyStrictPlaybackSrc */
export function convertFileSrcIfNeeded(uri: string): string {
  return applyStrictPlaybackSrc(uri)
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

/**
 * Streams MediaRecorder chunks to disk while recording (native only).
 * On iOS, chunks are assembled into a single mp4 Blob before writeFile.
 */
export class StreamingTakeWriter {
  readonly takeId: string
  readonly filePath: string
  readonly mimeType: string

  private writeChain = Promise.resolve()
  private chunkCount = 0
  private closed = false
  private aborted = false
  private readonly bufferChunks: Blob[] = []
  private readonly useBufferedWrite: boolean

  private constructor(
    takeId: string,
    filePath: string,
    mimeType: string,
    useBufferedWrite: boolean,
  ) {
    this.takeId = takeId
    this.filePath = filePath
    this.mimeType = mimeType
    this.useBufferedWrite = useBufferedWrite
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

    const useBufferedWrite =
      mimeType.includes('mp4') || Capacitor.getPlatform() === 'ios'

    return new StreamingTakeWriter(takeId, filePath, mimeType, useBufferedWrite)
  }

  /** Queue a recorder chunk; on iOS/mp4 they are buffered until finalize. */
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
      const writeMime = this.mimeType.includes('mp4')
        ? NATIVE_VIDEO_MIME
        : this.mimeType
      const blob = new Blob(this.bufferChunks, { type: writeMime })
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

      const { uri } = await Filesystem.getUri({
        path: this.filePath,
        directory: Directory.Data,
      })

      return {
        filePath: this.filePath,
        videoUrl: Capacitor.convertFileSrc(uri),
      }
    }

    const { uri } = await Filesystem.getUri({
      path: this.filePath,
      directory: Directory.Data,
    })

    return {
      filePath: this.filePath,
      videoUrl: Capacitor.convertFileSrc(uri),
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
  mimeType: string,
): Promise<PersistedTakeVideo> {
  const writeMime = mimeType.includes('mp4') ? NATIVE_VIDEO_MIME : mimeType
  const normalized =
    blob.type === writeMime ? blob : new Blob([blob], { type: writeMime })

  return {
    filePath: '',
    videoUrl: URL.createObjectURL(normalized),
  }
}

export async function resolveTakePlaybackUrl(
  filePath: string,
  fallbackUrl: string,
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return fallbackUrl
  }

  let resolved = fallbackUrl
  if (filePath) {
    resolved = await toCapacitorPlaybackSrc(filePath)
  } else if (fallbackUrl) {
    resolved = await toCapacitorPlaybackSrc(fallbackUrl)
  }

  return sanitizeNativeVideoSrc(resolved) ?? resolved
}

export async function deleteTakeFile(filePath: string): Promise<void> {
  if (!filePath || !Capacitor.isNativePlatform()) return

  try {
    await Filesystem.deleteFile({
      path: filePath,
      directory: Directory.Data,
    })
  } catch (err) {
    if (isDoesNotExistError(err)) {
      return
    }
    /* file may already be gone or delete is best-effort */
  }
}
