import { AnimatePresence } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import {
  Check, ChevronLeft, ChevronRight, Eraser, EyeOff, FileMusic, Plus, RefreshCw,
  Share, SquareSplitVertical, Trash2, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { PremiumMotionDiv } from '../ui/PremiumMotionSurface'
import type { ChartFitPreference } from './chartLayout'
import { INK_CSS, INK_WIDTH_PX, INK_WIDTHS, type InkTool, type InkWidth } from './chartInk'
import type { ChartPaperView } from './PracticeChartPaper'
import '../music-control-menu.css'

export type MusicMenuMode = 'page' | 'markup'

interface MusicWidgetProps {
  boundaryRef: RefObject<HTMLElement | null>
  visible: boolean
  menuMode: MusicMenuMode | null
  menuAnchor: HTMLElement | null
  menuId: string
  onDismiss: (restoreFocus?: boolean) => void
  hasChart: boolean
  fileName: string | null
  pageView: ChartPaperView | null
  paperVisible: boolean
  busy: boolean
  error: string
  fit: ChartFitPreference
  zoom: number
  /** A two-page spread is only offered when two whole pages genuinely fit. */
  spreadAvailable: boolean
  halfTurn: boolean
  onAdd: () => void
  onRemove: () => void
  onTurn: (direction: 1 | -1) => void
  onFitChange: (fit: ChartFitPreference) => void
  onZoomChange: (direction: 1 | -1) => void
  onResetZoom: () => void
  onHalfTurnChange: (halfTurn: boolean) => void
  onPaperVisibleChange: (visible: boolean) => void
  marker: InkTool | null
  inkWidth: InkWidth
  markCount: number
  saving: boolean
  onMarkerChange: (tool: InkTool | null) => void
  onInkWidthChange: (width: InkWidth) => void
  onUndoMark: () => void
  onClearMarks: () => void
  onSaveMarked: () => void
}

function pageLabel(view: ChartPaperView | null): string {
  if (!view || view.count === 0) return 'Opening page…'
  const shown = view.first === view.last ? `${view.first + 1}` : `${view.first + 1}–${view.last + 1}`
  return `${shown} / ${view.count}`
}

/** Two coordinated, non-modal menus. Markup leaves the score available to draw on. */
export default function MusicWidget({
  boundaryRef, visible, menuMode, menuAnchor, menuId, onDismiss, hasChart, fileName,
  pageView, paperVisible, busy, error, fit, zoom, spreadAvailable, halfTurn, onAdd, onRemove,
  onTurn, onFitChange, onZoomChange, onResetZoom, onHalfTurnChange, onPaperVisibleChange, marker, inkWidth,
  markCount, saving, onMarkerChange, onInkWidthChange, onUndoMark, onClearMarks, onSaveMarked,
}: MusicWidgetProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const open = visible && menuMode !== null
  const [placement, setPlacement] = useState({ left: 12, top: 72, maxHeight: 500, maxWidth: 292, origin: 'top right' })

  useLayoutEffect(() => {
    if (!open) return
    const bounds = boundaryRef.current
    const menu = menuRef.current
    if (!bounds || !menu) return
    const place = () => {
      const box = bounds.getBoundingClientRect()
      const anchor = menuAnchor?.isConnected ? menuAnchor.getBoundingClientRect() : null
      const scaleX = box.width / Math.max(1, bounds.clientWidth)
      const scaleY = box.height / Math.max(1, bounds.clientHeight)
      const viewport = window.visualViewport
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
      const topEdge = Math.max(12, (viewportTop - box.top + 12) / scaleY)
      const bottomEdge = Math.min(bounds.clientHeight - 12, (viewportBottom - box.top - 12) / scaleY)
      const below = anchor ? (anchor.bottom - box.top) / scaleY + 8 : topEdge + 60
      const above = anchor ? (anchor.top - box.top) / scaleY - 8 : topEdge
      const availableBelow = bottomEdge - below
      const aboveAnchor = availableBelow < Math.min(menu.scrollHeight, 220) && above - topEdge > availableBelow
      const maxHeight = Math.max(1, Math.min(bottomEdge - topEdge, aboveAnchor ? above - topEdge : bottomEdge - Math.max(topEdge, below)))
      const height = Math.min(menu.scrollHeight, maxHeight)
      const viewportRight = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)
      const rightEdge = Math.min(bounds.clientWidth - 12, (viewportRight - box.left - 12) / scaleX)
      const leftEdge = Math.max(12, ((viewport?.offsetLeft ?? 0) - box.left + 12) / scaleX)
      const desiredLeft = anchor ? (anchor.right - box.left) / scaleX - menu.offsetWidth : rightEdge - menu.offsetWidth
      const next = {
        left: Math.max(leftEdge, Math.min(rightEdge - menu.offsetWidth, desiredLeft)),
        top: Math.max(topEdge, Math.min(bottomEdge - height, aboveAnchor ? above - height : below)),
        maxHeight, maxWidth: Math.max(1, rightEdge - leftEdge), origin: aboveAnchor ? 'bottom right' : 'top right',
      }
      setPlacement(previous => Object.entries(next).every(([key, value]) => previous[key as keyof typeof previous] === value) ? previous : next)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(bounds)
    observer.observe(menu)
    if (menuAnchor) observer.observe(menuAnchor)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [boundaryRef, menuAnchor, menuMode, open])

  useLayoutEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true })
  }, [menuMode, open])

  useEffect(() => {
    if (!open) return
    const dismissOutside = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || menuRef.current?.contains(target)) return
      // Trigger clicks own switching/toggling. A drawing gesture owns the score.
      if (target.closest('[data-music-menu-trigger]')) return
      if (menuMode === 'markup' && target.closest('.practice-chart-scroll')) return
      onDismiss(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      onDismiss(true)
    }
    const focusOutside = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof Element) || menuRef.current?.contains(target)) return
      if (target.closest('[data-music-menu-trigger]')) return
      if (menuMode === 'markup' && target.closest('.practice-chart-scroll')) return
      onDismiss(false)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('keydown', escape)
    document.addEventListener('focusin', focusOutside)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('focusin', focusOutside)
    }
  }, [menuMode, onDismiss, open])

  const turnable = hasChart && paperVisible && (pageView?.count ?? 0) > 0
  const currentZoom = Math.min(3, Math.max(1, Number.isFinite(zoom) ? zoom : 1))
  const zoomPercent = Math.round(currentZoom * 100)
  const activeFit = fit === 'auto' ? spreadAvailable ? 'spread' : 'page' : fit
  const fitOptions: { value: ChartFitPreference; label: string; detail: string }[] = [
    { value: 'page', label: 'One page', detail: 'See the whole part' },
    ...(spreadAvailable ? [{ value: 'spread' as const, label: 'Two pages', detail: 'Read a facing spread' }] : []),
    { value: 'width', label: 'Fill width', detail: halfTurn ? 'Larger notes, half-screen turns' : 'Larger notes, scroll to read' },
  ]
  const host = boundaryRef.current
  if (!host) return null

  return createPortal(<AnimatePresence initial={false}>
    {open && <PremiumMotionDiv
      key="music-controls"
      ref={menuRef}
      id={`${menuId}-${menuMode}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${menuId}-${menuMode}-title`}
      className={`music-control-menu music-control-menu--${menuMode}`}
      title={fileName ?? undefined}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -7, scale: .975 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: .985 }}
      transition={{ duration: reducedMotion ? .1 : .2, ease: [.16, 1, .3, 1] }}
      style={{ left: placement.left, top: placement.top, maxHeight: placement.maxHeight, maxWidth: placement.maxWidth, transformOrigin: placement.origin }}
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}
    >
      <div className="music-control-menu__head">
        <div>
          <h2 id={`${menuId}-${menuMode}-title`}>{menuMode === 'markup' ? 'Mark up' : 'Page'}</h2>
          <span>{menuMode === 'markup' ? 'Draw on the score' : pageLabel(pageView)}</span>
        </div>
        <button ref={closeRef} type="button" className="music-control-menu__close" aria-label={menuMode === 'markup' ? 'Done marking' : 'Close page controls'} onClick={() => onDismiss(true)}>
          {menuMode === 'markup' ? <><Check aria-hidden /><span>Done</span></> : <X aria-hidden />}
        </button>
      </div>

      {hasChart ? menuMode === 'page' ? <>
        <div className="music-control-menu__section" role="group" aria-label="Page size">
          {fitOptions.map(option => <button key={option.value} type="button" className="music-control-menu__choice" aria-pressed={activeFit === option.value}
            onClick={() => { onFitChange(option.value); onDismiss(true) }}>
            <span><strong>{option.label}</strong><small>{option.detail}</small></span>
            {activeFit === option.value && <Check aria-hidden />}
          </button>)}
        </div>
        <div className="music-control-menu__section music-control-menu__zoom" role="group" aria-label="Zoom" aria-describedby={`${menuId}-zoom-hint`}>
          <div className="music-control-menu__zoom-controls">
            <button type="button" aria-label="Zoom out" disabled={!turnable || currentZoom <= 1} onClick={() => onZoomChange(-1)}><ZoomOut aria-hidden /></button>
            <button type="button" className="music-control-menu__zoom-reset" aria-label={`Reset zoom to 100%, current zoom ${zoomPercent}%`} disabled={!turnable} onClick={onResetZoom}>
              <span aria-live="polite">{zoomPercent}%</span><small>Reset</small>
            </button>
            <button type="button" aria-label="Zoom in" disabled={!turnable || currentZoom >= 3} onClick={() => onZoomChange(1)}><ZoomIn aria-hidden /></button>
          </div>
          <p id={`${menuId}-zoom-hint`} className="music-control-menu__zoom-hint">Pinch to zoom. Turning resets zoom.</p>
        </div>
        <button type="button" className="music-control-menu__row" aria-pressed={halfTurn} onClick={() => onHalfTurnChange(!halfTurn)}>
          <SquareSplitVertical aria-hidden /><span>Half-page turns</span><i className="music-control-menu__switch" aria-hidden />
        </button>
        <div className="music-control-menu__turn" role="group" aria-label="Turn the page">
          <button type="button" disabled={!turnable} onClick={() => onTurn(-1)}><ChevronLeft aria-hidden />Previous</button>
          <button type="button" disabled={!turnable} onClick={() => onTurn(1)}>Next<ChevronRight aria-hidden /></button>
        </div>
        <div className="music-control-menu__section music-control-menu__files" role="group" aria-label="Music file">
          <button type="button" className="music-control-menu__row" disabled={busy} onClick={onAdd}><RefreshCw aria-hidden /><span>Replace music</span></button>
          <button type="button" className="music-control-menu__row" onClick={() => onPaperVisibleChange(false)}><EyeOff aria-hidden /><span>Hide page</span></button>
          <button type="button" className="music-control-menu__row music-control-menu__row--remove" disabled={busy} onClick={onRemove}><Trash2 aria-hidden /><span>Remove music</span></button>
        </div>
      </> : <>
        <div className="music-control-menu__pens" role="group" aria-label="Drawing tool">
          {(['black', 'red'] as const).map(colour => <button key={colour} type="button" aria-label={`${colour} marker`} aria-pressed={marker === colour} onClick={() => onMarkerChange(colour)}>
            <i style={{ background: INK_CSS[colour] }} aria-hidden /><span>{colour === 'black' ? 'Black' : 'Red'}</span>
          </button>)}
          <button type="button" aria-label="Eraser" aria-pressed={marker === 'eraser'} onClick={() => onMarkerChange('eraser')}><Eraser aria-hidden /><span>Erase</span></button>
        </div>
        <div className="music-control-menu__width" role="group" aria-label="Marker thickness">
          <span className="music-control-menu__label">Pen size</span>
          <div>{INK_WIDTHS.map(width => <button key={width} type="button" aria-label={`${width} marker`} aria-pressed={inkWidth === width} disabled={marker === 'eraser'} onClick={() => onInkWidthChange(width)}>
            <i style={{ width: INK_WIDTH_PX[width] + 4, height: INK_WIDTH_PX[width] + 4 }} aria-hidden />
            {width === 'fine' ? 'Fine' : width === 'medium' ? 'Medium' : 'Bold'}
          </button>)}</div>
        </div>
        <div className="music-control-menu__edits" role="group" aria-label="Edit markings">
          <button type="button" disabled={markCount === 0} onClick={onUndoMark}><Undo2 aria-hidden />Undo</button>
          <button type="button" disabled={markCount === 0} onClick={onClearMarks}><Trash2 aria-hidden />Clear</button>
        </div>
        <button type="button" className="music-control-menu__save" disabled={markCount === 0 || saving} onClick={onSaveMarked}><Share aria-hidden />{saving ? 'Saving…' : 'Save marked PDF'}</button>
      </> : <>
        <button type="button" className="music-control-menu__save" disabled={busy} onClick={onAdd}><Plus aria-hidden />Add music</button>
        <p className="music-control-menu__hint"><FileMusic aria-hidden />Choose a PDF or a photo of your part.</p>
      </>}
      {error && <p className="music-control-menu__error" role="alert">{error}</p>}
    </PremiumMotionDiv>}
  </AnimatePresence>, host)
}
