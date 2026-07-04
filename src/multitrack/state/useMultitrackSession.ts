import { useCallback, useMemo, useState } from 'react'
import type { Take } from '../../types'
import { createPanelsForLayout, getLayoutPreset } from '../layout/layoutPresets'
import type { MultitrackPracticeSettings, MultitrackSession, SheetMusicAsset } from '../types'

const DEFAULT_PRACTICE: MultitrackPracticeSettings = {
  showMetronome: false,
  showPitch: false,
  practiceOverlayEnabled: true,
}

function createInitialSession(): MultitrackSession {
  const preset = getLayoutPreset('duo-h')
  return { layoutId: preset.id, panels: createPanelsForLayout(preset), practice: { ...DEFAULT_PRACTICE } }
}

export function useMultitrackSession() {
  const [session, setSession] = useState<MultitrackSession>(createInitialSession)
  const layout = useMemo(() => getLayoutPreset(session.layoutId), [session.layoutId])

  const setLayout = useCallback((layoutId: string) => {
    const preset = getLayoutPreset(layoutId)
    setSession((prev) => {
      const nextPanels = createPanelsForLayout(preset)
      for (let i = 0; i < nextPanels.length; i += 1) {
        const existing = prev.panels[i]
        if (!existing || existing.kind !== nextPanels[i].kind) continue
        if (existing.kind === 'performance' && nextPanels[i].kind === 'performance') {
          nextPanels[i] = { kind: 'performance', id: nextPanels[i].id, take: existing.take }
        }
        if (existing.kind === 'sheet-music' && nextPanels[i].kind === 'sheet-music') {
          nextPanels[i] = { kind: 'sheet-music', id: nextPanels[i].id, asset: existing.asset }
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

  const assignSheetMusic = useCallback((panelId: string, asset: SheetMusicAsset | null) => {
    setSession((prev) => ({
      ...prev,
      panels: prev.panels.map((panel) => (panel.id === panelId && panel.kind === 'sheet-music' ? { ...panel, asset } : panel)),
    }))
  }, [])

  const updatePractice = useCallback((patch: Partial<MultitrackPracticeSettings>) => {
    setSession((prev) => ({ ...prev, practice: { ...prev.practice, ...patch } }))
  }, [])

  return { session, layout, setLayout, assignTakeToPanel, assignSheetMusic, updatePractice }
}
