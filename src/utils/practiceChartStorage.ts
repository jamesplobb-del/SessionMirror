import { Share } from '@capacitor/share'
import { requirePlus } from '../plus/plusAccess'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { CHARTS_DIR, initAppFilesystem, isFilesystemMissingError } from './filesystemInit'
import { deleteWebPracticeChart, loadWebPracticeChart, saveWebPracticeChart } from './webPracticeChartStorage'
import { safeRandomUUID } from './uuid'

/**
 * The music for one practice item, kept beside that item's takes.
 *
 * One score per practice folder keeps the document, takes, and best take
 * together. The Music library and routines both browse these same folders.
 */

export interface PracticeChart {
  projectId: string
  filePath: string
  /** For images. PDFs are drawn from `bytes`, not handed to the WebView. */
  objectUrl: string
  /** PDF file contents, kept so pages can be rendered and re-rendered. */
  bytes: Uint8Array | null
  mimeType: 'application/pdf' | `image/${string}`
  fileName: string
  /** Changes only when new score bytes are committed; absent on legacy scores. */
  attachmentId?: string
}

const charts = new Map<string, PracticeChart>()
export const PRACTICE_CHART_CHANGED = 'besttake:practice-chart-changed'
function notifyChartChanged(projectId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PRACTICE_CHART_CHANGED, { detail: projectId }))
}
const metadataKey = (id: string) => `besttake:practice-chart:v1:${id}`
export const chartVisibleKey = (id: string) => `besttake:practice-chart-visible:v1:${id}`
const viewKey = (id: string) => `besttake:practice-chart-view:v1:${id}`

export const isChartVisible = (id: string): boolean => localStorage.getItem(chartVisibleKey(id)) !== '0'

export function setChartVisible(id: string, visible: boolean): void {
  localStorage.setItem(chartVisibleKey(id), visible ? '1' : '0')
}

const extensions: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}

/** Accept existing canonical files and this item's versioned native files only. */
function isChartFilePath(value: unknown, id: string, mimeType: string): value is string {
  if (typeof value !== 'string') return false
  const base = `${CHARTS_DIR}/${encodeURIComponent(id)}`
  const extension = extensions[mimeType]
  if (value === `${base}.${extension}`) return true
  const prefix = `${base}.v-`
  const suffix = `.${extension}`
  return value.startsWith(prefix) && value.endsWith(suffix) &&
    /^[a-zA-Z0-9-]{1,80}$/.test(value.slice(prefix.length, -suffix.length))
}

function metadata(id: string): Omit<PracticeChart, 'projectId' | 'objectUrl' | 'bytes'> | null {
  const raw = localStorage.getItem(metadataKey(id))
  if (!raw) return null
  let value: { filePath?: unknown; mimeType?: unknown; fileName?: unknown; attachmentId?: unknown }
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value.mimeType !== 'string' || !Object.hasOwn(extensions, value.mimeType) ||
    typeof value.fileName !== 'string' ||
    !isChartFilePath(value.filePath, id, value.mimeType) ||
    (value.attachmentId !== undefined && (typeof value.attachmentId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.attachmentId)))) return null
  return { filePath: value.filePath, mimeType: value.mimeType as PracticeChart['mimeType'], fileName: value.fileName,
    ...(typeof value.attachmentId === 'string' ? { attachmentId: value.attachmentId } : {}) }
}

/** A delayed disk read must not publish an attachment that was replaced meanwhile. */
function isCurrentChart(projectId: string, saved: Pick<PracticeChart, 'filePath' | 'attachmentId'>): boolean {
  const current = metadata(projectId)
  return current?.filePath === saved.filePath && current.attachmentId === saved.attachmentId
}

/**
 * Synchronous "does this item have music", for anything that has to decide
 * without waiting on the disk — the routine builder listing its steps, or the
 * Music ball choosing between "Add music" and a page count.
 */
export function hasPracticeChart(projectId: string): boolean {
  if (charts.has(projectId)) return true
  return metadata(projectId) !== null
}

export function practiceChartName(projectId: string): string | null {
  return charts.get(projectId)?.fileName ?? metadata(projectId)?.fileName ?? null
}

