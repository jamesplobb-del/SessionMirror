/** Session-scoped blob storage for multitrack backing and box recordings. */

const blobStore = new Map<string, Blob>()

export function createMultitrackKey(prefix: string): string {
  return `multitrack-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function saveMultitrackBlob(key: string, blob: Blob): Promise<void> {
  blobStore.set(key, blob)
}

export async function loadMultitrackBlob(key: string): Promise<Blob | null> {
  return blobStore.get(key) ?? null
}
