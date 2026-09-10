/** Durable blobs for the auto-saved canvas, including iOS's persistent WebView store. */
const saved = new Map<string, Promise<string>>()
const prefix = 'multitrack-asset:'
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('besttake-multitrack-assets', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('assets')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function put(id: string, blob: Blob): Promise<void> {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite')
      tx.objectStore('assets').put(blob, id)
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
export async function persistAsset(src: string): Promise<string> {
  if (src.startsWith(prefix)) return src
  const existing = saved.get(src)
  if (existing) return existing
  const task = (async () => {
    const response = await fetch(src)
    if (!response.ok) throw new Error('Could not save the imported file')
    const blob = await response.blob()
    const id = crypto.randomUUID()
    await put(id, blob)
    return prefix + id
  })()
  saved.set(src, task)
  try { return await task } catch (error) { saved.delete(src); throw error }
}
export async function restoreAsset(src: string): Promise<string | null> {
  if (typeof src !== 'string' || !src.startsWith(prefix)) return null // Never trust an old session's temporary URL.
  const db = await database()
  try {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction('assets').objectStore('assets').get(src.slice(prefix.length))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (!(blob instanceof Blob)) return null
    const url = URL.createObjectURL(blob)
    saved.set(url, Promise.resolve(src))
    return url
  } finally { db.close() }
}
