import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Take } from '../../types'
import {
  MULTITRACK_LAYOUT_PRESETS,
  MULTITRACK_PANEL_SLOT_IDS,
  createPanelsForLayout,
  getLayoutPreset,
  mergePanelsIntoLayout,
} from '../layout/layoutPresets'
import { createSheetCueId } from '../sheetMusic/sheetMusicTimeline'
import {
  loadMultitrackSession,
  persistedSessionWantsTakes,
  saveMultitrackSession,
} from './multitrackPersistence'
import type {
  MultitrackBackingTrack,
  MultitrackPracticeSettings,
  MultitrackSession,
  PerformancePanelState,
  SheetMusicAsset,
} from '../types'

const DEFAULT_PRACTICE: MultitrackPracticeSettings = {
  showMetronome: false,
  showPitch: false,
  practiceOverlayEnabled: true,
  clickEnabled: true,
  countInBars: 1,
  bpm: 120,
}

function createInitialSession(): MultitrackSession {
  const preset = getLayoutPreset('two')
  return {
    layoutId: preset.id,
    panels: createPanelsForLayout(preset),
    sheetMusic: { kind: 'sheet-music', id: 'music', asset: null },
    practice: { ...DEFAULT_PRACTICE },
    backing: { kind: 'none', volume: 0.85 },
  }
}

