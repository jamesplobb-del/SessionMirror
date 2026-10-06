import { normalizeLayoutStyle } from '../layout/quietWorkspaceLayout'
import { persistAsset, restoreAsset } from './multitrackAssets'
import { recordingCountInBars } from '../recording/multitrackCountIn'
import type { Take } from '../../types'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { MULTITRACK_PANEL_SLOT_IDS, getLayoutPreset } from '../layout/layoutPresets'
import type {
  MultitrackBackingTrack,
  MultitrackPracticeSettings,
  MultitrackSession,
} from '../types'

/** Auto-saved canvas metadata; imported blobs are committed before their references. */

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

const STORAGE_KEY = 'sm.multitrack.session.v1'
const PROJECTS_KEY = 'sm.multitrack.projects.v2'
const ACTIVE_KEY = 'sm.multitrack.active.v2'
export interface MultitrackProjectSummary { id: string; name: string; updatedAt: number }
export function listMultitrackProjects(): MultitrackProjectSummary[] {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]') } catch { return [] }
}
function storageKey(id?: string) { return id ? `${STORAGE_KEY}.${id}` : STORAGE_KEY }
export function selectMultitrackProject(id: string) { localStorage.setItem(ACTIVE_KEY, id) }


interface PersistedMultitrackSession {
  layoutId: string
  projectId?: string
  name?: string
  aspectRatio?: MultitrackSession['aspectRatio']
  layoutStyle?: MultitrackSession['layoutStyle']
  endSec?: number
  panelIds?: string[]
  panelDetails?: Array<Pick<import('../types').PerformancePanelState, 'label' | 'frame' | 'overlay' | 'hidden' | 'timelineOffsetMs' | 'sectionAudio' | 'mirrored'>>
  /** Take id per performance panel slot, aligned with the layout's panel order. */
  panelTakeIds: (string | null)[]
  /** Received parts belong to this project, independently of the local Vault. */
  sharedTakes?: Take[]
  /** Mixer state per panel slot, aligned with panelTakeIds. */
  panelVolumes?: (number | null)[]
  panelMutes?: boolean[]
  /** Trim per panel slot: [startSec, endSec|null]. */
  panelTrims?: ([number, number | null] | null)[]
  /** Section window per panel slot: [startSec|null, endSec|null]. */
  panelSections?: ([number | null, number | null] | null)[]
  practice: MultitrackPracticeSettings
  backing: MultitrackBackingTrack | null
  sheetMusic?: MultitrackSession['sheetMusic']
}

export async function saveMultitrackSession(session: MultitrackSession): Promise<void> {
  try {
    const performancePanels = session.panels.filter(
      (panel) => panel.kind === 'performance',
    )
    const persisted: PersistedMultitrackSession = {
      layoutId: session.layoutId,
      projectId: session.projectId,
      name: session.name,
      aspectRatio: session.aspectRatio,
      layoutStyle: normalizeLayoutStyle(session.layoutStyle),
      endSec: session.endSec,
      panelIds: performancePanels.map(p => p.id),
      panelDetails: performancePanels.map(p => ({ frame: p.frame, sectionAudio: p.sectionAudio, label: p.label, overlay: p.overlay, hidden: p.hidden, timelineOffsetMs: p.timelineOffsetMs, mirrored: p.mirrored })),
      panelTakeIds: performancePanels.map((panel) =>
        panel.kind === 'performance' ? panel.take?.id ?? panel.missingTakeId ?? null : null,
      ),
      sharedTakes: await Promise.all([...new Map(performancePanels.flatMap(p => {
        const take = p.take ?? (p.missingSharedTake?.id === p.missingTakeId ? p.missingSharedTake : undefined)
        return take?.id.startsWith('collab-') ? [[take.id, { take, missing: !p.take }] as const] : []
      })).values()].map(async ({ take, missing }) => ({
        ...take,
        // An unavailable source already contains its durable reference. Do not
        // refetch it or erase it when unrelated project edits autosave.
        videoUrl: missing ? take.videoUrl : take.filePath ? '' : await persistAsset(take.videoUrl),
        thumbnailUrl: missing ? take.thumbnailUrl : take.thumbnailUrl ? await persistAsset(take.thumbnailUrl).catch(() => '') : '',
      }))),
      panelVolumes: performancePanels.map((panel) =>
        panel.kind === 'performance' ? panel.volume ?? null : null,
      ),
      panelMutes: performancePanels.map((panel) =>
        panel.kind === 'performance' ? panel.muted === true : false,
      ),
      panelTrims: performancePanels.map((panel) =>
        panel.kind === 'performance' && (panel.trimStartSec || panel.trimEndSec !== undefined)
          ? [panel.trimStartSec ?? 0, panel.trimEndSec ?? null]
          : null,
      ),
      panelSections: performancePanels.map((panel) =>
        panel.kind === 'performance' &&
        (panel.sectionStartSec !== undefined || panel.sectionEndSec !== undefined)
          ? [panel.sectionStartSec ?? null, panel.sectionEndSec ?? null]
          : null,
      ),
      practice: { ...session.practice, countInBars: recordingCountInBars(session.practice.countInBars) },
      backing: session.backing.kind === 'audio'
        ? { ...session.backing, src: session.backing.missing ? session.backing.src : await persistAsset(session.backing.src) } : session.backing,
      sheetMusic: {
        ...session.sheetMusic,
        asset: session.sheetMusic.asset ? { ...session.sheetMusic.asset, src: session.sheetMusic.asset.missing ? session.sheetMusic.asset.src : await persistAsset(session.sheetMusic.asset.src) } : null,
        cues: await Promise.all((session.sheetMusic.cues ?? []).map(async cue => ({
          ...cue, asset: { ...cue.asset, src: cue.asset.missing ? cue.asset.src : await persistAsset(cue.asset.src) },
        }))),
      },
    }
    window.localStorage.setItem(storageKey(session.projectId), JSON.stringify(persisted))
    if (session.projectId) {
      const projects = listMultitrackProjects().filter(p => p.id !== session.projectId)
      projects.unshift({ id: session.projectId, name: session.name || 'Untitled performance', updatedAt: Date.now() })
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
    }
  } catch (error) {
    throw new Error('Could not save this workspace. Keep it open and try again.', { cause: error })
  }
}

