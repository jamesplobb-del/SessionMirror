import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Take } from '../../types'
import { createPanelsForLayout, getLayoutPreset } from '../layout/layoutPresets'
import {
  loadMultitrackSession,
  persistedSessionWantsTakes,
  saveMultitrackSession,
} from './multitrackPersistence'
import type { MultitrackBackingTrack, MultitrackPracticeSettings, MultitrackSession, SheetMusicAsset } from '../types'

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
    setSession((prev) => {
      const nextPanels = createPanelsForLayout(preset)
      for (let i = 0; i < nextPanels.length; i += 1) {
        const existing = prev.panels[i]
        if (!existing || existing.kind !== 'performance' || nextPanels[i].kind !== 'performance') continue
        if (existing.kind === 'performance' && nextPanels[i].kind === 'performance') {
          nextPanels[i] = {
            kind: 'performance',
            id: nextPanels[i].id,
            take: existing.take,
            volume: existing.volume,
            muted: existing.muted,
          }
        }
      }
      return { ...prev, layoutId, panels: nextPanels }
    })
  }, [])

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

  const assignSheetMusic = useCallback((panelId: string, asset: SheetMusicAsset | null) => {
    setSession((prev) => ({
      ...prev,
      sheetMusic: panelId === prev.sheetMusic.id ? { ...prev.sheetMusic, asset } : prev.sheetMusic,
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
    assignTakeToPanel,
    setPanelVolume,
    setPanelMuted,
    assignSheetMusic,
    updatePractice,
    updateBacking,
  }
}
