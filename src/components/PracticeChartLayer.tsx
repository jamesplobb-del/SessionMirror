import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, AudioLines, Ear, FileMusic, Grid2X2, Maximize2, MicVocal, Minimize2, Pen, Radio, SlidersHorizontal, Square, Upload, X } from 'lucide-react'
import { MetronomeToolIcon, TakesToolIcon } from './icons/toolIcons'
import { useLongPress } from '../hooks/useLongPress'
import type { HandsFreePhase } from '../utils/handsFreePhase'
import { sheetMusicAcceptAttribute } from '../multitrack/sheetMusic/sheetMusicUtils'
import { useActionSheet } from '../context/ActionSheetContext'
import {
  DEFAULT_CHART_VIEW, deletePracticeChart, loadChartView, loadPracticeChart,
  savePracticeChart, saveChartView, setChartVisible,
  type ChartView, type PracticeChart,
} from '../utils/practiceChartStorage'
import MusicWidget, { type MusicMenuMode } from './practiceChart/MusicWidget'
import MarkupToolbar from './practiceChart/MarkupToolbar'
import { ChartInkHistory } from './practiceChart/chartInkHistory'
import type { HudQuickSettings } from '../utils/hudQuickSettings'
import { WIDGET_CONTROL_LAYOUT_EVENT } from '../utils/floatingWidgetLayout'


import {
  clearInkStrokes, eraseStrokesAt, isInkColour, loadInkColour, loadInkStrokes, loadInkWidth, saveInkColour, saveInkStrokes, saveInkWidth,
  type InkColour, type InkStroke, type InkTool, type InkWidth,
} from './practiceChart/chartInk'
import { shareMarkedChart } from './practiceChart/chartExport'
import PracticeChartPaper, { type ChartPaperHandle, type ChartPaperView } from './practiceChart/PracticeChartPaper'
import { closeCachedPdfChart } from './practiceChart/chartDocument'
import './practice-chart.css'

type MusicWorkspaceKey = Exclude<keyof HudQuickSettings, 'showMusic'>
const MUSIC_WORKSPACE_TOOLS = [
  { key: 'pitchTrackerEnabled', label: 'Pitch', icon: AudioLines },
  { key: 'audioEnhancerEnabled', label: 'Audio Enhance', icon: SlidersHorizontal },
  { key: 'showMetronome', label: 'Metronome', icon: MetronomeToolIcon },
  { key: 'showDrone', label: 'Drone', icon: Radio },
  { key: 'showTakeCards', label: 'Takes', icon: TakesToolIcon },
] as const

/** A tap this short and this still is a page turn; anything else is a scroll. */
const TAP_SLOP_PX = 8
const TAP_MS = 500
/** The outer thirds turn pages; the middle third toggles the reading controls. */
const TURN_ZONE = 1 / 3
const HINT_MS = 2600

interface PracticeChartLayerProps {
  projectId: string
  revision?: number
  onScoreReplaced?: (fileName: string) => Promise<void>
  workspace: HudQuickSettings
  onWorkspaceChange: (key: MusicWorkspaceKey, enabled: boolean) => void
  referencesVisible?: boolean
  onReferencesChange?: (visible: boolean) => void
  /** The Music tool is on and this surface is the practice room. */
  active: boolean
  boundaryRef: RefObject<HTMLElement | null>
  collapseResetKey?: string
  /** Turns the Music tool itself off — the desk toggle, from the widget's ×. */
  onClose: () => void
  /** True while the page is actually covering the room, so the HUD can stand down. */
  onPaperVisibleChange: (visible: boolean) => void
  /** True while the player has asked for the tabs and the deck to stand down too. */
  onChromeHiddenChange: (hidden: boolean) => void
  /*
   * The record orbit itself is untouched — but in full screen it is put away
   * with the rest of the deck, and a player on a stand still has to be able to
   * start a take without leaving the page. These are the deck's own record
   * control, borrowed for the rail.
   */
  isRecording: boolean
  isStopping: boolean
  recordReady: boolean
  /** Seconds into the current take, for the rail's timer. */
  recordElapsed: number
  onToggleRecord: () => void
  /*
   * Hands-free, on the page.
   *
   * The gesture that arms it is a long press on Record — and in full screen the
   * Record it lives on has been put away with the deck, which left the one mode
   * built for a player holding an instrument unreachable from the one screen
   * built for a player holding an instrument. The rail carries the same long
   * press, and shows the same phase back.
   */
  handsFreeEnabled: boolean
  handsFreePhase: HandsFreePhase | null
  onToggleHandsFree: () => void
  /**
   * Ask for a file as soon as an empty page opens. False when the Music tile
   * already asked inside its own tap, so the player is not asked twice.
   */
  offerFileOnOpen?: boolean
  /** Optional setlist transport, rendered with the page's own top tools. */
  /** Replaces the Library button while a setlist is open. */
  setlistMenu?: ReactNode
  /** Workspace opens the side rail so its widgets are in reach. */
  toolRailOpen?: boolean
  onToolRailOpenChange?: (open: boolean) => void
}

