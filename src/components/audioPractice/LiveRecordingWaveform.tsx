import { useRef } from 'react'
import type { RefObject } from 'react'
import { useLiveMicWaveform } from '../../hooks/useLiveMicWaveform'

interface LiveRecordingWaveformProps {
  streamRef: RefObject<MediaStream | null>
  enabled: boolean
  isRecording: boolean
  className?: string
}

export default function LiveRecordingWaveform({
  streamRef,
  enabled,
  isRecording,
  className = '',
}: LiveRecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useLiveMicWaveform(canvasRef, streamRef, enabled, isRecording ? 'record' : 'idle')

  return (
    <canvas
      ref={canvasRef}
      className={`audio-practice-live-waveform ${className}`.trim()}
      aria-hidden
    />
  )
}
