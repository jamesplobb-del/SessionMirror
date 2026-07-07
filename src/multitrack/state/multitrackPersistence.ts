import type { Take } from '../../types'
import { createPanelsForLayout, getLayoutPreset } from '../layout/layoutPresets'
import type {
  MultitrackBackingTrack,
  MultitrackPracticeSettings,
  MultitrackSession,
} from '../types'

/**
 * Auto-project persistence: the last multitrack canvas survives app restarts
 * (CapCut-style — never ask the user to save or name anything).
 *
 * Only durable references are persisted: take IDs (rehydrated from the vault
 * takes list), practice settings, and YouTube backings (just a URL). File/blob
 * backings and sheet-music assets are session-scoped object URLs and cannot be
 * restored — they stay ephemeral by design.
 */

const STORAGE_KEY = 'sm.multitrack.session.v1'

interface PersistedMultitrackSession {
  layoutId: string
  /** Take id per performance panel slot, aligned with the layout's panel order. */
  panelTakeIds: (string | null)[]
  /** Mixer state per panel slot, aligned with panelTakeIds. */
  panelVolumes?: (number | null)[]
  panelMutes?: boolean[]
  practice: MultitrackPracticeSettings
  backing: { kind: 'youtube'; embedUrl: string; label: string; volume: number } | null
}

export function saveMultitrackSession(session: MultitrackSession): void {
  try {
    const performancePanels = session.panels.filter(
      (panel) => panel.kind === 'performance',
    )
    const persisted: PersistedMultitrackSession = {
      layoutId: session.layoutId,
      panelTakeIds: performancePanels.map((panel) =>
        panel.kind === 'performance' ? panel.take?.id ?? null : null,
      ),
      panelVolumes: performancePanels.map((panel) =>
        panel.kind === 'performance' ? panel.volume ?? null : null,
      ),
      panelMutes: performancePanels.map((panel) =>
        panel.kind === 'performance' ? panel.muted === true : false,
      ),
      practice: session.practice,
      backing: session.backing.kind === 'youtube' ? session.backing : null,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch {
    /* storage unavailable — persistence is best-effort */
  }
}

export function loadMultitrackSession(takes: Take[]): MultitrackSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const persisted = JSON.parse(raw) as Partial<PersistedMultitrackSession>
    if (!persisted || typeof persisted.layoutId !== 'string') return null

    const preset = getLayoutPreset(persisted.layoutId)
    const panels = createPanelsForLayout(preset)
    const takeById = new Map(takes.map((take) => [take.id, take]))

    let performanceIndex = 0
    for (let i = 0; i < panels.length; i += 1) {
      const panel = panels[i]
      if (panel.kind !== 'performance') continue
      const takeId = persisted.panelTakeIds?.[performanceIndex] ?? null
      const volume = persisted.panelVolumes?.[performanceIndex]
      const muted = persisted.panelMutes?.[performanceIndex]
      panels[i] = {
        ...panel,
        // Takes deleted since last session are silently dropped.
        take: takeId ? takeById.get(takeId) ?? null : null,
        ...(typeof volume === 'number' ? { volume } : null),
        ...(muted === true ? { muted: true } : null),
      }
      performanceIndex += 1
    }

    const backing: MultitrackBackingTrack =
      persisted.backing?.kind === 'youtube'
        ? persisted.backing
        : { kind: 'none', volume: 0.85 }

    return {
      layoutId: preset.id,
      panels,
      sheetMusic: { kind: 'sheet-music', id: 'music', asset: null },
      practice: {
        showMetronome: persisted.practice?.showMetronome ?? false,
        showPitch: persisted.practice?.showPitch ?? false,
        practiceOverlayEnabled: persisted.practice?.practiceOverlayEnabled ?? true,
        clickEnabled: persisted.practice?.clickEnabled ?? true,
        countInBars: persisted.practice?.countInBars ?? 1,
        bpm: persisted.practice?.bpm ?? 120,
      },
      backing,
    }
  } catch {
    return null
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
