import { motion, useMotionValue } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Eye, EyeOff, FileMusic, Plus, RefreshCw,
  SquareSplitVertical, Trash2,
} from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import WidgetCollapseButton from '../WidgetCollapseButton'
import { useCollapsibleWidget } from '../useCollapsibleWidget'
import {
  clampWidgetPosition, getFloatingWidgetTopCenter, loadWidgetPosition, saveWidgetPosition,
} from '../../utils/floatingWidgetLayout'
import { iosDragRelease, motionExitHide } from '../../utils/motionPresets'
import type { ChartFitPreference } from './chartLayout'
import type { ChartPaperView } from './PracticeChartPaper'

const POSITION_ID = 'desk-music'

interface MusicWidgetProps {
  boundaryRef: RefObject<HTMLElement | null>
  visible: boolean
  collapseResetKey?: string
  hasChart: boolean
  fileName: string | null
  pageView: ChartPaperView | null
  paperVisible: boolean
  busy: boolean
  error: string
  fit: ChartFitPreference
  /** A two-page spread is only offered when two whole pages genuinely fit. */
  spreadAvailable: boolean
  halfTurn: boolean
  onAdd: () => void
  onRemove: () => void
  onTurn: (direction: 1 | -1) => void
  onFitChange: (fit: ChartFitPreference) => void
  onHalfTurnChange: (halfTurn: boolean) => void
  onPaperVisibleChange: (visible: boolean) => void
  onClose: () => void
}

function pageLabel(view: ChartPaperView | null): string {
  if (!view || view.count === 0) return ''
  const shown = view.first === view.last ? `${view.first + 1}` : `${view.first + 1}–${view.last + 1}`
  return `${shown}/${view.count}`
}

/**
 * The music control, in the same language as every other tool on the desk: a
 * ball on the edge until you need it, the real panel when you tap it. It is
 * deliberately not a pill parked over the staff — a control that covers a line
 * of music is worse than no control at all.
 */
export default function MusicWidget({
  boundaryRef, visible, collapseResetKey, hasChart, fileName, pageView, paperVisible,
  busy, error, fit, spreadAvailable, halfTurn, onAdd, onRemove, onTurn, onFitChange,
  onHalfTurnChange, onPaperVisibleChange, onClose,
}: MusicWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const placed = useRef(false)

  useLayoutEffect(() => {
    if (placed.current) return
    const bounds = boundaryRef.current
    if (!bounds) return
    const saved = loadWidgetPosition(POSITION_ID)
    const start = saved ?? getFloatingWidgetTopCenter(
      bounds.clientWidth, bounds.clientHeight,
      widgetRef.current?.offsetWidth ?? 264, widgetRef.current?.offsetHeight ?? 210, 96,
    )
    dragX.set(start.x)
    dragY.set(start.y)
    placed.current = true
  }, [boundaryRef, dragX, dragY])

  useLayoutEffect(() => {
    const bounds = boundaryRef.current
    const widget = widgetRef.current
    if (!bounds || !widget) return
    const fitInside = () => {
      const next = clampWidgetPosition(bounds.clientWidth, bounds.clientHeight,
        widget.offsetWidth, widget.offsetHeight, dragX.get(), dragY.get())
      dragX.set(next.x)
      dragY.set(next.y)
    }
    const observer = new ResizeObserver(fitInside)
    observer.observe(bounds)
    observer.observe(widget)
    return () => observer.disconnect()
  }, [boundaryRef, dragX, dragY])

  const persist = useCallback(() => saveWidgetPosition(POSITION_ID, dragX.get(), dragY.get()), [dragX, dragY])

  // A page number on the ball would be a lie while the page is down.
  const label = paperVisible ? pageLabel(pageView) : ''
  const fold = useCollapsibleWidget({
    boundaryRef, widgetRef, x: dragX, y: dragY, positionId: POSITION_ID,
    label: 'music', icon: <FileMusic aria-hidden />, detail: label || 'Music',
    active: hasChart && paperVisible, resetKey: collapseResetKey, ballSlot: 4, visible,
  })

  const turnable = hasChart && paperVisible && (pageView?.count ?? 0) > 0

  return <>
    {fold.ball}
    <motion.div
      ref={widgetRef}
      aria-hidden={fold.collapsed}
      drag
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      onDragEnd={persist}
      className={`music-widget pointer-events-auto absolute left-0 top-0 z-20 touch-none ${fold.collapsed ? 'widget-is-collapsed' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={fold.panelAnimation}
      exit={{ opacity: 0, scale: 0.94, transitionEnd: motionExitHide }}
      transition={iosDragRelease}
      style={{ x: dragX, y: dragY, touchAction: 'none' }}
    >
      <WidgetCollapseButton label="music" onCollapse={fold.collapse} />
      <div className="music-widget__panel ui-orient-spin">
        <button
          type="button"
          className="music-widget__close"
          aria-label="Turn music off"
          onClick={event => { event.stopPropagation(); onClose() }}
          onPointerDown={event => event.stopPropagation()}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {hasChart ? <>
          <p className="music-widget__file" title={fileName ?? undefined}>{fileName ?? 'Music'}</p>

          <div className="music-widget__turn" role="group" aria-label="Turn the page">
            <button type="button" aria-label="Previous page" disabled={!turnable} onClick={() => onTurn(-1)}>
              <ChevronLeft aria-hidden />
            </button>
            <span aria-live="polite">{label || '—'}</span>
            <button type="button" aria-label="Next page" disabled={!turnable} onClick={() => onTurn(1)}>
              <ChevronRight aria-hidden />
            </button>
          </div>

          <button
            type="button"
            className="music-widget__row"
            aria-pressed={halfTurn}
            onClick={() => onHalfTurnChange(!halfTurn)}
          >
            <SquareSplitVertical aria-hidden />
            <span>Half turns<small>Bring the next page up halfway</small></span>
            <i aria-hidden />
          </button>

          <div
            className={`music-widget__fit${spreadAvailable ? ' music-widget__fit--three' : ''}`}
            role="group"
            aria-label="Page size"
          >
            <button type="button" aria-pressed={fit === 'page' || (fit === 'auto' && !spreadAvailable)} onClick={() => onFitChange('page')}>One page</button>
            {spreadAvailable && (
              <button type="button" aria-pressed={fit === 'spread' || fit === 'auto'} onClick={() => onFitChange('spread')}>Two pages</button>
            )}
            <button type="button" aria-pressed={fit === 'width'} onClick={() => onFitChange('width')}>Fill width</button>
          </div>

          <div className="music-widget__actions">
            <button type="button" onClick={() => onPaperVisibleChange(!paperVisible)}>
              {paperVisible ? <><EyeOff aria-hidden />Hide page</> : <><Eye aria-hidden />Show page</>}
            </button>
            <button type="button" disabled={busy} onClick={onAdd}><RefreshCw aria-hidden />Replace</button>
            <button type="button" disabled={busy} onClick={onRemove}><Trash2 aria-hidden />Remove</button>
          </div>
        </> : <>
          <p className="music-widget__file">No music on this item</p>
          <button type="button" className="music-widget__add" disabled={busy} onClick={onAdd}>
            <Plus aria-hidden />Add music
          </button>
          <p className="music-widget__hint">
            A PDF or a photo of the part — from Files, from Photos, or shared out of forScore as a
            flattened PDF. It is saved in this practice folder, next to your takes.
          </p>
        </>}

        {error && <p className="music-widget__error" role="alert">{error}</p>}
      </div>
    </motion.div>
  </>
}