/** What the rail says while hands-free is running the sitting. */
const HANDS_FREE_LABEL: Record<HandsFreePhase, string> = {
  preparing: 'Getting ready',
  listening: 'Listening',
  recording: 'Recording',
  playback: 'Playing back',
  saving: 'Saving',
  countdown: 'Next take',
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

/**
 * Practice on the music.
 *
 * The part is the whole screen and everything else is a ball on the edge, the
 * record orbit, or a sheet the player asked for. This is a mode of the practice
 * room rather than a viewer bolted on top of it: the camera keeps running under
 * the paper, recording is still the same record button, and takes still land in
 * this project's folder next to the file.
 */
export default function PracticeChartLayer({
  projectId, workspace, onWorkspaceChange, active, boundaryRef, collapseResetKey, onClose, onPaperVisibleChange,
  onChromeHiddenChange, isRecording, isStopping, recordReady, recordElapsed, onToggleRecord,
  handsFreeEnabled, handsFreePhase, onToggleHandsFree, offerFileOnOpen = true,
  referencesVisible = false, onReferencesChange,
  revision = 0, onScoreReplaced, setlistMenu, toolRailOpen, onToolRailOpenChange,
}: PracticeChartLayerProps) {
  const { showConfirm } = useActionSheet()
  const input = useRef<HTMLInputElement>(null)
  const paper = useRef<ChartPaperHandle | null>(null)
  const [chart, setChart] = useState<PracticeChart | null>(null)
  const [view, setView] = useState<ChartView>(DEFAULT_CHART_VIEW)
  const [paperVisible, setPaperVisible] = useState(true)
  const [pageView, setPageView] = useState<ChartPaperView | null>(null)
  const [pageZoom, setPageZoom] = useState(1)
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [spreadAvailable, setSpreadAvailable] = useState(false)
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  const inkHistory = useRef(new ChartInkHistory(projectId, []))
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const restoreInk = useCallback((next: InkStroke[]) => {
    inkHistory.current.reset('', next)
    setActiveEraseIdentity(null)
    strokesRef.current = next
    setStrokes(next)
  }, [])
  const [inkSaveFailed, setInkSaveFailed] = useState(false)
  const [activeEraseIdentity, setActiveEraseIdentity] = useState<string | null>(null)
  /*
   * The marker is picked up for a moment and put down again, so it is not
   * remembered: a part must never open in marking mode, where the first tap
   * to turn the page would draw on it instead.
   */
  const [marker, setMarker] = useState<InkTool | null>(null)
  const [penColour, setPenColour] = useState<InkColour>(loadInkColour)
  const [inkWidth, setInkWidth] = useState<InkWidth>(loadInkWidth)
  // A score opens as paper. Controls are an overlay, revealed by a center tap.
  const paperSurface = useRef<HTMLDivElement>(null)
  const topbar = useRef<HTMLDivElement>(null)
  const [controlsHidden, setControlsHidden] = useState(true)
  const workspaceTrigger = useRef<HTMLButtonElement>(null)
  const workspacePanel = useRef<HTMLDivElement>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [musicMenu, setMusicMenu] = useState<MusicMenuMode | null>(null)
  const [musicMenuAnchor, setMusicMenuAnchor] = useState<HTMLElement | null>(null)
  const musicMenuId = useId()
  const [chromeOff, setChromeOff] = useState(false)
  useLayoutEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event(WIDGET_CONTROL_LAYOUT_EVENT)))
    return () => cancelAnimationFrame(frame)
  }, [active, workspaceOpen, chromeOff])
  // Full screen is for the page. The tool row waits behind Workspace, closed,
  // every time the player steps in.
  useEffect(() => { if (chromeOff) setWorkspaceOpen(false) }, [chromeOff])
  useEffect(() => { if (marker) setWorkspaceOpen(false) }, [marker])
  useEffect(() => { if (toolRailOpen === false) setWorkspaceOpen(false) }, [toolRailOpen])
  const closeWorkspace = useCallback((restoreFocus = false) => {
    const focusWasInside = workspacePanel.current?.contains(document.activeElement)
    setWorkspaceOpen(false)
    if (restoreFocus || focusWasInside) workspaceTrigger.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (!workspaceOpen) return
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || workspacePanel.current?.contains(target) || workspaceTrigger.current?.contains(target)) return
      setWorkspaceOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      closeWorkspace(true)
    }
    const focusOutside = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof Node) || workspacePanel.current?.contains(target) || workspaceTrigger.current?.contains(target)) return
      setWorkspaceOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    document.addEventListener('focusin', focusOutside)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('focusin', focusOutside)
    }
  }, [closeWorkspace, workspaceOpen])
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setChart(null)
    setPageView(null)
    setError('')
    setLoadFailed(false)
    setView(loadChartView(projectId))
    restoreInk(loadInkStrokes(projectId))
    setInkSaveFailed(false)
    setMarker(null)
    setChromeOff(false)
    setPaperVisible(true)
    setLoaded(false)
    void loadPracticeChart(projectId)
      .then(value => { if (!cancelled) setChart(value) })
      .catch(() => { if (!cancelled) setError('Could not load this music. Try adding the file again.') })
      .finally(() => {
        if (cancelled) return
        setBusy(false)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [projectId, restoreInk])

  // External imports can replace this file, but opening a toolbar must never
  // recreate the document or discard its reading position.
  const lastRefresh = useRef({ projectId, revision })
  useEffect(() => {
    const previous = lastRefresh.current
    lastRefresh.current = { projectId, revision }
    // The project effect owns the initial disk read (including a new project).
    if (previous.projectId !== projectId || previous.revision === revision) return
    let cancelled = false
    void loadPracticeChart(projectId).then(value => {
      if (!cancelled) {
        setChart(value)
        restoreInk(loadInkStrokes(projectId))
        setView(loadChartView(projectId))
      }
    }).catch(() => { if (!cancelled) setError('Could not refresh this music.') })
    return () => { cancelled = true }
  }, [projectId, restoreInk, revision])

  const paperKey = chart ? `${projectId}:${chart.attachmentId ?? ''}:${chart.fileName}:${chart.bytes?.byteLength ?? 0}` : null
  useLayoutEffect(() => {
    setPageView(null)
    setLoadFailed(false)
    setMusicMenu(null)
    setMarker(null)
    setChromeOff(true)
    setControlsHidden(true)
  }, [paperKey])

  /*
   * `active` says whether the stand is being looked at, never whether it
   * exists. Unmounting the paper throws away the opened PDF, where the player
   * was on it, the marks and full screen — so anything that takes the room for
   * a moment (a widget toggle that opens a panel, a sheet, the hub) used to
   * cost a full reopen on the way back. The sibling MusicWidget already solved
   * this with `visible`; the page does the same.
   */
  const mounted = paperVisible && chart !== null
  const showing = active && mounted
  useLayoutEffect(() => {
    if (!showing) { setMarker(null); setMusicMenu(null) }
    else { setChromeOff(true); setControlsHidden(true) }
  }, [showing])
  useEffect(() => {
    setMarker(null)
    setMusicMenu(null)
    setMusicMenuAnchor(null)
    setWorkspaceOpen(false)
    setChromeOff(true)
    setControlsHidden(true)
  }, [collapseResetKey])
  /*
   * An empty stand is still the music page. Without it, turning Music on for an
   * item with no part left the room exactly as it was apart from a ball on the
   * edge — it read as landing on Tools. The page comes up blank with the one
   * thing to do on it. The same is true while the file is still opening: the
   * stand has to be the room on the first frame, not Tools for a beat.
   */
  const showingEmpty = active && paperVisible && loaded && chart === null
  const showingLoading = active && paperVisible && !loaded
  useLayoutEffect(() => {
    onPaperVisibleChange(showing || showingEmpty || showingLoading)
  }, [onPaperVisibleChange, showing, showingEmpty, showingLoading])

  /*
   * Rehearsal view only means anything while a part is up, and it must never
   * outlive one: chrome hidden with no page behind it is a room with no way
   * out.
   */
  const reading = showing && controlsHidden && !loadFailed
  const chromeHidden = showing && (chromeOff || reading)
  useLayoutEffect(() => { onChromeHiddenChange(chromeHidden) }, [chromeHidden, onChromeHiddenChange])
  useLayoutEffect(() => {
    if (!reading) return
    // A repeated setlist entry can hide the very control that selected it.
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused !== document.body
      && (topbar.current?.contains(focused) || getComputedStyle(focused).visibility === 'hidden')) {
      paperSurface.current?.focus({ preventScroll: true })
    }
  }, [reading, paperKey, collapseResetKey])

  /*
   * Turning the Music tool off unmounts this layer outright, and the room would
   * otherwise be left standing down for a page that is no longer there: a
   * transparent HUD over a live camera. The same unmount is the one moment the
   * parsed file is genuinely finished with, so it is released here rather than
   * on every hide — a hide is something a player does mid-piece.
   */
  const releaseRef = useRef({ paper: onPaperVisibleChange, chrome: onChromeHiddenChange })
  releaseRef.current = { paper: onPaperVisibleChange, chrome: onChromeHiddenChange }
  useEffect(() => () => {
    releaseRef.current.paper(false)
    releaseRef.current.chrome(false)
    closeCachedPdfChart()
  }, [])

  /*
   * The band of screen the page actually gets.
   *
   * Two pieces of chrome bracket it and neither can move: the Record / Tuner /
   * Metronome / Games tabs at the top, which are the way off this surface, and
   * the record orbit with the takes at the bottom. A page fitted to the whole
   * screen puts its last system underneath the deck, and in a whole-page fit
   * there is nowhere to scroll to get it back — the last line of every page
   * would simply be unreadable. So the page is fitted between them instead.
   *
   * Both heights move with the refinement theme, the safe area and the player's
   * text size, so they are measured rather than guessed; a guess that was 35px
   * short is what laid a tab bar across the top system in the first place. Both
   * are direct children of the HUD overlay, so watching that one child list
   * catches them appearing and going away.
   */
  useEffect(() => {
    const root = document.documentElement
    const clear = () => {
      root.style.removeProperty('--music-page-bottom')
      root.style.removeProperty('--music-controls-top')
    }
    if (!showing) {
      clear()
      return
    }
    const apply = () => {
      const tabs = chromeHidden ? null : document.querySelector('.audio-practice-top-tabs')
      if (tabs) root.style.setProperty('--music-controls-top', `${Math.round(tabs.getBoundingClientRect().bottom) + 8}px`)
      else root.style.removeProperty('--music-controls-top')
      const deck = chromeHidden ? null : document.querySelector('.app-hud-bottom')
      const deckTop = deck ? deck.getBoundingClientRect().top : 0
      const height = window.innerHeight
      const bottom = deckTop > 0 ? Math.max(0, Math.round(height - deckTop)) : 0
      if (bottom > 0) root.style.setProperty('--music-page-bottom', `${bottom}px`)
      else root.style.removeProperty('--music-page-bottom')
    }
    // The deck grows when a take arrives and its pills appear, so its size is
    // watched as well as its presence. Attaching lazily inside `apply` means it
    // does not matter whether the chrome or the page mounted first.
    const resizes = new ResizeObserver(apply)
    let watched: Element | null = null
    const watchDeck = () => {
      const deck = document.querySelector('.app-hud-bottom')
      if (!deck || deck === watched) return
      if (watched) resizes.unobserve(watched)
      resizes.observe(deck)
      watched = deck
    }
    const measure = () => { watchDeck(); apply() }
    measure()
    const overlay = document.querySelector('.app-ui-overlay')
    const mutations = overlay ? new MutationObserver(measure) : null
    if (overlay && mutations) mutations.observe(overlay, { childList: true, subtree: true })
    window.addEventListener('resize', apply)
    window.visualViewport?.addEventListener('resize', apply)
    return () => {
      mutations?.disconnect()
      resizes.disconnect()
      window.removeEventListener('resize', apply)
      window.visualViewport?.removeEventListener('resize', apply)
      clear()
    }
  }, [showing, chromeHidden])

  // The turn zones are invisible on purpose — nothing may sit on the staff —
  // so they announce themselves once when the page comes up, then get out of
  // the way.
  useEffect(() => {
    if (!showing) { setHint(false); return }
    setHint(true)
    const timer = window.setTimeout(() => setHint(false), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [showing, projectId])

  // The live view is mirrored so a change can be written to disk outside the
  // state updater — an updater that writes is a side effect React is free to
  // run twice.
  const viewRef = useRef(view)
  viewRef.current = view
  const updateView = useCallback((patch: Partial<ChartView>) => {
    const next = { ...viewRef.current, ...patch }
    viewRef.current = next
    saveChartView(projectId, next)
    setView(next)
  }, [projectId])

  const handleFraction = useCallback((fraction: number) => {
    updateView({ fraction })
  }, [updateView])

  const handlePaperVisible = useCallback((next: boolean) => {
    if (!next) { onClose(); return }
    setChartVisible(projectId, next)
    setPaperVisible(next)
  }, [projectId, onClose])

  const handleError = useCallback((message: string) => setError(message), [])

  /*
   * A file that will not open must not leave a blank sheet of white over the
   * practice room with the reason whispered inside a folded widget. The page
   * stays where it is and says what happened, with the two things worth doing
   * about it right there.
   */
  const handleLoadFailed = useCallback(() => setLoadFailed(true), [])

  const handleSpreadAvailable = useCallback((available: boolean) => {
    setSpreadAvailable(available)
  }, [])

  const dismissMusicMenu = useCallback((restoreFocus = false) => {
    setMusicMenu(null)
    setMarker(null)
    if (restoreFocus) requestAnimationFrame(() => {
      const trigger = paperSurface.current?.querySelector<HTMLButtonElement>('[data-music-menu-trigger="markup"]')
      if (musicMenuAnchor?.isConnected) musicMenuAnchor.focus({ preventScroll: true })
      else trigger?.focus({ preventScroll: true })
    })
  }, [musicMenuAnchor])

  useLayoutEffect(() => {
    if (marker && musicMenu === 'markup' && !musicMenuAnchor?.isConnected) {
      const options = paperSurface.current?.querySelector<HTMLButtonElement>('.markup-toolbar [data-music-menu-trigger="markup"]')
      if (options) setMusicMenuAnchor(options)
    }
  }, [marker, musicMenu, musicMenuAnchor])

  const tuckMarkupMenu = useCallback(() => {
    // Put the palette away without putting down the selected pen or eraser.
    setMusicMenu(null)
  }, [])

  const finishMarkingOnEscape = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    // A setlist or modal owns Escape until it closes; do not move focus behind it.
    const popupOpen = [...document.querySelectorAll<HTMLElement>('[role="menu"], [role="dialog"][aria-modal="true"]')]
      .some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
    if (popupOpen) return
    event.preventDefault()
    dismissMusicMenu(true)
  }, [dismissMusicMenu])
  useEffect(() => {
    if (!showing || !marker || musicMenu) return
    // The disappearing palette may leave focus on the document body.
    document.addEventListener('keydown', finishMarkingOnEscape)
    return () => document.removeEventListener('keydown', finishMarkingOnEscape)
  }, [finishMarkingOnEscape, marker, musicMenu, showing])

  const openMusicMenu = useCallback((mode: MusicMenuMode, anchor: HTMLElement) => {
    setWorkspaceOpen(false)
    setMusicMenuAnchor(anchor)
    if (musicMenu === mode) {
      setMusicMenu(null)
      return
    }
    setMusicMenu(mode)
    // Page always returns to reading, regardless of the last opened menu.
    setMarker(current => mode === 'markup' ? current ?? penColour : null)
  }, [musicMenu, penColour])

  const pickMarker = useCallback((tool: InkTool | null) => {
    if (isInkColour(tool)) { saveInkColour(tool); setPenColour(tool) }
    setMarker(tool)
  }, [])

  /*
   * The eraser moves faster than React re-renders, so it works from a mirror
   * of the list rather than from `strokes`: erasing off the last rendered
   * value would put every mark the finger already passed back on the page.
   */
  const inkIdentity = `${projectId}:${chart?.attachmentId ?? chart?.fileName ?? ''}:${revision}`
  const currentInkHistory = useCallback(() => {
    if (inkHistory.current.identity !== inkIdentity) inkHistory.current.reset(inkIdentity, strokesRef.current)
    return inkHistory.current
  }, [inkIdentity])
  const persistStrokes = useCallback((next: InkStroke[]) => {
    strokesRef.current = next
    setStrokes(next)
    setInkSaveFailed(!saveInkStrokes(projectId, next, chart?.attachmentId ?? null))
  }, [projectId, chart?.attachmentId])
  const editStrokes = useCallback((next: InkStroke[]) => {
    const changed = currentInkHistory().edit(next)
    if (changed) persistStrokes(changed)
  }, [currentInkHistory, persistStrokes])
  const handleStroke = useCallback((stroke: InkStroke) => {
    editStrokes([...strokesRef.current, stroke])
  }, [editStrokes])
  const eraseAt = useCallback((
    page: number, x: number, y: number, radiusX: number, radiusY: number,
  ) => {
    const next = eraseStrokesAt(strokesRef.current, page, x, y, radiusX, radiusY)
    if (!next) return
    editStrokes(next)
  }, [editStrokes])

  const eraseTransaction = useRef<string | null>(null)
  const beginErase = useCallback(() => {
    currentInkHistory().begin()
    eraseTransaction.current = inkIdentity
    setActiveEraseIdentity(inkIdentity)
  }, [currentInkHistory, inkIdentity])
  const finishErase = useCallback((cancelled: boolean) => {
    if (eraseTransaction.current !== inkIdentity || inkHistory.current.identity !== inkIdentity) return
    eraseTransaction.current = null
    setActiveEraseIdentity(null)
    if (cancelled) {
      const restored = inkHistory.current.cancel()
      if (restored) persistStrokes(restored)
    } else inkHistory.current.end()
  }, [inkIdentity, persistStrokes])

  const undoStroke = useCallback(() => {
    const previous = currentInkHistory().undo()
    if (previous) persistStrokes(previous)
  }, [currentInkHistory, persistStrokes])

  const redoStroke = useCallback(() => {
    const next = currentInkHistory().redo()
    if (next) persistStrokes(next)
  }, [currentInkHistory, persistStrokes])

  const canUndo = activeEraseIdentity !== inkIdentity && inkHistory.current.identity === inkIdentity && inkHistory.current.canUndo
  const canRedo = activeEraseIdentity !== inkIdentity && inkHistory.current.identity === inkIdentity && inkHistory.current.canRedo

  const clearMarks = useCallback(() => {
    editStrokes([])
  }, [editStrokes])

  const saveMarked = useCallback(async () => {
    if (!chart) return
    setSaving(true)
    setError('')
    try {
      const result = await shareMarkedChart(chart, strokes)
      if (!result.ok) setError(result.message)
    } catch (cause) {
      setError(cause instanceof Error && cause.message
        ? cause.message
        : 'Could not save a marked copy of this music.')
    } finally {
      setSaving(false)
    }
  }, [chart, strokes])

  const pick = useCallback(() => {
    setError('')
    input.current?.click()
  }, [])

  /*
   * Music with no music is nothing: the tool comes on, the room looks exactly
   * as it did, and the only sign anything happened is a ball on the edge. So
   * the first thing turning it on does for a part that has none is ask for the
   * file. Once per item, because a player who cancels the picker, or who has
   * just removed a part on purpose, has answered the question.
   */
  const offered = useRef<string | null>(null)
  useEffect(() => {
    if (!active || busy || chart !== null) return
    if (offered.current === projectId) return
    offered.current = projectId
    // WebKit only opens a picker inside a tap, so this can be ignored when
    // the page arrives after an async load. The empty stand's own button is
    // the dependable path; this just saves a tap where it is allowed.
    if (offerFileOnOpen) pick()
  }, [active, busy, chart, offerFileOnOpen, pick, projectId])

  const remove = useCallback(async () => {
    if (!await showConfirm({ title: 'Remove this score?', message: 'The music file and all markings on it will be deleted. Recordings stay in this practice item.', confirmLabel: 'Remove music', destructive: true })) return
    setBusy(true)
    setError('')
    try {
      await deletePracticeChart(projectId)
      offered.current = projectId
      clearInkStrokes(projectId)
      restoreInk([])
      setMarker(null)
      setChart(null)
      setPageView(null)
      setPaperVisible(true)
    } catch {
      setError('Could not remove this music. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [projectId, restoreInk, showConfirm])

  /*
   * The same gesture the deck's Record has: tap to start or stop, hold to arm
   * hands-free. Matching the deck's 900ms so the hold feels identical wherever
   * a player learned it.
   */
  const railRecordHandlers = useLongPress({
    onClick: onToggleRecord,
    onLongPress: onToggleHandsFree,
    delay: 900,
    disabled: isStopping || (!recordReady && !isRecording),
  })

  const revealControls = (focus = false) => {
    setHint(false)
    setControlsHidden(false)
    if (focus) requestAnimationFrame(() => topbar.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }))
  }
  const hideControls = () => {
    // Keep the score's size steady when putting the overlays away.
    setChromeOff(true)
    setWorkspaceOpen(false)
    dismissMusicMenu()
    setHint(false)
    paperSurface.current?.focus({ preventScroll: true })
    setControlsHidden(true)
  }
  const gesture = useRef<{ id: number; x: number; y: number; at: number } | null>(null)
  const toolHost = workspaceOpen && typeof document !== 'undefined' ? document.getElementById('music-widget-drawer-tools') : null
  const isControlTarget = (target: EventTarget | null) => target instanceof Element
    && !!target.closest('button, a, input, select, textarea, [role="button"], [role="dialog"], .practice-chart-topbar, .practice-chart-rail, .practice-chart-workspace')
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || marker || loadFailed || isControlTarget(event.target)) { gesture.current = null; return }
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    if (start && start.id === event.pointerId
      && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) gesture.current = null
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    gesture.current = null
    // With the marker out every tap is a mark, never a page turn.
    if (marker || loadFailed || isControlTarget(event.target)) return
    if (!start || start.id !== event.pointerId) return
    if (Date.now() - start.at > TAP_MS) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return
    const box = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - box.left) / Math.max(1, box.width)
    if (position <= TURN_ZONE) paper.current?.turn(-1)
    else if (position >= 1 - TURN_ZONE) paper.current?.turn(1)
    else if (reading) revealControls()
    else hideControls()
  }


  return <>
    <input
      ref={input}
      type="file"
      hidden
      // The app has other PDF pickers (multitrack sheet music, benchmark
      // upload). This one is the practice item's own music.
      data-practice-chart-input=""
      accept={sheetMusicAcceptAttribute()}
      onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        if (chart && !await showConfirm({ title: 'Replace this score?', message: 'Replacing the music will remove its markings. Your recordings and tool settings will stay.', confirmLabel: 'Replace music', destructive: true })) return
        setBusy(true)
        setError('')
        try {
          setChart(await savePracticeChart(projectId, file))
          if (chart && onScoreReplaced) await onScoreReplaced(file.name)
          clearInkStrokes(projectId)
          restoreInk([])
          setMarker(null)
          setPaperVisible(true)
          setView(loadChartView(projectId))
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not save this music.')
        } finally {
          setBusy(false)
        }
      }}
    />

    {mounted && chart && (
      <div
        ref={paperSurface}
        className="practice-chart-paper"
        data-marking={marker ? 'true' : undefined}
        data-controls-hidden={reading ? 'true' : undefined}
        data-inactive={showing ? undefined : 'true'}
        aria-hidden={showing ? undefined : true}
        inert={!showing}
        tabIndex={showing ? 0 : -1}
        role="region"
        aria-label="Music score"
        aria-description="Tap the left or right third to turn pages. Tap the center to show or hide controls. With the score focused, use arrow keys to turn pages and Enter to toggle controls."
        onPointerDown={showing ? onPointerDown : undefined}
        onPointerMove={showing ? onPointerMove : undefined}
        onTouchStartCapture={event => { if (event.touches.length > 1) gesture.current = null }}
        onPointerUp={showing ? onPointerUp : undefined}
        onPointerCancel={() => { gesture.current = null }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || marker || loadFailed || event.altKey || event.ctrlKey || event.metaKey) return
          if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); paper.current?.turn(-1) }
          else if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); paper.current?.turn(1) }
          else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
            event.preventDefault()
            if (reading) revealControls(true)
            else hideControls()
          }
        }}
      >
        <PracticeChartPaper
          key={paperKey ?? 'chart'}
          chart={chart}
          fit={view.fit}
          halfTurn={view.halfTurn}
          initialFraction={view.fraction}
          handleRef={paper}
          onView={setPageView}
          onZoom={setPageZoom}
          onFraction={handleFraction}
          onError={handleError}
          onLoadFailed={handleLoadFailed}
          onSpreadAvailable={handleSpreadAvailable}
          strokes={strokes}
          marker={marker}
          onMarkStart={tuckMarkupMenu}
          inkWidth={inkWidth}
          onStroke={handleStroke}
          onErase={eraseAt}
          onEraseStart={beginErase}
          onEraseEnd={finishErase}
        />
        {reading && <button type="button" className="practice-chart-reveal" onClick={() => revealControls(true)}>Show music controls</button>}
        <div ref={topbar} className="practice-chart-topbar" inert={reading} aria-hidden={reading}>
        <div className="practice-chart-tools">
        {marker ? <MarkupToolbar
          marker={marker} penColour={penColour} canUndo={canUndo} canRedo={canRedo}
          menuOpen={musicMenu === 'markup'} menuId={musicMenuId}
          onPen={() => pickMarker(penColour)} onErase={() => pickMarker(marker === 'eraser' ? penColour : 'eraser')}
          onUndo={undoStroke} onRedo={redoStroke}
          onOptions={anchor => openMusicMenu('markup', anchor)} onDone={() => dismissMusicMenu(true)}
        /> : <div className="practice-chart-controls">
          {setlistMenu ?? <button type="button" className="practice-chart-control" onClick={onClose} disabled={isRecording || isStopping}><ArrowLeft aria-hidden /><span>Library</span></button>}
          <span className="practice-chart-title" title={chart.fileName}>{chart.fileName.replace(/\.[^.]+$/, '')}</span>
          <button type="button" className="practice-chart-control practice-chart-control--page" aria-label="Page controls" data-music-menu-trigger="page" aria-haspopup="dialog" aria-expanded={musicMenu === 'page'} aria-controls={`${musicMenuId}-page`} onClick={event => openMusicMenu('page', event.currentTarget)}><FileMusic aria-hidden /><span>Page</span></button>
          <button type="button" className="practice-chart-control practice-chart-control--mark-up" aria-label="Mark up this score" data-music-menu-trigger="markup" aria-haspopup="dialog" aria-expanded={musicMenu === 'markup'} aria-controls={`${musicMenuId}-markup`} onClick={event => openMusicMenu('markup', event.currentTarget)}><Pen aria-hidden /><span>Mark up</span></button>
          <button
            type="button"
            className="practice-chart-control practice-chart-control--start"
            aria-label={chromeOff ? 'Exit full screen' : 'Full screen'}
            aria-pressed={chromeOff}
            onClick={() => setChromeOff(!chromeOff)}
          >
            {chromeOff ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            <span>{chromeOff ? 'Exit full screen' : 'Full screen'}</span>
          </button>
          <button type="button" ref={workspaceTrigger} className="practice-chart-control" aria-label="Workspace" aria-expanded={workspaceOpen}
            data-guidance="music-workspace" aria-controls="music-workspace-tools" onClick={() => {
              dismissMusicMenu()
              if (!workspaceOpen) onToolRailOpenChange?.(true)
              setWorkspaceOpen(open => !open)
            }}>
            <Grid2X2 aria-hidden /><span>Workspace</span>
          </button>
        </div>}
        </div>
        </div>
        {workspaceOpen && (toolHost ? createPortal(
          <div ref={workspacePanel} className="practice-chart-workspace" id="music-workspace-tools" role="toolbar" aria-label="Workspace widgets">
            {MUSIC_WORKSPACE_TOOLS.map(({ key, label, icon: Icon }) => key === 'audioEnhancerEnabled' ? (
              <button key={key} type="button" aria-pressed={workspace[key]}
                onClick={() => onWorkspaceChange(key, !workspace[key])}>
                <Icon aria-hidden /><span>{label}</span>
              </button>
            ) : (
              <div key={key} className="practice-chart-workspace__tool" data-enabled={workspace[key] ? 'true' : undefined}>
                <button type="button" onClick={() => { onWorkspaceChange(key, true); closeWorkspace() }}>
                  <Icon aria-hidden /><span>{label}</span>
                </button>
                {workspace[key] && <button type="button" className="practice-chart-workspace__remove" aria-label={`Remove ${label} from workspace`}
                  onClick={event => {
                    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
                    onWorkspaceChange(key, false)
                  }}><X aria-hidden /></button>}
              </div>
            ))}
            {onReferencesChange && <div className="practice-chart-workspace__tool" data-enabled={referencesVisible ? 'true' : undefined}>
              <button type="button" onClick={() => { onReferencesChange(true); closeWorkspace() }}>
                <FileMusic aria-hidden /><span>References</span>
              </button>
              {referencesVisible && <button type="button" className="practice-chart-workspace__remove" aria-label="Remove References from workspace" onClick={event => {
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
                onReferencesChange(false)
              }}><X aria-hidden /></button>}
            </div>}
            <button type="button" aria-pressed={handsFreeEnabled} onClick={onToggleHandsFree}>
              <MicVocal aria-hidden /><span>Hands-Free</span>
            </button>
          </div>, toolHost) : null)}
        {/*
          * In full screen the deck is away, and the whole point of the page
          * being on a stand is that the player is holding an instrument. The
          * rail is the record orbit's own control, no more: one button, down
          * the left margin where the staff is not, and only while the deck it
          * stands in for is actually put away.
          */}
        {chromeHidden && (
          <div className="practice-chart-rail" data-dim={marker ? 'true' : undefined}
            data-active={isRecording || isStopping || handsFreeEnabled ? 'true' : undefined}
            inert={reading && !isRecording && !isStopping && !handsFreeEnabled}
            aria-hidden={reading && !isRecording && !isStopping && !handsFreeEnabled}>
            <button
              type="button"
              className="practice-chart-rail__record"
              data-recording={isRecording ? 'true' : undefined}
              data-hands-free={handsFreeEnabled ? 'true' : undefined}
              disabled={isStopping || (!recordReady && !isRecording)}
              aria-label={isRecording
                ? 'Stop recording. Long press to turn hands-free practice off.'
                : handsFreeEnabled
                  ? 'Start recording. Long press to turn hands-free practice off.'
                  : 'Start recording. Long press to turn hands-free practice on.'}
              aria-pressed={handsFreeEnabled}
              {...railRecordHandlers}
            >
              {isRecording ? <Square aria-hidden /> : <i aria-hidden />}
            </button>
            {/* One line, and only when there is something to say: the phase
                while hands-free is running it, the clock while a take is
                actually being recorded, and nothing at all otherwise. */}
            {handsFreeEnabled && handsFreePhase && !isRecording && (
              <span className="practice-chart-rail__status" aria-live="polite">
                <Ear aria-hidden />{HANDS_FREE_LABEL[handsFreePhase]}
              </span>
            )}
            {isRecording && (
              <span className="practice-chart-rail__elapsed" aria-live="polite">
                {formatElapsed(recordElapsed)}
              </span>
            )}
          </div>
        )}
        {loadFailed ? (
          <div className="practice-chart-failed" role="alert">
            <p>{error || 'This file could not be opened.'}</p>
            <div>
              <button type="button" disabled={busy} onClick={pick}>Choose another file</button>
              <button type="button" onClick={() => handlePaperVisible(false)}>Hide page</button>
            </div>
          </div>
        ) : (
          <div className={`practice-chart-hint${hint ? ' practice-chart-hint--on' : ''}`} aria-hidden>
            <span>Tap left or right to turn · Tap center for controls</span>
          </div>
        )}
      </div>
    )}

    {showingLoading && (
      <div className="practice-chart-paper practice-chart-paper--empty">
        <div className="practice-chart-empty" role="status" aria-live="polite">
          <FileMusic aria-hidden />
          <h2>Opening music</h2>
          <p>Your part is coming onto the stand.</p>
        </div>
      </div>
    )}

    {showingEmpty && (
      <div className="practice-chart-paper practice-chart-paper--empty">
        <div className="practice-chart-empty" role="group" aria-labelledby="practice-chart-empty-title">
          <FileMusic aria-hidden />
          <h2 id="practice-chart-empty-title">No music on the stand</h2>
          <p>Upload a PDF or a photo of the part to practice from it here.</p>
          {error && <p className="practice-chart-empty__error" role="alert">{error}</p>}
          <div>
            <button type="button" disabled={busy} onClick={pick}>
              <Upload aria-hidden />{busy ? 'Opening…' : 'Upload music'}
            </button>
            <button type="button" onClick={onClose}>Not now</button>
          </div>
        </div>
      </div>
    )}

    {active && inkSaveFailed && <div className="practice-chart-ink-warning" role="alert">
      <p>Your marking changes could not be saved. Keep this score open and save a PDF copy before leaving.</p>
      <button type="button" disabled={saving} onClick={() => void saveMarked()}>{saving ? 'Saving…' : 'Save PDF copy'}</button>
      <button type="button" onClick={() => setInkSaveFailed(!saveInkStrokes(projectId, strokesRef.current, chart?.attachmentId ?? null))}>Retry saving markings</button>
    </div>}

    <MusicWidget
      boundaryRef={boundaryRef}
      visible={active}
      menuMode={musicMenu}
      menuAnchor={musicMenuAnchor}
      menuId={musicMenuId}
      onDismiss={dismissMusicMenu}
      hasChart={chart !== null}
      fileName={chart?.fileName ?? null}
      pageView={pageView}
      paperVisible={paperVisible}
      busy={busy}
      error={error}
      fit={view.fit}
      spreadAvailable={spreadAvailable}
      halfTurn={view.halfTurn}
      zoom={pageZoom}
      onZoomChange={direction => paper.current?.zoomBy(direction)}
      onResetZoom={() => paper.current?.resetZoom()}
      marker={marker}
      inkWidth={inkWidth}
      markCount={strokes.length}
      canUndo={canUndo}
      canRedo={canRedo}
      saving={saving}
      onMarkerChange={pickMarker}
      onInkWidthChange={width => { saveInkWidth(width); setInkWidth(width) }}
      onUndoMark={undoStroke}
      onRedoMark={redoStroke}
      onClearMarks={clearMarks}
      onSaveMarked={() => void saveMarked()}
      onAdd={pick}
      onRemove={() => void remove()}
      onTurn={direction => paper.current?.turn(direction)}
      onFitChange={fit => { paper.current?.resetZoom(); updateView({ fit }) }}
      onHalfTurnChange={halfTurn => updateView({ halfTurn })}
      onPaperVisibleChange={handlePaperVisible}
    />
  </>
}
