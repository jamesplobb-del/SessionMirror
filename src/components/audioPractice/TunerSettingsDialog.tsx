import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PremiumMotionDiv, PremiumMotionSection } from '../ui/PremiumMotionSurface'
import { premiumMotion } from '../../utils/premiumMotion'
import TunerTranspositionMenu, { type TunerTranspositionMenuProps } from './TunerTranspositionMenu'

/** Settings need the screen's available height, outside the clipped tuner canvas. */
export default function TunerSettingsDialog(props: TunerTranspositionMenuProps) {
  const overlay = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== overlay.current,
    )
    const inertBefore = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    overlay.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      siblings.forEach((element, index) => { element.inert = inertBefore[index] })
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return createPortal(
    <PremiumMotionDiv ref={overlay} className="tuner-settings-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={premiumMotion({ duration: 0.12 }, 'backdrop')}
      onPointerDown={event => { if (event.target === event.currentTarget) props.onClose() }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose() }
        if (event.key !== 'Tab') return
        const controls = Array.from(overlay.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') ?? [])
          .filter(element => element.getClientRects().length > 0)
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
      }}>
      <PremiumMotionSection className="pitch-living-transposition-panel" role="dialog"
        aria-modal="true" aria-label="Tuner settings"
        initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16 }}
        transition={premiumMotion({ duration: 0.12 }, 'panel')}>
        <TunerTranspositionMenu {...props} />
      </PremiumMotionSection>
    </PremiumMotionDiv>, document.body,
  )
}
