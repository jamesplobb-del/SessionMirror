import { readMultitrackAsset } from './readMultitrackAsset'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Take } from '../../types'
import type { MultitrackSession, PerformancePanelState, SheetMusicAsset } from '../types'
import { MULTITRACK_LAYOUT_PRESETS } from '../layout/layoutPresets'
import { deleteTakeFile, persistUploadedVideo, resolveTakePlaybackUrl } from '../../utils/takeStorage'

export const MULTITRACK_FILE_EXTENSION = '.btmulti'
const MAGIC = 'BTMULTI1'
const MAX_BYTES = 512 * 1024 * 1024
const MAX_MANIFEST = 1024 * 1024
type AssetEntry = { size: number; type: string }

/** Length-prefixed JSON followed by original media bytes; no base64 expansion. */
export async function buildMultitrackFile(session: MultitrackSession): Promise<Blob> {
  const copy = structuredClone(session)
  const blobs: Blob[] = []
  const entries: AssetEntry[] = []
  const sources = new Map<string, string>()
  const packed = new WeakSet<object>()
  let bytes = 0
  const pack = async (src: string, label: string, filePath?: string) => {
    const sourceKey = filePath || src
    const existing = sources.get(sourceKey)
    if (existing) return existing
    const blob = await readMultitrackAsset(src, label, filePath)
    bytes += blob.size
    if (bytes > MAX_BYTES) throw new Error('This project exceeds the 512 MB sharing limit. Use shorter recordings or split it into projects.')
    const ref = `asset:${blobs.length}`
    sources.set(sourceKey, ref); blobs.push(blob); entries.push({ size: blob.size, type: blob.type || 'application/octet-stream' })
    return ref
  }
  for (const panel of copy.panels) {
    if (panel.kind !== 'performance' || !panel.take) continue
    const take = panel.take
    if (packed.has(take)) continue
    packed.add(take)
    take.videoUrl = await pack(await resolveTakePlaybackUrl(take.filePath, take.videoUrl), `${panel.overlay ? 'Extra box' : 'Box'} ${copy.panels.indexOf(panel) + 1} (${take.name || panel.label || 'recording'})`, take.filePath)
    take.filePath = ''
    // Thumbnails are disposable previews, often backed by expired blob URLs.
    // They must never prevent sharing the original recording.
    take.thumbnailUrl = ''
  }
  if (copy.backing.kind === 'audio') copy.backing.src = await pack(copy.backing.src, copy.backing.fileName || 'Backing audio')
  for (const asset of [copy.sheetMusic.asset, ...(copy.sheetMusic.cues ?? []).map(c => c.asset)]) {
    if (asset && !packed.has(asset)) { packed.add(asset); asset.src = await pack(asset.src, asset.fileName || 'Sheet music') }
  }
  delete copy.recoveryNotice
  const manifest = new TextEncoder().encode(JSON.stringify({ format: 'besttake-multitrack', version: 1, session: copy, assets: entries }))
  if (manifest.length > MAX_MANIFEST) throw new Error('This project contains too much metadata to share.')
  const header = new Uint8Array(12)
  header.set(new TextEncoder().encode(MAGIC))
  new DataView(header.buffer).setUint32(8, manifest.length, true)
  return new Blob([header, manifest, ...blobs], { type: 'application/octet-stream' })
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid project details.')
  return value as Record<string, any>
}
function number(value: unknown, fallback: number, min = 0, max = 86400): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
function text(value: unknown, fallback = '', max = 120): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : fallback
}
function rect(value: unknown): PerformancePanelState['frame'] {
  if (value == null) return undefined
  const r = record(value)
  const widthPercent = number(r.widthPercent, 50, 5, 100), heightPercent = number(r.heightPercent, 50, 5, 100)
  return { widthPercent, heightPercent, xPercent: number(r.xPercent, 0, 0, 100 - widthPercent), yPercent: number(r.yPercent, 0, 0, 100 - heightPercent) }
}

