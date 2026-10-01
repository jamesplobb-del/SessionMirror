export interface WebPracticeChartRecord {
  blob: Blob
  mimeType: 'application/pdf' | `image/${string}`
  fileName: string
}

const DATABASE_NAME = 'besttake-practice-charts'
const DATABASE_VERSION = 1
const STORE_NAME = 'charts'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser music storage is unavailable.'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser music storage.'))
    request.onblocked = () => reject(new Error('Browser music storage is busy. Close other BestTake tabs and try again.'))
  })
}

export async function loadWebPracticeChart(projectId: string): Promise<WebPracticeChartRecord | null> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(projectId)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error ?? new Error('Could not read browser music storage.'))
    })
  } finally { db.close() }
}

export async function saveWebPracticeChart(projectId: string, record: WebPracticeChartRecord): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(record, projectId)
      transaction.oncomplete = () => resolve()
      transaction.onabort = transaction.onerror = () => reject(
        transaction.error ?? new Error('Could not save music in browser storage.'),
      )
    })
  } finally { db.close() }
}

export async function deleteWebPracticeChart(projectId: string): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(projectId)
      transaction.oncomplete = () => resolve()
      transaction.onabort = transaction.onerror = () => reject(
        transaction.error ?? new Error('Could not remove music from browser storage.'),
      )
    })
  } finally { db.close() }
}
