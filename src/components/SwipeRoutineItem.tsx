import { useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Trash2 } from 'lucide-react'

/** Reveal-only swipe. Vertical gestures scroll; swipes never activate the row. */
export default function SwipeRoutineItem({ title, onRemove, children }: {
  title: string; onRemove: () => void; children: ReactNode
}) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const gesture = useRef<{ x: number; y: number; start: number; horizontal: boolean; vertical: boolean } | null>(null)
  const suppressClick = useRef(false)
  const reveal = (next: boolean) => { setOpen(next); animate(x, next ? -88 : 0, { duration: .18 }) }
  return <li className="routine-swipe-row">
    <button type="button" className="routine-swipe-delete" aria-label={`Remove ${title} from this routine`}
      onFocus={() => reveal(true)} onClick={onRemove}><Trash2 aria-hidden /><span>Remove</span></button>
    <motion.div className="routine-swipe-content" style={{ x, touchAction: 'pan-y' }}
      onPointerDownCapture={event => {
        if (!event.isPrimary || event.button !== 0) return
        suppressClick.current = false
        gesture.current = { x: event.clientX, y: event.clientY, start: x.get(), horizontal: false, vertical: false }
      }}
      onPointerMoveCapture={event => {
        const state = gesture.current
        if (!state || state.vertical) return
        const dx = event.clientX - state.x, dy = event.clientY - state.y
        if (!state.horizontal && Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { state.vertical = true; return }
        if (!state.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          state.horizontal = true; suppressClick.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        if (state.horizontal) { event.preventDefault(); x.set(Math.min(0, Math.max(-88, state.start + dx))) }
      }}
      onPointerUpCapture={event => {
        if (gesture.current?.horizontal) { event.preventDefault(); reveal(x.get() < -35) }
        gesture.current = null
      }}
      onPointerCancel={() => { gesture.current = null; reveal(open) }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); reveal(false) } }}>
      {children}
    </motion.div>
  </li>
}
