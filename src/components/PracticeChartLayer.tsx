import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { AudioLines, Ear, FileMusic, Grid2X2, Maximize2, MicVocal, Minimize2, Radio, Square, Upload, X } from 'lucide-react'
import { MetronomeToolIcon, TakesToolIcon } from './icons/toolIcons'
import { useLongPress } from '../hooks/useLongPress'
import type { HandsFreePhase } from '../utils/handsFreePhase'
import { sheetMusicAcceptAttribute } from '../multitrack/sheetMusic/sheetMusicUtils'
import {
  DEFAULT_CHART_VIEW, deletePracticeChart, isChartVisible, loadChartView, loadPracticeChart,
  savePracticeChart, saveChartView, setChartVisible,
  type ChartView, type PracticeChart,
} from '../utils/practiceChartStorage'
import MusicWidget from './practiceChart/MusicWidget'
import type { HudQuickSettings } from '../utils/hudQuickSettings'


import {
  clearInkStrokes, eraseStrokesAt, loadInkStrokes, loadInkWidth, saveInkStrokes, saveInkWidth,
  type InkStroke, type InkTool, type InkWidth,
} from './practiceChart/chartInk'
import { shareMarkedChart } from './practiceChart/chartExport'
import PracticeChartPaper, { type ChartPaperHandle, type ChartPaperView } from './practiceChart/PracticeChartPaper'
import { closeCachedPdfChart } from './practiceChart/chartDocument'
import './practice-chart.css'

type MusicWorkspaceKey = Exclude<keyof HudQuickSettings, 'showMusic' | 'audioEnhancerEnabled'>
const MUSIC_WORKSPACE_TOOLS = [
  { key: 'pitchTrackerEnabled', label: 'Pitch', icon: AudioLines },
  { key: 'showMetronome', label: 'Metronome', icon: MetronomeToolIcon },
  { key: 'showDrone', label: 'Drone', icon: Radio },
  { key: 'showTakeCards', label: 'Takes', icon: TakesToolIcon },
] as const

/** A tap this short and this still is a page turn; anything else is a scroll. */
const TAP_SLOP_PX = 8
const TAP_MS = 500
/** How much of each edge turns the page. The middle is for reading. */
const TURN_ZONE = 0.22
const HINT_MS = 2600

