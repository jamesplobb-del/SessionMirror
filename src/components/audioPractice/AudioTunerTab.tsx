import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import LivePitchTuner from '../LivePitchTuner'
import { useDrone } from '../../hooks/useDrone'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { DroneWaveform } from '../../utils/droneEngine'

interface AudioTunerTabProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  nativeLivePreviewActive: boolean
  ready: boolean
  isRecording: boolean
  tunerInstrument: TunerInstrument
  liveMicTunerEnabled: boolean
  droneVolume: number
  droneWaveform: DroneWaveform
  hapticFeedback: boolean
  onRequestMicStream: () => void | Promise<void>
}

function micStreamIsLive(
  stream: MediaStream | null | undefined,
  nativeLivePreviewActive: boolean,
): boolean {
  if (nativeLivePreviewActive) return true
  return Boolean(
    stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled),
  )
}

export default function AudioTunerTab({
  streamRef,
  streamGeneration,
  nativeLivePreviewActive,
  ready: _ready,
  isRecording,
  tunerInstrument,
  liveMicTunerEnabled: _liveMicTunerEnabled,
  droneVolume,
  droneWaveform,
  hapticFeedback,
  onRequestMicStream,
}: AudioTunerTabProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const normalizedVolume = droneVolume / 100
  const [micLiveEpoch, setMicLiveEpoch] = useState(0)

  const drone = useDrone({
    volume: normalizedVolume,
    waveform: droneWaveform,
    hapticFeedback,
  })

  const droneKeyboard = useMemo(
    () => ({
      activeNotes: drone.activeNotes,
      octave: drone.octave,
      onToggleNote: drone.toggleNote,
      onSoloNote: drone.soloNote,
      onIncrementOctave: drone.incrementOctave,
      onDecrementOctave: drone.decrementOctave,
    }),
    [
      drone.activeNotes,
      drone.decrementOctave,
      drone.incrementOctave,
      drone.octave,
      drone.soloNote,
      drone.toggleNote,
    ],
  )

  const micStreamLive = micStreamIsLive(streamRef.current, nativeLivePreviewActive)
  const liveMicReady = true

  useEffect(() => {
    void onRequestMicStream()
  }, [onRequestMicStream, streamGeneration, nativeLivePreviewActive])

  useEffect(() => {
    if (micStreamLive) {
      setMicLiveEpoch((epoch) => epoch + 1)
      return
    }

    let cancelled = false
    const poll = window.setInterval(() => {
      if (cancelled) return
      if (micStreamIsLive(streamRef.current, nativeLivePreviewActive)) {
        setMicLiveEpoch((epoch) => epoch + 1)
      }
    }, 160)

    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [micStreamLive, nativeLivePreviewActive, streamGeneration, streamRef])

  return (
    <section className="audio-practice-tuner-shell flex min-h-0 flex-1 flex-col" aria-label="Tuner">
      <LivePitchTuner
        variant="audio"
        mediaRef={mediaRef}
        enabled
        isPlaying={isRecording}
        mediaKey={`tuner-tab-${streamGeneration}-${micLiveEpoch}-${nativeLivePreviewActive ? 'native' : 'webkit'}`}
        label="Pitch Analysis"
        liveMicEnabled={liveMicReady}
        micStreamRef={streamRef}
        liveMicOnly
        tunerInstrument={tunerInstrument}
        drone={droneKeyboard}
      />
    </section>
  )
}