export function useMultitrackSession(options?: { takes?: Take[]; isOpen?: boolean }) {
  const takes = options?.takes ?? []
  const isOpen = options?.isOpen ?? false
  const [session, setSession] = useState<MultitrackSession>(createInitialSession)
  const hydratedRef = useRef(false)
  const layout = useMemo(() => getLayoutPreset(session.layoutId), [session.layoutId])

  // Auto-project restore: rehydrate the last canvas on first open. If the
  // persisted canvas references takes, wait until the vault list has loaded so
  // an early restore doesn't drop every tile.
  useEffect(() => {
    if (!isOpen || hydratedRef.current) return
    if (takes.length === 0 && persistedSessionWantsTakes()) return
    hydratedRef.current = true
    const restored = loadMultitrackSession(takes)
    if (restored) setSession(restored)
  }, [isOpen, takes])

  // Auto-project save: debounce so slider drags don't hammer localStorage.
  useEffect(() => {
    if (!hydratedRef.current) return
    const timer = window.setTimeout(() => saveMultitrackSession(session), 400)
    return () => window.clearTimeout(timer)
  }, [session])

  const setLayout = useCallback((layoutId: string) => {
    const preset = getLayoutPreset(layoutId)
    setSession((prev) => ({
      ...prev,
      layoutId,
      panels: mergePanelsIntoLayout(preset, prev.panels),
    }))
  }, [])

  /**
   * Claims a box for a part being added mid-song: reuses an empty one when there
   * is one, otherwise grows the grid by one slot. Returns the box id so the
   * caller can point the recorder at it, or null once the grid is full.
   */
  const addPerformanceBox = useCallback(
    (section?: { startSec?: number; endSec?: number }): string | null => {
      const performancePanels = session.panels.filter(
        (panel): panel is PerformancePanelState => panel.kind === 'performance',
      )
      const vacant = performancePanels.find((panel) => panel.take === null)
      const grownPreset = vacant
        ? null
        : MULTITRACK_LAYOUT_PRESETS.find(
            (preset) => preset.panelCount === performancePanels.length + 1,
          )
      const targetId = vacant?.id ?? MULTITRACK_PANEL_SLOT_IDS[performancePanels.length]
      if (!vacant && (!grownPreset || !targetId)) return null

      setSession((prev) => {
        const panels = grownPreset
          ? mergePanelsIntoLayout(grownPreset, prev.panels)
          : prev.panels
        return {
          ...prev,
          ...(grownPreset ? { layoutId: grownPreset.id } : null),
          panels: panels.map((panel) =>
            panel.id === targetId && panel.kind === 'performance'
              ? {
                  ...panel,
                  sectionStartSec: section?.startSec,
                  sectionEndSec: section?.endSec,
                }
              : panel,
          ),
        }
      })
      return targetId
    },
    [session.panels],
  )

  const assignTakeToPanel = useCallback((panelId: string, take: Take | null) => {
    setSession((prev) => ({
      ...prev,
      panels: prev.panels.map((panel) => (panel.id === panelId && panel.kind === 'performance' ? { ...panel, take } : panel)),
    }))
  }, [])

  const setPanelVolume = useCallback((panelId: string, volume: number) => {
    setSession((prev) => ({
      ...prev,
      panels: prev.panels.map((panel) =>
        panel.id === panelId && panel.kind === 'performance' ? { ...panel, volume } : panel,
      ),
    }))
  }, [])

  const setPanelMuted = useCallback((panelId: string, muted: boolean) => {
    setSession((prev) => ({
      ...prev,
      panels: prev.panels.map((panel) =>
        panel.id === panelId && panel.kind === 'performance' ? { ...panel, muted } : panel,
      ),
    }))
  }, [])

  const setPanelTrim = useCallback(
    (panelId: string, trimStartSec: number, trimEndSec: number | undefined) => {
      setSession((prev) => ({
        ...prev,
        panels: prev.panels.map((panel) =>
          panel.id === panelId && panel.kind === 'performance'
            ? { ...panel, trimStartSec, trimEndSec }
            : panel,
        ),
      }))
    },
    [],
  )

  /** Pass undefined for both to make the box span the whole song again. */
  const setPanelSection = useCallback(
    (panelId: string, sectionStartSec: number | undefined, sectionEndSec: number | undefined) => {
      setSession((prev) => ({
        ...prev,
        panels: prev.panels.map((panel) =>
          panel.id === panelId && panel.kind === 'performance'
            ? { ...panel, sectionStartSec, sectionEndSec }
            : panel,
        ),
      }))
    },
    [],
  )

  const assignSheetMusic = useCallback((panelId: string, asset: SheetMusicAsset | null) => {
    setSession((prev) => ({
      ...prev,
      sheetMusic: panelId === prev.sheetMusic.id ? { ...prev.sheetMusic, asset } : prev.sheetMusic,
    }))
  }, [])

  /**
   * Adds a screenshot to the music panel's timeline. The very first image always
   * becomes the base (on screen from the downbeat); later ones cut in at the
   * second they were dropped, so a player can walk the page line by line.
   */
  const addSheetCue = useCallback((asset: SheetMusicAsset, startSec: number) => {
    setSession((prev) => {
      const cues = prev.sheetMusic.cues ?? []
      if (!prev.sheetMusic.asset && cues.length === 0) {
        return { ...prev, sheetMusic: { ...prev.sheetMusic, asset } }
      }
      const cue = { id: createSheetCueId(), asset, startSec: Math.max(0, startSec) }
      return {
        ...prev,
        sheetMusic: {
          ...prev.sheetMusic,
          cues: [...cues, cue].sort((a, b) => a.startSec - b.startSec),
        },
      }
    })
  }, [])

  const moveSheetCue = useCallback((cueId: string, startSec: number) => {
    setSession((prev) => ({
      ...prev,
      sheetMusic: {
        ...prev.sheetMusic,
        cues: (prev.sheetMusic.cues ?? [])
          .map((cue) => (cue.id === cueId ? { ...cue, startSec: Math.max(0, startSec) } : cue))
          .sort((a, b) => a.startSec - b.startSec),
      },
    }))
  }, [])

  const updateSheetCueAsset = useCallback((cueId: string, asset: SheetMusicAsset) => {
    setSession((prev) => ({
      ...prev,
      sheetMusic: {
        ...prev.sheetMusic,
        cues: (prev.sheetMusic.cues ?? []).map((cue) =>
          cue.id === cueId ? { ...cue, asset } : cue,
        ),
      },
    }))
  }, [])

  const removeSheetCue = useCallback((cueId: string) => {
    setSession((prev) => ({
      ...prev,
      sheetMusic: {
        ...prev.sheetMusic,
        cues: (prev.sheetMusic.cues ?? []).filter((cue) => cue.id !== cueId),
      },
    }))
  }, [])

  const updatePractice = useCallback((patch: Partial<MultitrackPracticeSettings>) => {
    setSession((prev) => ({ ...prev, practice: { ...prev.practice, ...patch } }))
  }, [])

  const updateBacking = useCallback((backing: MultitrackBackingTrack) => {
    setSession((prev) => ({ ...prev, backing }))
  }, [])

  return {
    session,
    layout,
    setLayout,
    addPerformanceBox,
    assignTakeToPanel,
    setPanelVolume,
    setPanelMuted,
    setPanelTrim,
    setPanelSection,
    assignSheetMusic,
    addSheetCue,
    moveSheetCue,
    updateSheetCueAsset,
    removeSheetCue,
    updatePractice,
    updateBacking,
  }
}
