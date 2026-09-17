import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { sheetMusicAcceptAttribute } from '../multitrack/sheetMusic/sheetMusicUtils'
import {
  DEFAULT_CHART_VIEW, deletePracticeChart, isChartVisible, loadChartView, loadPracticeChart,
  savePracticeChart, saveChartView, setChartVisible,
  type ChartView, type PracticeChart,
} from '../utils/practiceChartStorage'
import MusicWidget from './practiceChart/MusicWidget'
import {
  clearInkStrokes, loadInkStrokes, loadInkWidth, saveInkStrokes, saveInkWidth,
  type InkColour, type InkStroke, type InkWidth,
} from './practiceChart/chartInk'
import { shareMarkedChart } from './practiceChart/chartExport'
import PracticeChartPaper, { type ChartPaperHandle, type ChartPaperView } from './practiceChart/PracticeChartPaper'
import { closeCachedPdfChart } from './practiceChart/chartDocument'
import './practice-chart.css'

/** A tap this short and this still is a page turn; anything else is a scroll. */
const TAP_SLOP_PX = 8
const TAP_MS = 500
/** How much of each edge turns the page. The middle is for reading. */
const TURN_ZONE = 0.22
const HINT_MS = 2600

interface PracticeChartLayerProps {
  projectId: string
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
  projectId, active, boundaryRef, collapseResetKey, onClose, onPaperVisibleChange,
  onChromeHiddenChange,
}: PracticeChartLayerProps) {
  const input = useRef<HTMLInputElement>(null)
  const paper = useRef<ChartPaperHandle | null>(null)
  const [chart, setChart] = useState<PracticeChart | null>(null)
  const [view, setView] = useState<ChartView>(DEFAULT_CHART_VIEW)
  const [paperVisible, setPaperVisible] = useState(true)
  const [pageView, setPageView] = useState<ChartPaperView | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [spreadAvailable, setSpreadAvailable] = useState(false)
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  /*
   * The marker is picked up for a moment and put down again, so it is not
   * remembered: a part must never open in marking mode, where the first tap
   * to turn the page would draw on it instead.
   */
  const [marker, setMarker] = useState<InkColour | null>(null)
  const [inkWidth, setInkWidth] = useState<InkWidth>(loadInkWidth)
  /*
   * Rehearsal view is a mode you step into, not a setting you keep. Remembered,
   * it would mean opening a part next week to an app with no tabs and no deck
   * and no memory of asking for that — which reads as broken, not as a feature.
   */
  const [chromeOff, setChromeOff] = useState(false)
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
    void loadPracticeChart(projectId)
      .then(value => { if (!cancelled) setChart(value) })
      .catch(() => { if (!cancelled) setError('Could not load this music. Try adding the file again.') })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [projectId])

  const paperKey = chart ? `${projectId}:${chart.fileName}:${chart.bytes?.byteLength ?? 0}` : null
  useEffect(() => {
    setPageView(null)
    setLoadFailed(false)
  }, [paperKey])

  const showing = active && paperVisible && chart !== null
  useEffect(() => { onPaperVisibleChange(showing) }, [onPaperVisibleChange, showing])

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
      const tabs = document.querySelector('.audio-practice-top-tabs')
      const top = tabs ? Math.max(0, Math.round(tabs.getBoundingClientRect().bottom)) : 0
      if (top > 0) root.style.setProperty('--music-page-top', `${top}px`)
      else root.style.removeProperty('--music-page-top')

      const deck = document.querySelector('.app-hud-bottom')
      const deckTop = deck ? deck.getBoundingClientRect().top : 0
      const height = window.visualViewport?.height ?? window.innerHeight
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
  }, [showing])

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

  const remove = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await deletePracticeChart(projectId)
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
    if (Date.now() - start.at > TAP_MS) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return
    const box = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - box.left) / Math.max(1, box.width)
    if (position <= TURN_ZONE) paper.current?.turn(-1)
    else if (position >= 1 - TURN_ZONE) paper.current?.turn(1)
  }

  if (!active) return null

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

    {showing && chart && (
      <div
        className="practice-chart-paper"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
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
        />
        {chromeHidden && !marker && (
          <button
            type="button"
            className="practice-chart-restore"
            aria-label="Show the tabs and the deck"
            onClick={() => setChromeOff(false)}
          >
            <span aria-hidden />
          </button>
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
      onClose={onClose}
    />
  </>
}