interface PracticeChartLayerProps {
  projectId: string
  workspace: HudQuickSettings
  onWorkspaceChange: (key: MusicWorkspaceKey, enabled: boolean) => void
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
}: PracticeChartLayerProps) {
  const input = useRef<HTMLInputElement>(null)
  const paper = useRef<ChartPaperHandle | null>(null)
  const [chart, setChart] = useState<PracticeChart | null>(null)
  const [view, setView] = useState<ChartView>(DEFAULT_CHART_VIEW)
  const [paperVisible, setPaperVisible] = useState(true)
  const [pageView, setPageView] = useState<ChartPaperView | null>(null)
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [spreadAvailable, setSpreadAvailable] = useState(false)
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  /*
   * The marker is picked up for a moment and put down again, so it is not
   * remembered: a part must never open in marking mode, where the first tap
   * to turn the page would draw on it instead.
   */
  const [marker, setMarker] = useState<InkTool | null>(null)
  const [inkWidth, setInkWidth] = useState<InkWidth>(loadInkWidth)
  /*
   * Rehearsal view is a mode you step into, not a setting you keep. Remembered,
   * it would mean opening a part next week to an app with no tabs and no deck
   * and no memory of asking for that — which reads as broken, not as a feature.
   */
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [chromeOff, setChromeOff] = useState(false)
  // Full screen is for the page. The tool row waits behind Workspace, closed,
  // every time the player steps in.
  useEffect(() => { if (chromeOff) setWorkspaceOpen(false) }, [chromeOff])
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
    setStrokes(loadInkStrokes(projectId))
    setMarker(null)
    setChromeOff(false)
    setPaperVisible(isChartVisible(projectId))
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
  }, [projectId])

  const paperKey = chart ? `${projectId}:${chart.fileName}:${chart.bytes?.byteLength ?? 0}` : null
  useEffect(() => {
    setPageView(null)
    setLoadFailed(false)
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
  /*
   * An empty stand is still the music page. Without it, turning Music on for an
   * item with no part left the room exactly as it was apart from a ball on the
   * edge — it read as landing on Tools. The page comes up blank with the one
   * thing to do on it. The same is true while the file is still opening: the
   * stand has to be the room on the first frame, not Tools for a beat.
   */
  const showingEmpty = active && paperVisible && loaded && chart === null
  const showingLoading = active && paperVisible && !loaded
  useEffect(() => {
    onPaperVisibleChange(showing || showingEmpty || showingLoading)
  }, [onPaperVisibleChange, showing, showingEmpty, showingLoading])

  /*
   * A part opens full screen.
   *
   * Picking music is already the player saying what this screen is for, and a
   * part fitted into the band left over between the tabs and the deck is a
   * part you have to squint at. What made this unsafe before was that the way
   * out lived in a folded widget; the exit and the full-screen toggle now sit
   * in the page's own top corners, so there is nothing to be stranded in.
   *
   * Once per file: a player who leaves full screen and then hides and shows
   * the page again has said what they want, and it is not this.
   */
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!showing || !paperKey || opened.current === paperKey) return
    opened.current = paperKey
    setChromeOff(true)
  }, [paperKey, showing])

  /*
   * Rehearsal view only means anything while a part is up, and it must never
   * outlive one: chrome hidden with no page behind it is a room with no way
   * out.
   */
  const chromeHidden = showing && chromeOff
  useEffect(() => { onChromeHiddenChange(chromeHidden) }, [chromeHidden, onChromeHiddenChange])

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
      root.style.removeProperty('--music-page-top')
      root.style.removeProperty('--music-page-bottom')
    }
    if (!showing) {
      clear()
      return
    }
    const apply = () => {
      const tabs = document.querySelector(chromeHidden ? '.practice-chart-topbar' : '.audio-practice-top-tabs')
      const top = tabs ? Math.max(0, Math.round(tabs.getBoundingClientRect().bottom)) : 0
      if (top > 0) root.style.setProperty('--music-page-top', `${top}px`)
      else root.style.removeProperty('--music-page-top')

      const deck = document.querySelector('.app-hud-bottom')
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
  }, [showing, chromeHidden, workspaceOpen])

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
    setChartVisible(projectId, next)
    setPaperVisible(next)
  }, [projectId])

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

  const handleStroke = useCallback((stroke: InkStroke) => {
    setStrokes(current => {
      const next = [...current, stroke]
      saveInkStrokes(projectId, next)
      return next
    })
  }, [projectId])

  /*
   * The eraser moves faster than React re-renders, so it works from a mirror
   * of the list rather than from `strokes`: erasing off the last rendered
   * value would put every mark the finger already passed back on the page.
   */
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const eraseAt = useCallback((
    page: number, x: number, y: number, radiusX: number, radiusY: number,
  ) => {
    const next = eraseStrokesAt(strokesRef.current, page, x, y, radiusX, radiusY)
    if (!next) return
    strokesRef.current = next
    saveInkStrokes(projectId, next)
    setStrokes(next)
  }, [projectId])

  const undoStroke = useCallback(() => {
    setStrokes(current => {
      if (current.length === 0) return current
      const next = current.slice(0, -1)
      saveInkStrokes(projectId, next)
      return next
    })
  }, [projectId])

  const clearMarks = useCallback(() => {
    clearInkStrokes(projectId)
    setStrokes([])
  }, [projectId])

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
    setBusy(true)
    setError('')
    try {
      await deletePracticeChart(projectId)
      offered.current = projectId
      clearInkStrokes(projectId)
      setStrokes([])
      setMarker(null)
      setChart(null)
      setPageView(null)
      setPaperVisible(true)
    } catch {
      setError('Could not remove this music. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [projectId])

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

  const gesture = useRef<{ id: number; x: number; y: number; at: number } | null>(null)
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() }
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    gesture.current = null
    // With the marker out every tap is a mark, never a page turn.
    if (marker) return
    if (!start || start.id !== event.pointerId) return
    // The corner controls and the rail sit inside the turn zones; pressing one
    // of them is not a turn.
    if (event.target instanceof Element
      && event.target.closest('.practice-chart-topbar, .practice-chart-rail')) return
    if (Date.now() - start.at > TAP_MS) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return
    const box = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - box.left) / Math.max(1, box.width)
    if (position <= TURN_ZONE) paper.current?.turn(-1)
    else if (position >= 1 - TURN_ZONE) paper.current?.turn(1)
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
        setBusy(true)
        setError('')
        try {
          setChart(await savePracticeChart(projectId, file))
          clearInkStrokes(projectId)
          setStrokes([])
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
        className="practice-chart-paper"
        data-inactive={showing ? undefined : 'true'}
        aria-hidden={showing ? undefined : true}
        onPointerDown={showing ? onPointerDown : undefined}
        onPointerUp={showing ? onPointerUp : undefined}
        onPointerCancel={() => { gesture.current = null }}
      >
        <PracticeChartPaper
          key={paperKey ?? 'chart'}
          chart={chart}
          fit={view.fit}
          halfTurn={view.halfTurn}
          initialFraction={view.fraction}
          handleRef={paper}
          onView={setPageView}
          onFraction={handleFraction}
          onError={handleError}
          onLoadFailed={handleLoadFailed}
          onSpreadAvailable={handleSpreadAvailable}
          strokes={strokes}
          marker={marker}
          inkWidth={inkWidth}
          onStroke={handleStroke}
          onErase={eraseAt}
        />
        {/*
          * The two things a player needs from the page itself, in the corners
          * where no music is: how much screen the part gets, and the way out.
          * They stay put in full screen — hiding the exit inside the thing it
          * exits is how a player gets stranded on a page with no deck.
          */}
        <div className="practice-chart-topbar">
        <div className="practice-chart-controls" data-dim={marker ? 'true' : undefined}>
          <button
            type="button"
            className="practice-chart-control practice-chart-control--start"
            aria-pressed={chromeOff}
            onClick={() => setChromeOff(!chromeOff)}
          >
            {chromeOff ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            <span>{chromeOff ? 'Exit full screen' : 'Full screen'}</span>
          </button>
          {chromeOff && (
            <button type="button" className="practice-chart-control" aria-expanded={workspaceOpen}
              data-guidance="music-workspace" aria-controls="music-workspace-tools" onClick={() => setWorkspaceOpen(value => !value)}>
              <Grid2X2 aria-hidden /><span>Workspace</span>
            </button>
          )}
          <button
            type="button"
            className="practice-chart-control practice-chart-control--end"
            onClick={onClose}
          >
            <X aria-hidden />
            <span>Exit music</span>
          </button>
        </div>
        {chromeOff && workspaceOpen && (
          <div className="practice-chart-workspace" id="music-workspace-tools" role="toolbar" aria-label="Workspace widgets">
            {MUSIC_WORKSPACE_TOOLS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" aria-pressed={workspace[key]}
                onClick={() => onWorkspaceChange(key, !workspace[key])}>
                <Icon aria-hidden /><span>{label}</span>
              </button>
            ))}
            <button type="button" aria-pressed={handsFreeEnabled} onClick={onToggleHandsFree}>
              <MicVocal aria-hidden /><span>Hands-Free</span>
            </button>
          </div>
        )}
        </div>
        {/*
          * In full screen the deck is away, and the whole point of the page
          * being on a stand is that the player is holding an instrument. The
          * rail is the record orbit's own control, no more: one button, down
          * the left margin where the staff is not, and only while the deck it
          * stands in for is actually put away.
          */}
        {chromeOff && (
          <div className="practice-chart-rail" data-dim={marker ? 'true' : undefined}>
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
            <span>Tap to turn back</span>
            <span>Tap to turn</span>
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

    <MusicWidget
      boundaryRef={boundaryRef}
      visible={active}
      collapseResetKey={collapseResetKey}
      hasChart={chart !== null}
      fileName={chart?.fileName ?? null}
      pageView={pageView}
      paperVisible={paperVisible}
      busy={busy}
      error={error}
      fit={view.fit}
      spreadAvailable={spreadAvailable}
      halfTurn={view.halfTurn}
      chromeHidden={chromeOff}
      onChromeHiddenChange={setChromeOff}
      marker={marker}
      inkWidth={inkWidth}
      markCount={strokes.length}
      saving={saving}
      onMarkerChange={setMarker}
      onInkWidthChange={width => { saveInkWidth(width); setInkWidth(width) }}
      onUndoMark={undoStroke}
      onClearMarks={clearMarks}
      onSaveMarked={() => void saveMarked()}
      onAdd={pick}
      onRemove={() => void remove()}
      onTurn={direction => paper.current?.turn(direction)}
      onFitChange={fit => updateView({ fit })}
      onHalfTurnChange={halfTurn => updateView({ halfTurn })}
      onPaperVisibleChange={handlePaperVisible}
    />
  </>
}
