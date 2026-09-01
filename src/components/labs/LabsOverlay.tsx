import { lazy, Suspense } from 'react'
import type { GameMicRequest } from '../../labs/useGameMicRecovery'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect, useRef, type RefObject } from 'react'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import '../../styles/labs-arcade.css'
import StaffJumperScreen from '../../labs/staffJumper/StaffJumperScreen'
import LabsMenu from './LabsMenu'

const BalanceScreen = lazy(() => import('../../labs/balance/BalanceScreen'))
const LearnInstrumentScreen = lazy(
  () => import('../../labs/learnInstrument/LearnInstrumentScreen'),
)

export type LabsRoute = 'menu' | 'staff-jumper' | 'balance' | 'learn-instrument'

interface LabsOverlayProps {
  isOpen: boolean
  route: LabsRoute
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  micPermissionBlocked: boolean
  micPermissionPending: boolean
  onClose: () => void
  onNavigate: (route: LabsRoute) => void
  onRequestMicStream: GameMicRequest
  onReleaseMicStream: () => void
}

export default function LabsOverlay({
  isOpen,
  route,
  streamRef,
  streamGeneration,
  tunerInstrument,
  tunerTransposition,
  hapticFeedback,
  micPermissionBlocked,
  micPermissionPending,
  onClose,
  onNavigate,
  onRequestMicStream,
  onReleaseMicStream,
}: LabsOverlayProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const routeRef = useRef(route)
  const onCloseRef = useRef(onClose)
  const onNavigateRef = useRef(onNavigate)
  routeRef.current = route
  onCloseRef.current = onClose
  onNavigateRef.current = onNavigate

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const appRoot = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null
    const previousInert = appRoot?.inert ?? false

    document.body.style.overflow = 'hidden'
    if (appRoot) {
      appRoot.inert = true
      appRoot.setAttribute('aria-hidden', 'true')
    }

    const getFocusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        (element) =>
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.tabIndex >= 0,
      )

    const focusFrame = window.requestAnimationFrame(() => {
      getFocusable()[0]?.focus() ?? dialogRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (routeRef.current === 'menu') onCloseRef.current()
        else onNavigateRef.current('menu')
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const activeElement = document.activeElement
      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (appRoot) {
        appRoot.inert = previousInert
        if (previousAriaHidden == null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) return
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      firstFocusable?.focus() ?? dialog.focus()
    })
    return () => window.cancelAnimationFrame(focusFrame)
  }, [isOpen, route])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          key="labs-overlay"
          className="labs-overlay fixed inset-0 z-[135] flex flex-col"
          tabIndex={-1}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
          role="dialog"
          aria-modal="true"
          aria-label="Practice Games"
        >
          {route === 'menu' ? (
            <LabsMenu
              hapticFeedback={hapticFeedback}
              onOpenStaffJumper={() => onNavigate('staff-jumper')}
              onOpenBalance={() => onNavigate('balance')}
              onOpenLearnInstrument={() => onNavigate('learn-instrument')}
              onBack={onClose}
            />
          ) : route === 'staff-jumper' ? (
            <StaffJumperScreen
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              tunerInstrument={tunerInstrument}
              hapticFeedback={hapticFeedback}
              onRequestMicStream={onRequestMicStream}
              onBack={() => onNavigate('menu')}
            />
          ) : route === 'balance' ? (
            <Suspense fallback={<div className="balance-route-loading" role="status">Opening Balance…</div>}>
              <BalanceScreen
                streamRef={streamRef}
                streamGeneration={streamGeneration}
                tunerInstrument={tunerInstrument}
                tunerTransposition={tunerTransposition}
                hapticFeedback={hapticFeedback}
                micPermissionBlocked={micPermissionBlocked}
                micPermissionPending={micPermissionPending}
                onRequestMicStream={onRequestMicStream}
                onBack={() => onNavigate('menu')}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="learn-instrument-route-loading" role="status">Opening Learn Your Instrument…</div>}>
              <LearnInstrumentScreen
                streamRef={streamRef}
                streamGeneration={streamGeneration}
                hapticFeedback={hapticFeedback}
                micPermissionBlocked={micPermissionBlocked}
                micPermissionPending={micPermissionPending}
                onRequestMicStream={onRequestMicStream}
                onReleaseMicStream={onReleaseMicStream}
                onBack={() => onNavigate('menu')}
              />
            </Suspense>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
