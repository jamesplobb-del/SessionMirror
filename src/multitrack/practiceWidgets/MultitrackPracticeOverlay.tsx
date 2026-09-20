import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { MultitrackPracticeSettings } from '../types'

const DraggableMetronomeWidget = lazy(() => import('../../components/DraggableMetronomeWidget'))
const DraggablePitchWidget = lazy(() => import('../../components/DraggablePitchWidget'))

export default function MultitrackPracticeOverlay({ practice, isPlaying, streamRef, tunerInstrument, mediaRef, mediaKey, onHideMetronome, onHidePitch, className }: {
  practice: MultitrackPracticeSettings
  isPlaying: boolean
  streamRef: RefObject<MediaStream | null>
  tunerInstrument: TunerInstrument
  mediaRef: RefObject<HTMLMediaElement | null>
  mediaKey: string
  onHideMetronome: () => void
  onHidePitch: () => void
  className?: string
}) {
  // Balls portal into their boundary. Keep it inside the same elevated layer
  // as the expanded panels so the recording guard cannot intercept their taps.
  const boundaryRef = useRef<HTMLDivElement>(null)
  const [showNotice, setShowNotice] = useState(false)
  const hasWidgets = practice.practiceOverlayEnabled && (practice.showMetronome || practice.showPitch)
  useEffect(() => {
    setShowNotice(hasWidgets)
    if (!hasWidgets) return
    const timer = window.setTimeout(() => setShowNotice(false), 4500)
    return () => window.clearTimeout(timer)
  }, [hasWidgets])
  if (!practice.practiceOverlayEnabled) return null
  return (
    <div ref={boundaryRef} className={['multitrack-practice-overlay', className].filter(Boolean).join(' ')}>
      <Suspense fallback={null}>
        {practice.showMetronome && <DraggableMetronomeWidget boundaryRef={boundaryRef} positionId="multitrack-metronome" isTakePlaying={isPlaying} muteDuringPlayback={false} controlsLocked={isPlaying} onClose={onHideMetronome} />}
        {practice.showPitch && <DraggablePitchWidget boundaryRef={boundaryRef} positionId="multitrack-pitch" mediaRef={mediaRef} isPlaying={isPlaying} mediaKey={mediaKey} tunerInstrument={tunerInstrument} pitchSource="microphone" nativePitchProcessing liveMicEnabled micStreamRef={streamRef} onClose={onHidePitch} />}
      </Suspense>
      {showNotice && <div className="multitrack-practice-badge" role="status"><span>Practice tools stay out of your export</span><button type="button" aria-label="Dismiss practice tools notice" onClick={() => setShowNotice(false)}>×</button></div>}
    </div>
  )
}
