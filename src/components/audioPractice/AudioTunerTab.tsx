import type { RefObject } from 'react'
import DedicatedTunerScreen from './DedicatedTunerScreen'

export interface AudioTunerTabProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  ready: boolean
  isRecording: boolean
}

export default function AudioTunerTab(props: AudioTunerTabProps) {
  return (
    <section
      className="audio-practice-tuner-shell flex min-h-0 flex-1 flex-col"
      aria-label="Tuner"
    >
      <DedicatedTunerScreen {...props} />
    </section>
  )
}