/** Validate the entire package before creating URLs or writing any files. */
export async function readMultitrackFile(file: Blob): Promise<{ session: MultitrackSession; dispose: () => void }> {
  if (file.size < 12 || file.size > MAX_BYTES + MAX_MANIFEST + 12) throw new Error('Choose a BestTake project file under 512 MB.')
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (new TextDecoder().decode(header.slice(0, 8)) !== MAGIC) throw new Error('That is not a supported BestTake multitrack file.')
  const length = new DataView(header.buffer).getUint32(8, true)
  if (length > MAX_MANIFEST || 12 + length > file.size) throw new Error('This project file is incomplete.')
  const envelope = record(JSON.parse(await file.slice(12, 12 + length).text()))
  if (envelope.format !== 'besttake-multitrack' || envelope.version !== 1) throw new Error('This project needs a newer version of BestTake.')
  if (!Array.isArray(envelope.assets) || envelope.assets.length > 256) throw new Error('Invalid project attachments.')
  let offset = 12 + length
  const blobs: Blob[] = envelope.assets.map((entry: unknown) => {
    const a = record(entry)
    if (!Number.isSafeInteger(a.size) || a.size < 0 || offset + a.size > file.size || typeof a.type !== 'string' || a.type.length > 100) throw new Error('A project attachment is incomplete.')
    const blob = file.slice(offset, offset + a.size, a.type); offset += a.size; return blob
  })
  if (offset !== file.size) throw new Error('Invalid project file length.')
  const assetIndex = (src: unknown) => {
    if (typeof src !== 'string' || !/^asset:\d+$/.test(src)) throw new Error('A project attachment is missing.')
    const i = Number(src.slice(6))
    if (!blobs[i]) throw new Error('A project attachment is missing.')
    return i
  }
  const s = record(envelope.session), practice = record(s.practice), sheet = record(s.sheetMusic), backing = record(s.backing)
  if (!MULTITRACK_LAYOUT_PRESETS.some(p => p.id === s.layoutId) || !Array.isArray(s.panels) || s.panels.length < 1 || s.panels.length > 16) throw new Error('This project has an unsupported layout.')
  const parseSheet = (value: unknown): SheetMusicAsset => {
    const a = record(value); assetIndex(a.src)
    if (!/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(a.mimeType)) throw new Error('Unsupported sheet music attachment.')
    return { src: a.src, mimeType: a.mimeType, fileName: text(a.fileName, 'Sheet music'), x: number(a.x, .5, -10, 10), y: number(a.y, .5, -10, 10), scale: number(a.scale, 1, .1, 20), contentMode: a.contentMode === 'fit' ? 'fit' : 'fill', framePosition: ['top','bottom','left','right'].includes(a.framePosition) ? a.framePosition : undefined, frameScale: number(a.frameScale, 1, .1, 20), scrollEndY: typeof a.scrollEndY === 'number' ? number(a.scrollEndY, 0, -100, 100) : undefined, scrollDurationSec: typeof a.scrollDurationSec === 'number' ? number(a.scrollDurationSec, 1, .1) : undefined }
  }
  const takes = new Map<string, Take>()
  const panels: PerformancePanelState[] = s.panels.map((value: unknown, i: number) => {
    const p = record(value)
    if (p.kind !== 'performance') throw new Error('Unsupported project box.')
    let take: Take | null = null
    if (p.take != null) {
      const t = record(p.take); assetIndex(t.videoUrl)
      if (t.thumbnailUrl) assetIndex(t.thumbnailUrl)
      if (typeof t.videoMimeType !== 'string' || !/^(video|audio)\/[a-z0-9.+;-]+/i.test(t.videoMimeType)) throw new Error('Unsupported recording type.')
      const key = t.videoUrl
      take = takes.get(key) ?? { id: `collab-${crypto.randomUUID()}`, name: text(t.name, 'Shared part'), videoUrl: t.videoUrl, filePath: '', videoMimeType: t.videoMimeType.slice(0,100), thumbnailUrl: t.thumbnailUrl || '', timestamp: number(t.timestamp, Date.now(), 0, Number.MAX_SAFE_INTEGER), rating: 0, notes: text(t.notes, '', 4000), duration: typeof t.duration === 'number' ? number(t.duration, 0) : undefined, mediaType: t.mediaType === 'audio' ? 'audio' : 'video', mirrorPlayback: t.mirrorPlayback === true, enhancerBaked: t.enhancerBaked === true, recordingOrientation: t.recordingOrientation === 'landscape' ? 'landscape' : 'portrait' }
      for (const key of ['timelineOffsetMs', 'recordingBpm', 'performanceStartBeats', 'performanceStartOffsetBeats', 'performanceStartSeconds'] as const) {
        if (typeof t[key] === 'number') take[key] = number(t[key], 0, -86400000, 86400000)
      }
      takes.set(key, take)
      if (t.playbackGainMetadata) {
        const gain = record(t.playbackGainMetadata)
        take.playbackGainMetadata = { targetActiveRmsDb: number(gain.targetActiveRmsDb,-18,-100,24), peakCeilingDb: number(gain.peakCeilingDb,-1,-100,0), measuredActiveRmsDb: number(gain.measuredActiveRmsDb,-18,-100,24), measuredPeakDb: number(gain.measuredPeakDb,-1,-100,24), suggestedGainDb: number(gain.suggestedGainDb,0,-24,24), nativePlaybackGainDb: number(gain.nativePlaybackGainDb,0,-24,24) }
      }
    }
    const panel: PerformancePanelState = { kind: 'performance', id: i < 12 ? String.fromCharCode(97+i) : `extra-${i}`, take, label: text(p.label), frame: rect(p.frame), overlay: rect(p.overlay), hidden: p.hidden === true, muted: p.muted === true, sectionAudio: p.sectionAudio === true, volume: number(p.volume, 1, 0, 1), timelineOffsetMs: typeof p.timelineOffsetMs === 'number' ? number(p.timelineOffsetMs, 0, -86400000, 86400000) : undefined }
    for (const key of ['trimStartSec','trimEndSec','sectionStartSec','sectionEndSec'] as const) if (typeof p[key] === 'number') panel[key] = number(p[key], 0)
    if (panel.trimEndSec !== undefined && panel.trimEndSec <= (panel.trimStartSec ?? 0)) throw new Error('A box has an invalid trim range.')
    if (panel.sectionEndSec !== undefined && panel.sectionEndSec <= (panel.sectionStartSec ?? 0)) throw new Error('A box has an invalid section range.')
    return panel
  })
  if (panels.filter(p => !p.overlay).length > 12 || panels.filter(p => p.overlay).length > 4) throw new Error('Too many boxes in this project.')
  const session: MultitrackSession = { projectId: crypto.randomUUID(), name: text(s.name, 'Shared performance'), layoutId: s.layoutId, aspectRatio: ['9:16','16:9','1:1'].includes(s.aspectRatio) ? s.aspectRatio : '9:16', endSec: typeof s.endSec === 'number' ? number(s.endSec, 1, .1) : undefined, panels, practice: { bpm: number(practice.bpm,120,40,300), meter: /^(?:[1-9]|1[0-2])\/(?:2|4|8|16)$/.test(practice.meter) ? practice.meter : '4/4', clickSound: text(practice.clickSound,'classic'), countInBars: Math.round(number(practice.countInBars,1,0,8)), showMetronome: practice.showMetronome === true, showPitch: practice.showPitch === true, practiceOverlayEnabled: practice.practiceOverlayEnabled !== false, clickEnabled: practice.clickEnabled !== false }, sheetMusic: { kind: 'sheet-music', id: 'music', asset: sheet.asset ? parseSheet(sheet.asset) : null, cues: [] }, backing: { kind: 'none', volume: number(backing.volume,.85,0,1) } }
  if (sheet.cues != null && (!Array.isArray(sheet.cues) || sheet.cues.length > 100)) throw new Error('Invalid sheet music cues.')
  session.sheetMusic.cues = (sheet.cues ?? []).map((value: unknown) => { const c = record(value); return { id: crypto.randomUUID(), startSec: number(c.startSec,0), asset: parseSheet(c.asset) } })
  if (backing.kind === 'audio') { assetIndex(backing.src); session.backing = { kind: 'audio', src: backing.src, fileName: text(backing.fileName,'Backing audio'), mimeType: text(backing.mimeType,'audio/mp4'), volume: number(backing.volume,.85,0,1) } }
  else if (backing.kind === 'youtube') {
    const url = new URL(backing.embedUrl)
    if (url.protocol !== 'https:' || !['www.youtube.com','www.youtube-nocookie.com'].includes(url.hostname) || !/^\/embed\/[\w-]{11}$/.test(url.pathname)) throw new Error('Invalid YouTube reference.')
    session.backing = { kind: 'youtube', embedUrl: url.href, label: text(backing.label,'YouTube'), volume: number(backing.volume,.85,0,1) }
  } else if (backing.kind !== 'none') throw new Error('Unsupported backing track.')
  const urls: string[] = []
  const unpack = (src: string) => { const url = URL.createObjectURL(blobs[assetIndex(src)]); urls.push(url); return url }
  const nativeFiles: string[] = []
  const dispose = () => { urls.forEach(url => URL.revokeObjectURL(url)); nativeFiles.forEach(path => { void deleteTakeFile(path) }) }
  try {
    for (const take of takes.values()) {
      const media = blobs[assetIndex(take.videoUrl)]
      if (Capacitor.isNativePlatform()) { Object.assign(take, await persistUploadedVideo(media, take.id, take.videoMimeType)); nativeFiles.push(take.filePath) }
      else take.videoUrl = unpack(take.videoUrl)
      if (take.thumbnailUrl) take.thumbnailUrl = unpack(take.thumbnailUrl)
    }
    if (session.backing.kind === 'audio') session.backing.src = unpack(session.backing.src)
    for (const a of [session.sheetMusic.asset, ...session.sheetMusic.cues!.map(c => c.asset)]) if (a) a.src = unpack(a.src)
    return { session, dispose }
  } catch (error) { dispose(); throw error }
}

export async function shareMultitrackFile(session: MultitrackSession): Promise<void> {
  const blob = await buildMultitrackFile(session)
  const name = (session.name || 'Performance').replace(/[^\w -]/g,'').trim().slice(0,60) || 'Performance'
  const fileName = `${name}${MULTITRACK_FILE_EXTENSION}`
  if (Capacitor.isNativePlatform()) {
    // Chunk writes keep the native bridge from receiving a whole video as base64.
    const path = `multitrack-share-${crypto.randomUUID()}${MULTITRACK_FILE_EXTENSION}`
    // Keep the cache file available after the share sheet closes: receiving
    // apps can copy it asynchronously. The OS can evict these files later.
    for (let offset = 0; offset < blob.size; offset += 3 * 1024 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 3 * 1024 * 1024).arrayBuffer())
      let binary = ''; for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192))
      const options = { path, directory: Directory.Cache, data: btoa(binary) }
      if (!offset) await Filesystem.writeFile(options); else await Filesystem.appendFile(options)
    }
    const {uri} = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({ title: name, files: [uri], dialogTitle: 'Share editable project' })
  } else {
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
