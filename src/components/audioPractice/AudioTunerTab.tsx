import { useRef, type RefObject } from 'react'
import LivePitchTuner from '../LivePitchTuner'
import type { TunerInstrument } from '../../utils/pitchConfig'

export interface AudioTunerTabProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  ready: boolean
  isRecording: boolean
  tunerInstrument: TunerInstrument
  liveMicTunerEnabled: boolean
}

export default function AudioTunerTab({
  streamRef,
  streamGeneration,
  ready,
  isRecording,
  tunerInstrument,
  liveMicTunerEnabled,
}: AudioTunerTabProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)

  return (
    <section
      className="audio-practice-tuner-shell flex min-h-0 flex-1 flex-col"
      aria-label="Tuner"
    >
      <LivePitchTuner
        variant="audio"
        mediaRef={mediaRef}
        enabled={ready || isRecording}
        isPlaying={isRecording}
        mediaKey={`tuner-tab-${streamGeneration}`}
        label="Pitch Analysis"
        liveMicEnabled={liveMicTunerEnabled}
        micStreamRef={streamRef}
        liveMicOnly
        tunerInstrument={tunerInstrument}
      />
    </section>
  )
}
