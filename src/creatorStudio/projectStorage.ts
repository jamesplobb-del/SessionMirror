import type { CreatorStudioBackingTrack, CreatorStudioPersistedState } from './types'

const STATE_PREFIX = 'creator-studio:project:'
const DB_NAME = 'creator-studio'
const BLOB_STORE = 'assets'
const LEGACY_BLOB_STORE = 'backing-tracks'

function storageKey(takeId: string): string {
  return `${STATE_PREFIX}${takeId}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE)
      }
      if (!db.objectStoreNames.contains(LEGACY_BLOB_STORE)) {
        db.createObjectStore(LEGACY_BLOB_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

export function loadCreatorStudioProject(takeId: string): CreatorStudioPersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(takeId))
    if (!raw) return null
    return JSON.parse(raw) as CreatorStudioPersistedState
  } catch {
    return null
  }
}

export function saveCreatorStudioProject(
  takeId: string,
  state: CreatorStudioPersistedState,
): void {
  try {
    localStorage.setItem(storageKey(takeId), JSON.stringify(state))
  } catch (error) {
    console.warn('[CreatorStudio] failed to persist project', error)
  }
}

async function putBlob(storeName: string, key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.objectStore(storeName).put(blob, key)
  })
  db.close()
}

async function getBlob(storeName: string, key: string): Promise<Blob | null> {
  const db = await openDb()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(key)
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
  db.close()
  return blob
}

async function deleteBlob(storeName: string, key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    tx.objectStore(storeName).delete(key)
  })
  db.close()
}

export async function saveStudioAssetBlob(storageKey: string, blob: Blob): Promise<void> {
  await putBlob(BLOB_STORE, storageKey, blob)
}

export async function loadStudioAssetBlob(storageKey: string): Promise<Blob | null> {
  const asset = await getBlob(BLOB_STORE, storageKey)
  if (asset) return asset
  return getBlob(LEGACY_BLOB_STORE, storageKey)
}

export async function deleteStudioAssetBlob(storageKey: string): Promise<void> {
  await deleteBlob(BLOB_STORE, storageKey)
  await deleteBlob(LEGACY_BLOB_STORE, storageKey)
}

export const saveBackingTrackBlob = saveStudioAssetBlob
export const loadBackingTrackBlob = loadStudioAssetBlob
export const deleteBackingTrackBlob = deleteStudioAssetBlob

export function createStudioAssetStorageKey(takeId: string, kind: 'backing' | 'sheet'): string {
  return `${kind}-${takeId}-${Date.now()}`
}

export const createBackingTrackStorageKey = (takeId: string) =>
  createStudioAssetStorageKey(takeId, 'backing')

export function toPersistedState(
  state: CreatorStudioPersistedState & { takeName?: string; selectedTool?: string },
): CreatorStudioPersistedState {
  const { takeId, aspectRatio, trim, objects, audio } = state
  return {
    takeId,
    aspectRatio,
    trim,
    objects: objects.map((object) => {
      if (object.kind === 'sheetMusic') {
        return { ...object, sourceUrl: '' }
      }
      return object
    }),
    audio: {
      ...audio,
      backingTrack: audio.backingTrack
        ? ({
            name: audio.backingTrack.name,
            mimeType: audio.backingTrack.mimeType,
            storageKey: audio.backingTrack.storageKey,
            trim: audio.backingTrack.trim,
            syncOffsetMs: audio.backingTrack.syncOffsetMs,
            volume: audio.backingTrack.volume,
          } satisfies CreatorStudioBackingTrack)
        : null,
    },
  }
}
