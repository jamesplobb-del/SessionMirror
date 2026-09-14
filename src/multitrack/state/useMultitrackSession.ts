import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { Take } from '../../types'
import {
  MULTITRACK_LAYOUT_PRESETS,
  MULTITRACK_PANEL_SLOT_IDS,
  createPanelsForLayout,
  getLayoutPreset,
} from '../layout/layoutPresets'
import { createSheetCueId } from '../sheetMusic/sheetMusicTimeline'
import {
  loadMultitrackSession,
  saveMultitrackSession, listMultitrackProjects, selectMultitrackProject,
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
    projectId: crypto.randomUUID(), name: 'My performance', aspectRatio: '9:16',
    layoutId: preset.id,
    panels: createPanelsForLayout(preset),
    sheetMusic: { kind: 'sheet-music', id: 'music', asset: null },
    practice: { ...DEFAULT_PRACTICE },
    backing: { kind: 'none', volume: 0.85 },
  }
}

export function useMultitrackSession(options?: { takes?: Take[]; isOpen?: boolean; takesLoaded?: boolean }) {
  const takes = options?.takes ?? []
  const isOpen = options?.isOpen ?? false
  const [session, commitSession] = useState<MultitrackSession>(createInitialSession)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const history = useRef<MultitrackSession[]>([])
  const lastEditAt = useRef(0)
  const [canUndo, setCanUndo] = useState(false)
  const [projects, setProjects] = useState(listMultitrackProjects)
  const setSession = useCallback((action: SetStateAction<MultitrackSession>) => {
    const prev = sessionRef.current
    const next = typeof action === 'function' ? action(prev) : action
    if (next === prev) return
    const now = Date.now()
    if (now - lastEditAt.current > 350 || !history.current.length) history.current = [...history.current.slice(-39), prev]
    lastEditAt.current = now
    setCanUndo(true)
    sessionRef.current = next
    commitSession(next)
  }, [])
  const undo = useCallback(() => {
    lastEditAt.current = 0
    const prev = history.current.pop()
    if (prev) { sessionRef.current = prev; commitSession(prev) }
    setCanUndo(history.current.length > 0)
  }, [])
  const hydratedRef = useRef(false)
  const layout = useMemo(() => getLayoutPreset(session.layoutId), [session.layoutId])

  const [hydrated, setHydrated] = useState(false)
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null)
  const saveQueue = useRef(Promise.resolve())
  const takesLoaded = options?.takesLoaded ?? true
  useEffect(() => {
    if (!isOpen || hydratedRef.current || !takesLoaded) return
    let cancelled = false
    void loadMultitrackSession(takes).then(restored => {
      if (cancelled) return
      if (restored) {
        sessionRef.current = restored
        commitSession(restored)
        if (restored.projectId) selectMultitrackProject(restored.projectId)
        setPersistenceNotice(restored.recoveryNotice ?? null)
      }
      hydratedRef.current = true
      setHydrated(true)
    }).catch(() => {
      if (!cancelled) setPersistenceNotice('Could not reopen your workspace. Close and reopen to retry.')
    })
    return () => { cancelled = true }
  }, [isOpen, takes, takesLoaded])

  // Serialize snapshots: a slow file import must not overwrite a later edit.
  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        await saveMultitrackSession(session)
        if (session.projectId) selectMultitrackProject(session.projectId)
        setProjects(listMultitrackProjects())
        setPersistenceNotice(prev => prev?.startsWith('Workspace could not be saved') ? null : prev)
      })
      void saveQueue.current.catch(() => setPersistenceNotice('Workspace could not be saved. Keep it open and try again.'))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [session, hydrated])

  const setLayout = useCallback((layoutId: string) => {
    const preset = getLayoutPreset(layoutId)
    setSession((prev) => ({
      ...prev,
      layoutId,
      panels: (() => {
        const base = prev.panels.filter(p => p.kind === 'performance' && !p.overlay)
        const overlays = prev.panels.filter(p => p.kind === 'performance' && p.overlay)
        const available = MULTITRACK_PANEL_SLOT_IDS.filter(id => !prev.panels.some(p => p.id === id))
        while (base.length < preset.panelCount && available.length) base.push({ kind: 'performance', id: available.shift()!, take: null })
        return [...base.map((p, i) => ({ ...p, hidden: i >= preset.panelCount })), ...overlays]
      })(),
    }))
  }, [])

  /**
   * Claims a box for a part being added mid-song: reuses an empty one when there
   * is one, otherwise grows the grid by one slot. Returns the box id so the
   * caller can point the recorder at it, or null once the grid is full.
   *
   * Deliberately does not touch the section window — a box only earns one when a
   * clip actually lands in it.
   */
  const addPerformanceBox = useCallback((floating = false): string | null => {
    const current = sessionRef.current
    const vacant = floating ? current.panels.find(p => p.kind === 'performance' && !!p.overlay && !p.take)
      : current.panels.find(p => p.kind === 'performance' && !p.overlay && !p.take)
    const floatingCount = current.panels.filter(p => p.kind === 'performance' && p.overlay).length
    const id = vacant?.id ?? (floating
      ? (floatingCount < 4 ? `extra-${crypto.randomUUID()}` : undefined)
      : MULTITRACK_PANEL_SLOT_IDS.find(id => !current.panels.some(p => p.id === id)))
    if (!id) return null
    setSession(prev => {
      const panel: PerformancePanelState = { kind: 'performance', id, take: null,
        ...(floating ? { sectionAudio: true, overlay: { xPercent: 64, yPercent: 64, widthPercent: 32, heightPercent: 28 } } : {}) }
      const panels = vacant ? prev.panels.map(p => p.id === id ? panel : p) : [...prev.panels, panel]
      const count = panels.filter(p => p.kind === 'performance' && !p.hidden && !p.overlay).length
      const preset = MULTITRACK_LAYOUT_PRESETS.find(p => p.panelCount === count)
      return { ...prev, panels, layoutId: preset?.id ?? prev.layoutId }
    })
    return id
  }, [setSession])

  const assignTakeToPanel = useCallback((panelId: string, take: Take | null) => {
    setSession(prev => ({ ...prev, panels: prev.panels.map(panel => {
      if (panel.id !== panelId || panel.kind !== 'performance') return panel
      if (panel.take?.id === take?.id) return { ...panel, take }
      // A replacement has its own timing. Keep its visual placement and name only.
      return { kind: 'performance', id: panel.id, take, label: panel.label,
        hidden: panel.hidden, overlay: panel.overlay, frame: panel.frame, sectionAudio: panel.overlay ? true : undefined }
    }) }))
  }, [setSession])

  const updatePanel = useCallback((id: string, patch: Partial<PerformancePanelState>) => {
    setSession(prev => ({ ...prev, panels: prev.panels.map(p => p.id === id && p.kind === 'performance' ? { ...p, ...patch } : p) }))
  }, [setSession])
  const updateProject = useCallback((patch: Partial<MultitrackSession>) => setSession(prev => ({ ...prev, ...patch })), [setSession])
  const reorderPanel = useCallback((id: string, beforeId: string) => {
    setSession(prev => {
      const panels = [...prev.panels]; const index = panels.findIndex(p => p.id === id)
      if (index < 0 || id === beforeId) return prev
      const [panel] = panels.splice(index, 1)
      panels.splice(Math.max(0, panels.findIndex(p => p.id === beforeId)), 0, panel)
      return { ...prev, panels }
    })
  }, [setSession])
  const openProject = useCallback(async (id?: string, duplicate = false) => {
    try {
      await saveQueue.current.catch(() => {})
      await saveMultitrackSession(sessionRef.current)
      const next = id ? await loadMultitrackSession(takes, id) : duplicate
        ? { ...sessionRef.current, projectId: crypto.randomUUID(), name: `${sessionRef.current.name || 'Performance'} copy` }
        : createInitialSession()
      if (!next) throw new Error('Project is missing')
      await saveMultitrackSession(next)
      selectMultitrackProject(next.projectId!)
      sessionRef.current = next; commitSession(next); history.current = []; setCanUndo(false)
      setProjects(listMultitrackProjects()); setPersistenceNotice(null)
    } catch { setPersistenceNotice('Could not switch projects. Your current performance is still open.') }
  }, [takes])

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
    session, projects, openProject, updateProject, updatePanel, reorderPanel, undo, canUndo,
    persistenceNotice,
    isRestoring: !hydrated,
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
