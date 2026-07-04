import { lazy, Suspense, type RefObject } from 'react'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { MultitrackPracticeSettings } from '../types'

const DraggableMetronomeWidget = lazy(() => import('../../components/DraggableMetronomeWidget'))
const DraggablePitchWidget = lazy(() => import('../../components/DraggablePitchWidget'))

export default function MultitrackPracticeOverlay({ boundaryRef, practice, isPlaying, streamRef, tunerInstrument, mediaRef, mediaKey, onHideMetronome, onHidePitch }: {
  boundaryRef: RefObject<HTMLElement | null>
  practice: MultitrackPracticeSettings
  isPlaying: boolean
  streamRef: RefObject<MediaStream | null>
  tunerInstrument: TunerInstrument
  mediaRef: RefObject<HTMLMediaElement | null>
  mediaKey: string
  onHideMetronome: () => void
  onHidePitch: () => void
}) {
  if (!practice.practiceOverlayEnabled) return null
  return (
    <div className="multitrack-practice-overlay">
      <Suspense fallback={null}>
        {practice.showMetronome && <DraggableMetronomeWidget boundaryRef={boundaryRef} positionId="multitrack-metronome" isTakePlaying={isPlaying} muteDuringPlayback={false} onClose={onHideMetronome} />}
        {practice.showPitch && <DraggablePitchWidget boundaryRef={boundaryRef} positionId="multitrack-pitch" mediaRef={mediaRef} isPlaying={isPlaying} mediaKey={mediaKey} tunerInstrument={tunerInstrument} pitchSource="microphone" liveMicEnabled micStreamRef={streamRef} onClose={onHidePitch} />}
      </Suspense>
      {(practice.showMetronome || practice.showPitch) && <div className="multitrack-practice-badge">Practice overlay — excluded from export</div>}
    </div>
  )
}
