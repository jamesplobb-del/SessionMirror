import { motion, useMotionValue } from 'framer-motion'
import { Library } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, type ComponentProps, type RefObject } from 'react'
import WidgetCollapseButton from './WidgetCollapseButton'
import { useCollapsibleWidget } from './useCollapsibleWidget'
import TunerTakePillRow from './audioPractice/TunerTakePillRow'
import {
  clampWidgetPosition, getFloatingWidgetTopCenter, loadWidgetPosition, saveWidgetPosition,
} from '../utils/floatingWidgetLayout'
import { iosDragRelease, motionExitHide } from '../utils/motionPresets'

const POSITION_ID = 'desk-takes'

type PillProps = Omit<ComponentProps<typeof TunerTakePillRow>, 'compact' | 'ariaLabel'>

interface DraggableTakesWidgetProps extends PillProps {
  boundaryRef: RefObject<HTMLElement | null>
  visible?: boolean
  collapseResetKey?: string
}

/**
 * The takes, as a ball.
 *
 * On a surface where the part is the whole screen, Best Take and Current Take
 * cannot be a panel across the middle and they cannot live on the deck either,
 * because the deck is the first thing a player puts away for a rehearsal. So
 * they fold to the same 56px ball every other tool uses, and open into the
 * compact pills the Tuner tab already uses — no second way of drawing a take.
 */
export default function DraggableTakesWidget({
  boundaryRef, visible = true, collapseResetKey, ...pills
}: DraggableTakesWidgetProps) {
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
      widgetRef.current?.offsetWidth ?? 280, widgetRef.current?.offsetHeight ?? 150, 128,
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

  const persist = useCallback(
    () => saveWidgetPosition(POSITION_ID, dragX.get(), dragY.get()),
    [dragX, dragY],
  )

  const held = [pills.benchmarkTake, pills.libraryBenchmarkPlayback, pills.challengerTake]
    .filter(Boolean).length

  const fold = useCollapsibleWidget({
    boundaryRef, widgetRef, x: dragX, y: dragY, positionId: POSITION_ID,
    label: 'takes', icon: <Library aria-hidden />, detail: held > 0 ? `${held}` : 'Takes',
    active: held > 0, resetKey: collapseResetKey, ballSlot: 5, visible,
  })

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
      className={`takes-widget pointer-events-auto absolute left-0 top-0 z-20 touch-none ${fold.collapsed ? 'widget-is-collapsed' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={fold.panelAnimation}
      exit={{ opacity: 0, scale: 0.94, transitionEnd: motionExitHide }}
      transition={iosDragRelease}
      style={{ x: dragX, y: dragY, touchAction: 'none' }}
    >
      <WidgetCollapseButton label="takes" onCollapse={fold.collapse} />
      <div className="takes-widget__panel ui-orient-spin">
        <TunerTakePillRow compact ariaLabel="Takes" {...pills} />
      </div>
    </motion.div>
  </>
}