export async function loadMultitrackSession(takes: Take[], projectId?: string): Promise<MultitrackSession | null> {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId ?? localStorage.getItem(ACTIVE_KEY) ?? undefined))
    if (!raw) return null
    const persisted = JSON.parse(raw) as Partial<PersistedMultitrackSession>
    if (!persisted || typeof persisted.layoutId !== 'string') return null

    const preset = getLayoutPreset(persisted.layoutId)
    const count = Math.min(16, Math.max(preset.panelCount, persisted.panelTakeIds?.length ?? 0))
    const panels: import('../types').PerformancePanelState[] = Array.from({ length: count }, (_, i) => ({
      kind: 'performance', id: persisted.panelIds?.[i] ?? MULTITRACK_PANEL_SLOT_IDS[i], take: null,
    }))
    const takeById = new Map(takes.map((take) => [take.id, take]))
    const sharedById = new Map((persisted.sharedTakes ?? []).map(take => [take.id, take]))
    for (const take of sharedById.values()) {
      try {
        let videoUrl: string | null
        if (take.filePath) {
          const location = { path: take.filePath, directory: Directory.Data }
          await Filesystem.stat(location)
          videoUrl = Capacitor.convertFileSrc((await Filesystem.getUri(location)).uri)
        } else videoUrl = await restoreAsset(take.videoUrl)
        if (!videoUrl) continue
        const thumbnailUrl = take.thumbnailUrl ? await restoreAsset(take.thumbnailUrl).catch(() => null) ?? '' : ''
        takeById.set(take.id, { ...take, videoUrl, thumbnailUrl })
      } catch {
        // Each received source recovers independently. Healthy parts stay
        // editable, and the missing descriptor survives the next autosave.
      }
    }

    let performanceIndex = 0
    for (let i = 0; i < panels.length; i += 1) {
      const panel = panels[i]
      if (panel.kind !== 'performance') continue
      const takeId = persisted.panelTakeIds?.[performanceIndex] ?? null
      const volume = persisted.panelVolumes?.[performanceIndex]
      const muted = persisted.panelMutes?.[performanceIndex]
      const trim = persisted.panelTrims?.[performanceIndex]
      const section = persisted.panelSections?.[performanceIndex]
      panels[i] = {
        ...panel,
        ...persisted.panelDetails?.[performanceIndex],
        // Preserve the source identity so an autosave cannot erase a missing part.
        take: takeId ? takeById.get(takeId) ?? null : null,
        missingTakeId: takeId && !takeById.has(takeId) ? takeId : undefined,
        missingSharedTake: takeId && !takeById.has(takeId) ? sharedById.get(takeId) : undefined,
        ...(typeof volume === 'number' ? { volume: bounded(volume, 1, 0, 1) } : null),
        ...(muted === true ? { muted: true } : null),
        ...(Array.isArray(trim)
          ? {
              trimStartSec: bounded(trim[0], 0, 0, takeById.get(takeId ?? '')?.duration ?? 86400),
              ...(typeof trim[1] === 'number' ? { trimEndSec: bounded(trim[1], 86400, 0, takeById.get(takeId ?? '')?.duration ?? 86400) } : null),
            }
          : null),
        ...(Array.isArray(section)
          ? {
              ...(typeof section[0] === 'number' ? { sectionStartSec: bounded(section[0], 0, 0, 86400) } : null),
              ...(typeof section[1] === 'number' ? { sectionEndSec: bounded(section[1], 86400, 0, 86400) } : null),
            }
          : null),
      }
      const restoredPanel = panels[i]
      if (restoredPanel.kind === 'performance') {
        if (restoredPanel.trimEndSec !== undefined && restoredPanel.trimEndSec <= (restoredPanel.trimStartSec ?? 0)) {
          restoredPanel.trimStartSec = 0
          restoredPanel.trimEndSec = undefined
        }
        if (restoredPanel.sectionEndSec !== undefined && restoredPanel.sectionEndSec <= (restoredPanel.sectionStartSec ?? 0)) {
          restoredPanel.sectionStartSec = undefined
          restoredPanel.sectionEndSec = undefined
        }
      }
      performanceIndex += 1
    }

    let backing: MultitrackBackingTrack = { kind: 'none', volume: 0.85 }
    let missingAssets = false
    if (persisted.backing?.kind === 'youtube' && typeof persisted.backing.embedUrl === 'string') {
      backing = { ...persisted.backing, volume: bounded(persisted.backing.volume, .85, 0, 1) }
    } else if (persisted.backing?.kind === 'audio') {
      const src = await restoreAsset(persisted.backing.src).catch(() => null)
      backing = { ...persisted.backing, src: src ?? persisted.backing.src, missing: src ? undefined : true,
        volume: bounded(persisted.backing.volume, .85, 0, 1) }
      if (!src) missingAssets = true
    }
    const sheetMusic: MultitrackSession['sheetMusic'] = { kind: 'sheet-music', id: 'music', asset: null, cues: [] }
    if (persisted.sheetMusic?.asset) {
      const src = await restoreAsset(persisted.sheetMusic.asset.src).catch(() => null)
      sheetMusic.asset = { ...persisted.sheetMusic.asset, src: src ?? persisted.sheetMusic.asset.src, missing: src ? undefined : true }
      if (!src) missingAssets = true
    }
    for (const cue of persisted.sheetMusic?.cues ?? []) {
      const src = await restoreAsset(cue.asset.src).catch(() => null)
      sheetMusic.cues!.push({ ...cue, startSec: bounded(cue.startSec, 0, 0, 86400),
        asset: { ...cue.asset, src: src ?? cue.asset.src, missing: src ? undefined : true } })
      if (!src) missingAssets = true
    }
    sheetMusic.cues!.sort((a, b) => a.startSec - b.startSec)

    return {
      layoutId: preset.id,
      layoutStyle: normalizeLayoutStyle(persisted.layoutStyle),
      projectId: persisted.projectId ?? crypto.randomUUID(),
      name: persisted.name ?? 'My performance',
      aspectRatio: '9:16',
      endSec: typeof persisted.endSec === 'number' ? bounded(persisted.endSec, 1, .1, 86400) : undefined,
      panels,
      sheetMusic,
      ...((missingAssets || panels.some(p => p.missingTakeId)) ? { recoveryNotice: [panels.some(p => p.missingTakeId) ? 'Some recordings are missing. Tap a missing part to replace it.' : '', missingAssets ? 'Some imported files are missing. Reconnect or remove them to continue.' : ''].filter(Boolean).join(' ') } : {}),
      practice: {
        meter: typeof persisted.practice?.meter === 'string' && /^(?:[1-9]|1[0-2])\/(?:2|4|8|16)$/.test(persisted.practice.meter) ? persisted.practice.meter : '4/4',
        clickSound: typeof persisted.practice?.clickSound === 'string' ? persisted.practice.clickSound : 'classic',
        showMetronome: typeof persisted.practice?.showMetronome === 'boolean' ? persisted.practice.showMetronome : false,
        showPitch: typeof persisted.practice?.showPitch === 'boolean' ? persisted.practice.showPitch : false,
        practiceOverlayEnabled: typeof persisted.practice?.practiceOverlayEnabled === 'boolean' ? persisted.practice.practiceOverlayEnabled : true,
        clickEnabled: typeof persisted.practice?.clickEnabled === 'boolean' ? persisted.practice.clickEnabled : true,
        countInBars: recordingCountInBars(persisted.practice?.countInBars),
        bpm: Math.round(bounded(persisted.practice?.bpm, 120, 40, 300)),
      },
      backing,
    }
  } catch (error) {
    throw new Error('Could not restore workspace', { cause: error })
  }
}

/**
 * True when the persisted canvas references vault takes — used to defer
 * rehydration until the takes list has actually loaded, so a too-early restore
 * doesn't silently drop every tile.
 */
export function persistedSessionWantsTakes(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const persisted = JSON.parse(raw) as Partial<PersistedMultitrackSession>
    return (persisted.panelTakeIds ?? []).some((id) => typeof id === 'string' && id.length > 0)
  } catch {
    return false
  }
}

export function clearMultitrackSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
