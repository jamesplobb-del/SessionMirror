import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

export const TAKES_DIR = 'takes'
export const THUMBNAIL_DIR = 'thumbnails'
export const LIBRARY_DIR = 'library'

let initPromise: Promise<void> | null = null
let initialized = false

function serializeError(err: unknown): string {
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export function isFilesystemAlreadyExistsError(err: unknown): boolean {
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

export function isFilesystemMissingError(err: unknown): boolean {
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

async function ensureDirectory(path: string): Promise<void> {
  try {
    await Filesystem.stat({
      path,
      directory: Directory.Data,
    })
    return
  } catch {
    /* directory missing — create below */
  }

  try {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive: true,
    })
  } catch (err) {
    if (!isFilesystemAlreadyExistsError(err)) {
      /* non-fatal — writes may still succeed if another caller created it */
    }
  }
}

/** Create app data directories once at boot. Safe to call multiple times. */
export async function initAppFilesystem(): Promise<void> {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    await ensureDirectory(TAKES_DIR)
    await ensureDirectory(THUMBNAIL_DIR)
    await ensureDirectory(LIBRARY_DIR)
    initialized = true
  })()

  try {
    await initPromise
  } catch {
    initPromise = null
  }
}

export function isAppFilesystemInitialized(): boolean {
  return initialized
}

/** True when a file exists under Capacitor Directory.Data. */
export async function nativeDataFileExists(relativePath: string): Promise<boolean> {
  if (!relativePath) return false
  if (!Capacitor.isNativePlatform()) return true

  try {
    await Filesystem.stat({
      path: relativePath,
      directory: Directory.Data,
    })
    return true
  } catch {
    return false
  }
}
