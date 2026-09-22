import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { GripHorizontal } from 'lucide-react'
import { TakesToolIcon } from './icons/toolIcons'
import { useCallback, useLayoutEffect, useRef, type ComponentProps, type RefObject } from 'react'
import WidgetCollapseButton from './WidgetCollapseButton'
import { useCollapsibleWidget } from './useCollapsibleWidget'
import type TunerTakePillRow from './audioPractice/TunerTakePillRow'
import AudioModeHome, { AudioModeTakeCard } from './audioPractice/AudioModeHome'
import {
  clampWidgetPosition, getFloatingWidgetTopCenter, loadWidgetPosition, saveWidgetPosition,
} from '../utils/floatingWidgetLayout'
import { iosDragRelease, motionExitHide } from '../utils/motionPresets'

const POSITION_ID = 'desk-takes'

type PillProps = Omit<ComponentProps<typeof TunerTakePillRow>, 'compact' | 'ariaLabel'>

interface DraggableTakesWidgetProps extends PillProps {
  boundaryRef: RefObject<HTMLElement | null>
  takeReadiness?: ComponentProps<typeof AudioModeHome>['takeReadiness']
  onRetryTakePreparation?: (id: string) => void
  onShareBenchmark?: () => void
  onShareChallenger?: () => void
  isRecording?: boolean
  visible?: boolean
  collapseResetKey?: string
}

/** Full take controls on the music desk; only the header starts a drag. */
export default function DraggableTakesWidget({
  boundaryRef, visible = true, collapseResetKey, ...pills
}: DraggableTakesWidgetProps) {
  const dragControls = useDragControls()
  const bestTargetRef = useRef<HTMLElement | null>(null)
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
    label: 'takes', icon: <TakesToolIcon aria-hidden />, detail: held > 0 ? `${held}` : 'Takes',
    active: held > 0, resetKey: collapseResetKey, ballSlot: 5, visible,
  })

  return <>
    {fold.ball}
    <motion.div
      ref={widgetRef}
      aria-hidden={fold.collapsed}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      onDragEnd={persist}
      className={`takes-widget pointer-events-auto absolute left-0 top-0 z-20 ${fold.collapsed ? 'widget-is-collapsed' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={fold.panelAnimation}
      exit={{ opacity: 0, scale: 0.94, transitionEnd: motionExitHide }}
      transition={iosDragRelease}
      style={{ x: dragX, y: dragY }}
    >
      <div className="takes-widget__panel" data-guidance="music-takes" aria-label="Music takes">
        <header className="takes-widget__header" onPointerDown={event => {
          if (!(event.target as HTMLElement).closest('button')) dragControls.start(event)
        }}><span><GripHorizontal aria-hidden />Takes</span><WidgetCollapseButton label="takes" onCollapse={fold.collapse} /></header>
        <div className="takes-widget__cards" inert={pills.isRecording || undefined}>
          <AudioModeTakeCard bestTargetRef={bestTargetRef} label="Best Take" tone="best"
            take={pills.benchmarkTake} libraryPlayback={pills.libraryBenchmarkPlayback}
            onOpen={pills.onExpandBenchmark} onClear={pills.onClearBenchmark}
            onShare={pills.libraryBenchmarkPlayback ? undefined : pills.onShareBenchmark}
            readiness={pills.benchmarkTake ? pills.takeReadiness?.[pills.benchmarkTake.id] : undefined}
            onRetryPreparation={() => { if (pills.benchmarkTake) pills.onRetryTakePreparation?.(pills.benchmarkTake.id) }}
            emptyHint="Pin a take to keep it here." />
          <AudioModeTakeCard bestTargetRef={bestTargetRef} label="Current Take" tone="current"
            take={pills.challengerTake} onOpen={pills.onExpandChallenger} onClear={pills.onClearChallenger}
            onFavorite={pills.onPinCurrentAsBest} onShare={pills.onShareChallenger}
            readiness={pills.challengerTake ? pills.takeReadiness?.[pills.challengerTake.id] : undefined}
            onRetryPreparation={() => { if (pills.challengerTake) pills.onRetryTakePreparation?.(pills.challengerTake.id) }}
            emptyHint="Your next recording appears here." />
        </div>
        {pills.isRecording && <p className="takes-widget__status" role="status">Recording… Listen back when you stop.</p>}
      </div>
    </motion.div>
  </>
}