export async function loadPracticeChart(projectId: string): Promise<PracticeChart | null> {
  if (charts.has(projectId)) return charts.get(projectId)!
  const saved = metadata(projectId)
  if (!saved) return null
  if (!Capacitor.isNativePlatform()) {
    const record = await loadWebPracticeChart(projectId)
    if (!isCurrentChart(projectId, saved)) return loadPracticeChart(projectId)
    if (!record || record.mimeType !== saved.mimeType || !(record.blob instanceof Blob)) {
      localStorage.removeItem(metadataKey(projectId))
      notifyChartChanged(projectId)
      return null
    }
    const bytes = new Uint8Array(await record.blob.arrayBuffer())
    if (!isCurrentChart(projectId, saved)) return loadPracticeChart(projectId)
    const chart: PracticeChart = {
      ...saved,
      projectId,
      bytes: saved.mimeType === 'application/pdf' ? bytes : null,
      objectUrl: saved.mimeType === 'application/pdf'
        ? ''
        : URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: saved.mimeType })),
    }
    charts.set(projectId, chart)
    return chart
  }
  try {
    const { data } = await Filesystem.readFile({ path: saved.filePath, directory: Directory.Data })
    const bytes = typeof data === 'string'
      ? decodeBase64(data)
      : new Uint8Array(await data.arrayBuffer())
    if (!isCurrentChart(projectId, saved)) return loadPracticeChart(projectId)
    const chart: PracticeChart = {
      ...saved,
      projectId,
      bytes: saved.mimeType === 'application/pdf' ? bytes : null,
      objectUrl: saved.mimeType === 'application/pdf'
        ? ''
        : URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: saved.mimeType })),
    }
    charts.set(projectId, chart)
    return chart
  } catch (error) {
    if (!isCurrentChart(projectId, saved)) return loadPracticeChart(projectId)
    if (isFilesystemMissingError(error)) return null
    throw error
  }
}

export async function savePracticeChart(projectId: string, file: File): Promise<PracticeChart> {
  if (!requirePlus('music')) throw new Error('Unlock Plus to import music.')
  if (!Object.hasOwn(extensions, file.type)) throw new Error('Choose a PDF, JPEG, PNG, or WebP image.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Prepare the in-memory image before committing storage, so a URL failure
  // cannot report a failed import after the replacement has become durable.
  const objectUrl = file.type === 'application/pdf' ? '' : URL.createObjectURL(file)
  const attachmentId = safeRandomUUID()
  let filePath = `${CHARTS_DIR}/${encodeURIComponent(projectId)}.${extensions[file.type]}`
  let previousNativeFilePath: string | null = null
  try {
    if (Capacitor.isNativePlatform()) {
      await initAppFilesystem()
      const previous = metadata(projectId)
      filePath = `${CHARTS_DIR}/${encodeURIComponent(projectId)}.v-${attachmentId}.${extensions[file.type]}`
      try {
        // Never overwrite the currently committed score. The metadata pointer
        // is the commit: interrupted/failed writes leave its old bytes intact.
        await Filesystem.writeFile({ path: filePath, data: encodeBase64(bytes), directory: Directory.Data })
        localStorage.setItem(metadataKey(projectId), JSON.stringify({ filePath, mimeType: file.type, fileName: file.name, attachmentId }))
      } catch (error) {
        // writeFile can leave partial bytes even when it rejects.
        await Filesystem.deleteFile({ path: filePath, directory: Directory.Data }).catch(() => {})
        throw error
      }
      previousNativeFilePath = previous?.filePath ?? null
    } else {
      const previous = await loadWebPracticeChart(projectId)
      await saveWebPracticeChart(projectId, {
        blob: new Blob([toArrayBuffer(bytes)], { type: file.type }),
        mimeType: file.type as PracticeChart['mimeType'],
        fileName: file.name,
      })
      try {
        localStorage.setItem(metadataKey(projectId), JSON.stringify({ filePath, mimeType: file.type, fileName: file.name, attachmentId }))
      } catch (error) {
        try {
          if (previous) await saveWebPracticeChart(projectId, previous)
          else await deleteWebPracticeChart(projectId)
        } catch {
          throw new Error('Music could not be saved, and its previous version could not be restored.')
        }
        throw error
      }
    }
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    throw error
  }
  const chart: PracticeChart = {
    projectId,
    filePath,
    bytes: file.type === 'application/pdf' ? bytes : null,
    objectUrl,
    mimeType: file.type as PracticeChart['mimeType'],
    fileName: file.name,
    attachmentId,
  }
  const old = charts.get(projectId)
  charts.set(projectId, chart)
  if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl)
  try { setChartVisible(projectId, true) }
  catch { /* Visibility is optional; the imported score is already durable. */ }
  // New music is a new part: start at the first page rather than wherever the
  // player had scrolled the one it replaced.
  saveChartView(projectId, { ...loadChartView(projectId), fraction: 0 })
  notifyChartChanged(projectId)
  if (previousNativeFilePath && previousNativeFilePath !== filePath) {
    // Publish the committed cache before awaiting optional cleanup. A cleanup
    // failure must not turn a successful replacement into a reported failure.
    await Filesystem.deleteFile({ path: previousNativeFilePath, directory: Directory.Data }).catch(() => {})
  }
  return chart
}

