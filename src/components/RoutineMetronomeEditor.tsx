import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { PremiumMotionDiv } from './ui/PremiumMotionSurface'
import { premiumMotion } from '../utils/premiumMotion'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import AudioPracticeMetronomeView from './audioPractice/AudioPracticeMetronomeView'
import { sharedMetronomeEngine } from '../metronome/sharedMetronomeEngine'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import type { MetronomePrefs } from '../utils/metronomeConfig'

function readEngine(): MetronomePrefs {
  const snapshot = sharedMetronomeEngine.getSnapshot()
  return normalizeDeskMetronome({
    bpm: snapshot.bpm,
    meter: snapshot.meter,
    subdivision: snapshot.subdivision,
    pulseModeId: snapshot.pulseModeId,
    feelId: snapshot.feelId,
    accentLevels: snapshot.accentLevels,
    soundId: snapshot.soundId,
  })
}

/** Order matters: meter resets the pulse, which resets feel and subdivision. */
function writeEngine(prefs: MetronomePrefs): void {
  sharedMetronomeEngine.setMeter(prefs.meter)
  if (prefs.pulseModeId) sharedMetronomeEngine.setPulseMode(prefs.pulseModeId)
  if (prefs.feelId) sharedMetronomeEngine.setFeel(prefs.feelId)
  sharedMetronomeEngine.setSubdivision(prefs.subdivision)
  sharedMetronomeEngine.setAccentLevels(prefs.accentLevels)
  sharedMetronomeEngine.setSoundId(prefs.soundId)
  sharedMetronomeEngine.setBpm(prefs.bpm)
}

/**
 * The real metronome, opened to set one routine item's click.
 *
 * It drives the shared engine rather than a private copy so the tempo can be
 * heard while it is chosen — picking a tempo silently is guesswork for a
 * player. The engine is the workspace's own metronome, so whatever it was set
 * to is put back on the way out and only Save copies the settings onto the
 * step.
 */
export default function RoutineMetronomeEditor({ isOpen, value, itemTitle, onSave, onClose }: {
  isOpen: boolean
  value: MetronomePrefs
  itemTitle?: string
  onSave: (prefs: MetronomePrefs) => void
  onClose: () => void
}) {
  const reduced = useReducedMotion()
  const restoreRef = useRef<MetronomePrefs | null>(null)
  const savedRef = useRef<MetronomePrefs | null>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  // Read through a ref: reopening must seed from the step, but a re-render
  // while the editor is up must not yank the engine back mid-edit.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (!isOpen) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== screenRef.current)
    const inert = siblings.map(node => node.inert)
    siblings.forEach(node => { node.inert = true })
    const frame = requestAnimationFrame(() => screenRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      siblings.forEach((node, index) => { node.inert = inert[index] })
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    restoreRef.current = readEngine()
    savedRef.current = null
    sharedMetronomeEngine.stop()
    writeEngine(normalizeDeskMetronome(valueRef.current))

    return () => {
      // Silence first: the settings being put back belong to the workspace, and
      // a click left running here would be this item's tempo, not the room's.
      sharedMetronomeEngine.stop()
      const restore = restoreRef.current
      restoreRef.current = null
      if (restore) writeEngine(restore)
    }
  }, [isOpen])

  const save = () => {
    savedRef.current = readEngine()
    onSave(savedRef.current)
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>{isOpen && <PremiumMotionDiv
      initial={{ opacity: 0, y: reduced ? 0 : 30, scale: reduced ? 1 : .975 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduced ? 0 : 18, scale: reduced ? 1 : .985, transition: { duration: reduced ? .1 : .27 } }}
      transition={premiumMotion({ duration: .1 }, 'screen')}
      ref={screenRef}
      tabIndex={-1}
      className="routine-metronome-screen app-ui-overlay--audio-mode app-ui-overlay--audio-practice-metronome"
      role="dialog"
      aria-modal="true"
      aria-label="Metronome settings for this item"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
        if (event.key === 'Tab') {
          // This portal sits outside the Practice Hub's own focus boundary.
          event.stopPropagation()
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(node => node.getClientRects().length > 0)
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
            event.preventDefault(); last?.focus()
          } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
            event.preventDefault(); first?.focus()
          }
        }
      }}
    >
      <header className="routine-metronome-screen__header">
        <button type="button" className="routine-metronome-screen__back" aria-label="Cancel metronome changes" onClick={onClose}><ArrowLeft aria-hidden /></button>
        <div className="routine-metronome-screen__title"><small>{itemTitle || 'This exercise'}</small><h2>Metronome</h2></div>
        <button type="button" className="routine-metronome-screen__save" onClick={save}>Save</button>
      </header>
      <div className="routine-metronome-screen__stage">
        <AudioPracticeMetronomeView showVisualStyle={false} />
      </div>
    </PremiumMotionDiv>}</AnimatePresence>,
    document.body,
  )
}
