import { Mic } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import LivePitchTuner from '../LivePitchTuner'
import { useDrone } from '../../hooks/useDrone'
import type { PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { DroneWaveform } from '../../utils/droneEngine'
import {
  APP_INTERACTIVE_MEDIA_RECOVERY_EVENT,
  requestInteractiveMediaRecovery,
} from '../../utils/appForeground'
import { triggerLightHaptic } from '../../utils/haptics'

interface AudioTunerTabProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  nativeLivePreviewActive: boolean
  ready: boolean
  permissionRequestInFlight: boolean
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
  recording: boolean,
): boolean {
  if (nativeLivePreviewActive || recording) return true
  return Boolean(
    stream?.active &&
      stream
        .getAudioTracks()
        .some((track) => track.readyState === 'live' && track.enabled && !track.muted),
  )
}

export default function AudioTunerTab({
  streamRef,
  streamGeneration,
  nativeLivePreviewActive,
  ready: _ready,
  permissionRequestInFlight,
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
  const [sourceHealth, setSourceHealth] = useState<PitchSourceHealth>('connecting')
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false)
  const automaticRecoveryAttemptsRef = useRef(0)

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
      onGlissNote: drone.glissNote,
      onSetNotes: drone.setNotes,
      onIncrementOctave: drone.incrementOctave,
      onDecrementOctave: drone.decrementOctave,
      hapticsEnabled: hapticFeedback,
    }),
    [
      drone.activeNotes,
      drone.decrementOctave,
      drone.incrementOctave,
      drone.glissNote,
      drone.octave,
      drone.setNotes,
      drone.toggleNote,
      hapticFeedback,
    ],
  )

  const liveMicReady = true

  const handleSourceHealthChange = useCallback((health: PitchSourceHealth) => {
    setSourceHealth(health)
    if (health === 'healthy') {
      automaticRecoveryAttemptsRef.current = 0
      setShowRecoveryPrompt(false)
    }
  }, [])

  useEffect(() => {
    const recoverTunerMic = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason
      if (reason !== 'tuner-auto-source-stalled') {
        automaticRecoveryAttemptsRef.current = 0
      }
      setShowRecoveryPrompt(false)
      setSourceHealth('connecting')
      if (!permissionRequestInFlight) {
        void onRequestMicStream()
      }
      setMicLiveEpoch((epoch) => epoch + 1)
    }
    window.addEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, recoverTunerMic)
    return () => {
      window.removeEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, recoverTunerMic)
    }
  }, [onRequestMicStream, permissionRequestInFlight])

  useEffect(() => {
    if (
      sourceHealth !== 'stalled' ||
      isRecording ||
      permissionRequestInFlight
    ) {
      return
    }

    if (automaticRecoveryAttemptsRef.current >= 2) {
      setShowRecoveryPrompt(true)
      return
    }

    automaticRecoveryAttemptsRef.current += 1
    requestInteractiveMediaRecovery('tuner-auto-source-stalled')
  }, [isRecording, permissionRequestInFlight, sourceHealth])

  useEffect(() => {
    let cancelled = false
    let sourceWasLive = micStreamIsLive(
      streamRef.current,
      nativeLivePreviewActive,
      isRecording,
    )
    let retryTimer: number | null = null

    const verifyMicSource = () => {
      if (cancelled) return

      const sourceIsLive = micStreamIsLive(
        streamRef.current,
        nativeLivePreviewActive,
        isRecording,
      )

      if (sourceIsLive && !sourceWasLive) {
        setMicLiveEpoch((epoch) => epoch + 1)
      }
      if (!sourceIsLive && !isRecording && !permissionRequestInFlight) {
        void onRequestMicStream()
      }

      sourceWasLive = sourceIsLive
      retryTimer = window.setTimeout(verifyMicSource, sourceIsLive ? 1500 : 500)
    }

    retryTimer = window.setTimeout(verifyMicSource, sourceWasLive ? 1500 : 650)

    return () => {
      cancelled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [
    isRecording,
    nativeLivePreviewActive,
    onRequestMicStream,
    permissionRequestInFlight,
    streamGeneration,
    streamRef,
  ])

  const reactivateTuner = useCallback(() => {
    triggerLightHaptic(hapticFeedback)
    automaticRecoveryAttemptsRef.current = 0
    setShowRecoveryPrompt(false)
    setSourceHealth('connecting')
    requestInteractiveMediaRecovery('tuner-manual-reactivate')
  }, [hapticFeedback])

  return (
    <section
      className="audio-practice-tuner-shell relative flex min-h-0 flex-1 flex-col"
      aria-label="Tuner"
    >
      <LivePitchTuner
        variant="audio"
        mediaRef={mediaRef}
        enabled
        isPlaying={isRecording}
        mediaKey={`tuner-tab-${streamGeneration}-${micLiveEpoch}-${isRecording ? 'recording' : 'idle'}-${nativeLivePreviewActive || isRecording ? 'native' : 'webkit'}`}
        label="Pitch Analysis"
        liveMicEnabled={liveMicReady}
        micStreamRef={streamRef}
        liveMicOnly
        tunerInstrument={tunerInstrument}
        drone={droneKeyboard}
        onLiveSourceHealthChange={handleSourceHealthChange}
      />
      {showRecoveryPrompt && !isRecording ? (
        <button
          type="button"
          className="pitch-tuner-recovery"
          onClick={reactivateTuner}
          aria-label="Reactivate tuner microphone"
        >
          <span className="pitch-tuner-recovery__prompt">
            <Mic aria-hidden />
            <strong>Tap to reactivate tuner</strong>
            <small>Microphone connection paused</small>
          </span>
        </button>
      ) : null}
    </section>
  )
}