export async function deletePracticeChart(projectId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const saved = metadata(projectId)
    if (saved) {
      try { await Filesystem.deleteFile({ path: saved.filePath, directory: Directory.Data }) }
      catch (error) { if (!isFilesystemMissingError(error)) throw error }
    }
    localStorage.removeItem(metadataKey(projectId))
  } else {
    const previousMetadata = localStorage.getItem(metadataKey(projectId))
    localStorage.removeItem(metadataKey(projectId))
    try { await deleteWebPracticeChart(projectId) }
    catch (error) {
      if (previousMetadata !== null) {
        try { localStorage.setItem(metadataKey(projectId), previousMetadata) }
        catch {
          throw new Error('Music is still stored on this device, but its library entry could not be restored. Keep this page open and retry the delete; the loaded score remains available.')
        }
      }
      throw error
    }
  }
  try { localStorage.removeItem(viewKey(projectId)) }
  catch { /* The durable score is gone; a stale reading position is harmless. */ }
  try { setChartVisible(projectId, true) }
  catch { /* Visibility is optional and must not retain a deleted chart in memory. */ }
  const old = charts.get(projectId)
  if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl)
  charts.delete(projectId)
  notifyChartChanged(projectId)
}

/* ---- How this part is being read --------------------------------------- */

export interface ChartView {
  /**
   * `auto` until the player picks one: a landscape iPad opens on a two-page
   * spread, anything narrower on a single page.
   */
  fit: 'auto' | 'page' | 'spread' | 'width'
  /** Turn half a page at a time, so the music you are reading stays up. */
  halfTurn: boolean
  /** Reading position as a fraction of the whole part, not a pixel offset. */
  fraction: number
}

export const DEFAULT_CHART_VIEW: ChartView = { fit: 'auto', halfTurn: false, fraction: 0 }

export function loadChartView(projectId: string): ChartView {
  try {
    const raw = localStorage.getItem(viewKey(projectId))
    if (!raw) return DEFAULT_CHART_VIEW
    const parsed = JSON.parse(raw) as Partial<ChartView>
    return {
      fit: parsed.fit === 'width' || parsed.fit === 'spread' || parsed.fit === 'page'
        ? parsed.fit
        : 'auto',
      halfTurn: parsed.halfTurn === true,
      fraction: Number.isFinite(Number(parsed.fraction))
        ? Math.min(1, Math.max(0, Number(parsed.fraction)))
        : 0,
    }
  } catch {
    return DEFAULT_CHART_VIEW
  }
}

export function saveChartView(projectId: string, view: ChartView): void {
  try {
    localStorage.setItem(viewKey(projectId), JSON.stringify({
      fit: view.fit, halfTurn: view.halfTurn, fraction: Math.round(view.fraction * 1e4) / 1e4,
    }))
  } catch {
    /* private mode / quota */
  }
}

/* ---- base64, in chunks a large part will survive ------------------------ */

const CHUNK = 0x8000

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data.includes(',') ? data.slice(data.indexOf(',') + 1) : data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** File retrieval stays free after a trial, even while the practice reader is locked. */
export async function exportPracticeChart(projectId: string): Promise<void> {
  const chart = await loadPracticeChart(projectId)
  if (!chart) throw new Error('This music file is no longer available.')
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.getUri({ path: chart.filePath, directory: Directory.Data })
    await Share.share({ title: chart.fileName, files: [uri] })
    return
  }
  const url = chart.bytes ? URL.createObjectURL(new Blob([toArrayBuffer(chart.bytes)], { type: chart.mimeType })) : chart.objectUrl
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = chart.fileName
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  if (chart.bytes) window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
