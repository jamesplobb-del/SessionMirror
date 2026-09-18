import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import TutorialDemo from './TutorialDemo'
import { TUTORIAL_DEMOS, type TutorialId } from './tutorialDemos'
import './tutorial-quick-view.css'

/**
 * One tutorial, on demand.
 *
 * The same demo the tips use, opened deliberately from Settings rather than
 * caught in passing — so a player who dismissed a tip, or turned tips off
 * entirely, still has somewhere to go and look it up. It is a quick view, not a
 * lesson: one card, one demo, and a way out.
 */
export default function TutorialQuickView({
  id, onClose,
}: { id: TutorialId | null; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!id) return
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // Settings is itself a sheet that closes on Escape; without this the one
      // key press would take the tutorial and the whole drawer with it.
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    const focusTimer = window.setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    }, 0)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(focusTimer)
      restoreFocus.current?.focus({ preventScroll: true })
    }
  }, [id, onClose])

  if (!id) return null
  const demo = TUTORIAL_DEMOS[id]

  return createPortal(
    <div className="tutorial-quick-view" role="dialog" aria-modal="true" aria-labelledby="tutorial-quick-view-title">
      <button type="button" className="tutorial-quick-view__scrim" aria-label="Close tutorial" onClick={onClose} />
      <div ref={cardRef} className="tutorial-quick-view__card">
        <header>
          <h2 id="tutorial-quick-view-title">{demo.title}</h2>
          <button type="button" aria-label="Close tutorial" onClick={onClose}><X aria-hidden /></button>
        </header>
        <p className="tutorial-quick-view__summary">{demo.summary}</p>
        <TutorialDemo id={id} />
        <button type="button" className="tutorial-quick-view__done" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body,
  )
}
