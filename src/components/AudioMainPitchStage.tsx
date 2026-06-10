import type { RefObject } from 'react'
import LivePitchTuner from './LivePitchTuner'
import type { Take } from '../types'

interface AudioMainPitchStageProps {
  mediaRef: RefObject<HTMLMediaElement | null>
  take: Take
  isPlaying: boolean
  audioSessionKey: number
}

export default function AudioMainPitchStage({
  mediaRef,
  take,
  isPlaying,
  audioSessionKey,
}: AudioMainPitchStageProps) {
  const mediaKey = `main-${take.id}-${take.filePath}-${take.videoUrl}-${audioSessionKey}`

  return (
    <div className="audio-main-pitch-stage" aria-live="polite">
      <LivePitchTuner
        mediaRef={mediaRef}
        enabled
        isPlaying={isPlaying}
        mediaKey={mediaKey}
        takeName={take.name}
        label="Live Pitch"
        variant="stage"
      />
    </div>
  )
}
