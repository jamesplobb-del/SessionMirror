import { Capacitor } from '@capacitor/core'
import { agentDebugLog } from './agentDebugLog'
import { Directory, Filesystem } from '@capacitor/filesystem'

const TAKES_DIR = 'takes'
export const NATIVE_VIDEO_MIME = 'video/mp4'
export const NATIVE_AUDIO_MIME = 'audio/mp4'

export interface PersistedTakeVideo {
  filePath: string
  videoUrl: string
}

export interface RecordingCompletePayload {
  takeId: string
  mimeType: string
  mediaType: 'video' | 'audio'
  filePath: string
  videoUrl: string
  /** Recording length in whole seconds */
  durationSeconds: number
  /** Device orientation when recording started */
  recordingOrientation?: 'portrait' | 'landscape'
  /** Only set on web dev fallback — native recordings are already on disk */
  blob?: Blob
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('audio/mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('audio') && mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('webm')) return 'webm'
  return 'mp4'
}

export function normalizeBlobMime(mimeType: string): string {
  if (mimeType.includes('video/mp4')) return NATIVE_VIDEO_MIME
  if (mimeType.includes('audio/mp4')) return NATIVE_AUDIO_MIME
  return mimeType
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

/** In-memory cache so PiP / vault players don't hammer Filesystem.getUri. */
const playbackSrcCache = new Map<string, string>()

/** Sync read when a take was just saved — avoids a black frame while getUri resolves. */
export function readCachedPlaybackSrc(
  filePath: string,
  fallbackUrl: string,
): string | null {
  if (!Capacitor.isNativePlatform()) {
    return fallbackUrl || null
  }

  const fromFallback = sanitizeNativeVideoSrc(fallbackUrl)
  if (fromFallback) return fromFallback

  for (const key of [filePath, fallbackUrl]) {
    if (!key) continue
    const cached = playbackSrcCache.get(key)
    if (cached) {
      const safe = sanitizeNativeVideoSrc(cached)
      if (safe) return safe
    }
  }

  return null
}

function rememberPlaybackSrc(filePath: string, videoUrl: string): string {
  const safe = sanitizeNativeVideoSrc(videoUrl) ?? applyStrictPlaybackSrc(videoUrl)
  if (filePath && safe) playbackSrcCache.set(filePath, safe)
  if (videoUrl && safe) playbackSrcCache.set(videoUrl, safe)
  return safe
}

/**
 * Resolve playback URL for native takes — cached, prefers already-converted videoUrl.
 */
export async function resolveNativeVideoPlaybackSrc(
  filePath: string,
  fallbackUrl: string,
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    return fallbackUrl || null
  }

  if (isConvertedPlaybackUrl(fallbackUrl)) {
    const safe = sanitizeNativeVideoSrc(fallbackUrl)
    if (safe && filePath) rememberPlaybackSrc(filePath, safe)
    return safe
  }

  const cacheKey = filePath || fallbackUrl
  if (cacheKey) {
    const cached = playbackSrcCache.get(cacheKey)
    if (cached) {
      return sanitizeNativeVideoSrc(cached)
    }
  }

  let resolved = ''
  if (filePath) {
    resolved = await toCapacitorPlaybackSrc(filePath)
  } else if (fallbackUrl) {
    resolved = await toCapacitorPlaybackSrc(fallbackUrl)
  } else {
    return null
  }

  if (cacheKey && resolved) {
    playbackSrcCache.set(cacheKey, resolved)
  }

  return sanitizeNativeVideoSrc(resolved)
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

  const cached = playbackSrcCache.get(uriOrPath)
  if (cached) {
    return cached
  }

  let converted = uriOrPath

  if (uriOrPath.startsWith('file://')) {
    converted = Capacitor.convertFileSrc(uriOrPath)
  } else {
    const { uri } = await Filesystem.getUri({
      path: uriOrPath,
      directory: Directory.Data,
    })
    converted = Capacitor.convertFileSrc(uri)
  }

  if (converted.startsWith('file://')) {
    converted = Capacitor.convertFileSrc(converted)
  }

  playbackSrcCache.set(uriOrPath, converted)
  return converted
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
 * Streams MediaRecorder output to disk on native.
 * iOS/mp4: single blob on stop (fragment concat breaks A/V sync on long takes).
 * Android webm: append chunks incrementally.
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
      const writeMime = normalizeBlobMime(this.mimeType)
      let blob: Blob
      let usedLastChunk = false
      if (this.bufferChunks.length <= 1) {
        blob = new Blob(this.bufferChunks, { type: writeMime })
      } else {
        const primary = this.bufferChunks[this.bufferChunks.length - 1]!
        blob = new Blob([primary], { type: writeMime })
        usedLastChunk = true
      }
      // #region agent log
      agentDebugLog(
        'takeStorage.ts:finalize',
        'buffered mp4 finalize',
        {
          takeId: this.takeId,
          chunkCount: this.chunkCount,
          bufferChunks: this.bufferChunks.length,
          usedLastChunk,
          chunkSizes: this.bufferChunks.map((chunk) => chunk.size),
          totalBytes: blob.size,
        },
        'H-E',
      )
      // #endregion
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
        videoUrl: rememberPlaybackSrc(
          this.filePath,
          Capacitor.convertFileSrc(uri),
        ),
      }
    }

    const { uri } = await Filesystem.getUri({
      path: this.filePath,
      directory: Directory.Data,
    })

    return {
      filePath: this.filePath,
      videoUrl: rememberPlaybackSrc(this.filePath, Capacitor.convertFileSrc(uri)),
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
  const writeMime = normalizeBlobMime(mimeType)
  const normalized =
    blob.type === writeMime ? blob : new Blob([blob], { type: writeMime })

  return {
    filePath: '',
    videoUrl: URL.createObjectURL(normalized),
  }
}

/** Save a user-picked video to disk (native) or blob URL (web). */
export async function persistUploadedVideo(
  blob: Blob,
  takeId: string,
  mimeType: string,
): Promise<PersistedTakeVideo> {
  const writeMime = normalizeBlobMime(mimeType)
  const normalized =
    blob.type === writeMime ? blob : new Blob([blob], { type: writeMime })

  if (!Capacitor.isNativePlatform()) {
    return {
      filePath: '',
      videoUrl: URL.createObjectURL(normalized),
    }
  }

  await ensureTakesDirectory()

  const ext = extensionForMime(mimeType)
  const filePath = `${TAKES_DIR}/${takeId}.${ext}`

  await deleteTakeFile(filePath)

  const base64 = await blobToBase64(normalized)
  await Filesystem.writeFile({
    path: filePath,
    data: base64,
    directory: Directory.Data,
  })

  const { uri } = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Data,
  })

  return {
    filePath,
    videoUrl: Capacitor.convertFileSrc(uri),
  }
}

export async function resolveTakePlaybackUrl(
  filePath: string,
  fallbackUrl: string,
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return fallbackUrl
  }

  return (await resolveNativeVideoPlaybackSrc(filePath, fallbackUrl)) ?? fallbackUrl
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
