import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { CHARTS_DIR, initAppFilesystem, isFilesystemMissingError } from './filesystemInit'

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
}

const charts = new Map<string, PracticeChart>()
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

function metadata(id: string): Omit<PracticeChart, 'projectId' | 'objectUrl' | 'bytes'> | null {
  const raw = localStorage.getItem(metadataKey(id))
  if (!raw) return null
  let value: { filePath?: unknown; mimeType?: unknown; fileName?: unknown }
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value.mimeType !== 'string' || !Object.hasOwn(extensions, value.mimeType) ||
    typeof value.fileName !== 'string' ||
    value.filePath !== `${CHARTS_DIR}/${encodeURIComponent(id)}.${extensions[value.mimeType]}`) return null
  return { filePath: value.filePath as string, mimeType: value.mimeType as PracticeChart['mimeType'], fileName: value.fileName }
}

/**
 * Synchronous "does this item have music", for anything that has to decide
 * without waiting on the disk — the routine builder listing its steps, or the
 * Music ball choosing between "Add music" and a page count.
 */
export function hasPracticeChart(projectId: string): boolean {
  if (charts.has(projectId)) return true
  return Capacitor.isNativePlatform() && metadata(projectId) !== null
}

export function practiceChartName(projectId: string): string | null {
  return charts.get(projectId)?.fileName ?? metadata(projectId)?.fileName ?? null
}

export async function loadPracticeChart(projectId: string): Promise<PracticeChart | null> {
  if (charts.has(projectId)) return charts.get(projectId)!
  if (!Capacitor.isNativePlatform()) return null
  const saved = metadata(projectId)
  if (!saved) return null
  try {
    const { data } = await Filesystem.readFile({ path: saved.filePath, directory: Directory.Data })
    const bytes = typeof data === 'string'
      ? decodeBase64(data)
      : new Uint8Array(await data.arrayBuffer())
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
    if (isFilesystemMissingError(error)) return null
    throw error
  }
}

export async function savePracticeChart(projectId: string, file: File): Promise<PracticeChart> {
  if (!Object.hasOwn(extensions, file.type)) throw new Error('Choose a PDF, JPEG, PNG, or WebP image.')
  const old = charts.get(projectId)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let filePath = ''
  if (Capacitor.isNativePlatform()) {
    await initAppFilesystem()
    const previous = metadata(projectId)
    filePath = `${CHARTS_DIR}/${encodeURIComponent(projectId)}.${extensions[file.type]}`
    await Filesystem.writeFile({ path: filePath, data: encodeBase64(bytes), directory: Directory.Data })
    localStorage.setItem(metadataKey(projectId), JSON.stringify({ filePath, mimeType: file.type, fileName: file.name }))
    if (previous && previous.filePath !== filePath) {
      await Filesystem.deleteFile({ path: previous.filePath, directory: Directory.Data }).catch(() => {})
    }
  }
  const chart: PracticeChart = {
    projectId,
    filePath,
    bytes: file.type === 'application/pdf' ? bytes : null,
    objectUrl: file.type === 'application/pdf' ? '' : URL.createObjectURL(file),
    mimeType: file.type as PracticeChart['mimeType'],
    fileName: file.name,
  }
  charts.set(projectId, chart)
  if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl)
  setChartVisible(projectId, true)
  // New music is a new part: start at the first page rather than wherever the
  // player had scrolled the one it replaced.
  saveChartView(projectId, { ...loadChartView(projectId), fraction: 0 })
  return chart
}

export async function deletePracticeChart(projectId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const saved = metadata(projectId)
    if (saved) {
      try { await Filesystem.deleteFile({ path: saved.filePath, directory: Directory.Data }) }
      catch (error) { if (!isFilesystemMissingError(error)) throw error }
    }
  }
  localStorage.removeItem(metadataKey(projectId))
  localStorage.removeItem(viewKey(projectId))
  setChartVisible(projectId, true)
  const old = charts.get(projectId)
  if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl)
  charts.delete(projectId)
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
