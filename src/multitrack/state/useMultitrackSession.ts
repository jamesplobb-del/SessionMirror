import { requirePlus } from '../../plus/plusAccess'
import { recordingCountInBars } from '../recording/multitrackCountIn'
import { DEFAULT_LAYOUT_STYLE, withPortraitLayout } from '../layout/quietWorkspaceLayout'
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
    layoutId: preset.id, layoutStyle: { ...DEFAULT_LAYOUT_STYLE },
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
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const saveRevision = useRef(0)
  const switchingRef = useRef(false)
  const retryingRef = useRef(false)
  const setSession = useCallback((action: SetStateAction<MultitrackSession>) => {
    const prev = sessionRef.current
    const next = typeof action === 'function' ? action(prev) : action
    if (next === prev) return
    const boxes = (value: MultitrackSession) => value.panels.filter(panel => panel.kind === 'performance' && !panel.hidden).length
    if (boxes(next) > 2 && boxes(next) > boxes(prev) && !requirePlus('multitrack')) return
    if (next.sheetMusic !== prev.sheetMusic && ((next.sheetMusic.asset && next.sheetMusic.asset !== prev.sheetMusic.asset) || (next.sheetMusic.cues?.length ?? 0) > (prev.sheetMusic.cues?.length ?? 0)) && !requirePlus('music')) return
    const now = Date.now()
    if (now - lastEditAt.current > 350 || !history.current.length) history.current = [...history.current.slice(-39), prev]
    lastEditAt.current = now
    setCanUndo(true)
    saveRevision.current += 1
    setSaveStatus('saving')
    sessionRef.current = next
    commitSession(next)
  }, [])
  const undo = useCallback(() => {
    lastEditAt.current = 0
    const prev = history.current.pop()
    if (prev) {
      saveRevision.current += 1
      setSaveStatus('saving')
      sessionRef.current = prev; commitSession(prev)
    }
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
        setSaveStatus('saved')
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
    const revision = saveRevision.current
    const timer = window.setTimeout(() => {
      if (switchingRef.current || sessionRef.current !== session) return
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        await saveMultitrackSession(session)
        if (session.projectId && sessionRef.current.projectId === session.projectId) selectMultitrackProject(session.projectId)
        setProjects(listMultitrackProjects())
        if (revision === saveRevision.current) {
          setSaveStatus('saved')
          setPersistenceNotice(prev => prev?.startsWith('Workspace could not be saved') ? null : prev)
        }
      })
      void saveQueue.current.catch(() => {
        if (revision === saveRevision.current) {
          setSaveStatus('error')
          setPersistenceNotice('Workspace could not be saved. Keep it open and try again.')
        }
      })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [session, hydrated])

  const retrySave = useCallback(async () => {
    if (switchingRef.current || retryingRef.current || !hydratedRef.current) return
    retryingRef.current = true
    const snapshot = sessionRef.current
    const revision = saveRevision.current
    setSaveStatus('saving')
    try {
      const task = saveQueue.current.catch(() => {}).then(() => saveMultitrackSession(snapshot))
      saveQueue.current = task
      await task
      if (sessionRef.current !== snapshot || saveRevision.current !== revision) return
      if (snapshot.projectId) selectMultitrackProject(snapshot.projectId)
      setProjects(listMultitrackProjects())
      setSaveStatus('saved')
      setPersistenceNotice(prev => prev?.startsWith('Workspace could not be saved') ? null : prev)
    } catch {
      if (sessionRef.current !== snapshot || saveRevision.current !== revision) return
      setSaveStatus('error')
      setPersistenceNotice('Workspace could not be saved. Keep it open and try again.')
    } finally { retryingRef.current = false }
  }, [])

  const setLayout = useCallback((layoutId: string) => {
    if (getLayoutPreset(layoutId).panelCount > 2 && !requirePlus('multitrack')) return
    setSession((prev) => withPortraitLayout(prev, layoutId))
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
    const vacant = floating ? undefined
      : current.panels.find(p => p.kind === 'performance' && !p.hidden && !p.overlay && !p.take && !p.missingTakeId)
    if ((!vacant || current.panels.filter(p => p.kind === 'performance' && !p.hidden).findIndex(p => p.id === vacant.id) >= 2) && current.panels.filter(p => p.kind === 'performance' && !p.hidden).length >= 2 && !requirePlus('multitrack')) return null
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

  /**
   * Clear the canvas without leaving the project.
   *
   * A workspace carries a lot of state that is invisible until it bites: a
   * hidden box from a layout you abandoned, a section window on a part you
   * re-recorded, a backing track you muted rather than removed, a trim you set
   * on a take that is no longer here. "New project" makes another entry in the
   * list and does not answer that — the player does not want a second project,
   * they want this one back to the start. Name and id survive because those are
   * the thing they are still working on; everything else goes.
   *
   * Undo covers it like any other edit, so a reset by mistake is one tap back.
   */
  const resetSession = useCallback(() => {
    setSession(prev => {
      const fresh = createInitialSession()
      return {
        ...fresh,
        projectId: prev.projectId ?? fresh.projectId,
        name: prev.name ?? fresh.name,
      }
    })
  }, [setSession])

  const assignTakeToPanel = useCallback((panelId: string, take: Take | null, completedCapture = false) => {
    if (take && !completedCapture && sessionRef.current.panels.filter(p => p.kind === 'performance' && !p.hidden).findIndex(p => p.id === panelId) >= 2 && !requirePlus('multitrack')) return
    setSession(prev => ({ ...prev, panels: prev.panels.map(panel => {
      if (panel.id !== panelId || panel.kind !== 'performance') return panel
      if (panel.take?.id === take?.id || (take && panel.missingTakeId === take.id)) return { ...panel, take, missingTakeId: undefined, missingSharedTake: undefined }
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
  const openProject = useCallback(async (id?: string, duplicate = false): Promise<boolean> => {
    if (switchingRef.current) return false
    switchingRef.current = true
    saveRevision.current += 1
    setSaveStatus('saving')
    let currentSaved = false
    try {
      await saveQueue.current.catch(() => {})
      await saveMultitrackSession(sessionRef.current)
      currentSaved = true
      const next = id ? await loadMultitrackSession(takes, id) : duplicate
        ? { ...sessionRef.current, projectId: crypto.randomUUID(), name: `${sessionRef.current.name || 'Performance'} copy` }
        : createInitialSession()
      if (!next) throw new Error('Project is missing')
      await saveMultitrackSession(next)
      selectMultitrackProject(next.projectId!)
      sessionRef.current = next; commitSession(next); history.current = []; setCanUndo(false)
      setProjects(listMultitrackProjects()); setPersistenceNotice(next.recoveryNotice ?? null); setSaveStatus('saved')
      return true
    } catch {
      setSaveStatus(currentSaved ? 'saved' : 'error')
      setPersistenceNotice(currentSaved
        ? 'Could not open that project. Your current performance is still open.'
        : 'Workspace could not be saved. Your current performance is still open.')
      return false
    } finally { switchingRef.current = false }
  }, [takes])

  const importProject = useCallback(async (next: MultitrackSession) => {
    if (switchingRef.current) throw new Error('Wait for the current project to finish opening.')
    switchingRef.current = true
    saveRevision.current += 1
    setSaveStatus('saving')
    let currentSaved = false
    try {
      await saveQueue.current.catch(() => {})
      await saveMultitrackSession(sessionRef.current)
      currentSaved = true
      setSaveStatus('saved')
      const keys = [`sm.multitrack.session.v1.${next.projectId}`, 'sm.multitrack.projects.v2', 'sm.multitrack.active.v2']
      const previous = keys.map(key => localStorage.getItem(key))
      try {
        await saveMultitrackSession(next)
        selectMultitrackProject(next.projectId!)
      } catch (error) {
        keys.forEach((key, index) => {
          try { const value = previous[index]; if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* Preserve the original storage error. */ }
        })
        throw error
      }
      sessionRef.current = next; commitSession(next)
      history.current = []; setCanUndo(false)
      setProjects(listMultitrackProjects()); setPersistenceNotice(null); setSaveStatus('saved')
    } catch (error) {
      setSaveStatus(currentSaved ? 'saved' : 'error')
      if (!currentSaved) setPersistenceNotice('Workspace could not be saved. Keep it open and try again.')
      throw error
    } finally { switchingRef.current = false }
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
    if (asset && !requirePlus('music')) return
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
    if (asset && !requirePlus('music')) return
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
    if (asset && !requirePlus('music')) return
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
    setSession((prev) => ({ ...prev, practice: { ...prev.practice, ...patch,
      countInBars: recordingCountInBars(patch.countInBars ?? prev.practice.countInBars) } }))
  }, [])

  const updateBacking = useCallback((backing: MultitrackBackingTrack) => {
    if (backing.kind !== 'none' && !requirePlus(backing.kind === 'youtube' ? 'youtube' : 'music')) return
    setSession((prev) => ({ ...prev, backing }))
  }, [])

  return {
    session, projects, openProject, importProject, updateProject, updatePanel, reorderPanel, undo, canUndo,
    persistenceNotice, saveStatus, retrySave,
    isRestoring: !hydrated,
    layout,
    setLayout,
    addPerformanceBox,
    resetSession,
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
