import { Mic } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import LivePitchTuner from '../LivePitchTuner'
import { useDrone } from '../../hooks/useDrone'
import type { PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import type { DroneWaveform } from '../../utils/droneEngine'
import type { MicInputPreference } from '../../utils/appSettings'
import {
  acquireNativeTunerMonitor,
  recoverNativeTunerMonitor,
  releaseNativeTunerMonitor,
} from '../../utils/nativeAudioPitchTap'
import { isNativeCaptureSessionActive, subscribeNativeCaptureSessionActive } from '../../utils/cameraSessionState'
import { ensureNativeCameraSessionHealthy } from '../../utils/nativeCameraTest'
import {
  APP_INTERACTIVE_MEDIA_RECOVERY_EVENT,
  isAppInForeground,
  requestInteractiveMediaRecovery,
  subscribeAppForeground,
} from '../../utils/appForeground'
import { triggerLightHaptic } from '../../utils/haptics'
import { createAudioRecovery } from '../../utils/audioRecovery'
import { TUNER_DIAGNOSTICS_ENABLED, getTunerDiagnosticMode, setTunerDiagnosticMode, type TunerDiagnosticMode } from '../../utils/tunerDiagnosticMode'

interface AudioTunerTabProps {
  /** False while a sheet or another full-screen surface covers the tuner. */
  active: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  nativeLivePreviewActive: boolean
  ready: boolean
  permissionRequestInFlight: boolean
  isRecording: boolean
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
  onTunerTranspositionChange: (value: TunerTranspositionId) => void
  onTunerInstrumentChange: (value: TunerInstrument) => void
  droneWaveform: DroneWaveform
  hapticFeedback: boolean
  micInputPreference: MicInputPreference
  handsFreeEnabled: boolean
  onRequestMicStream: (
    options?: { forceRecovery?: boolean },
  ) => boolean | Promise<boolean>
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
  active,
  streamRef,
  streamGeneration,
  nativeLivePreviewActive,
  ready: _ready,
  permissionRequestInFlight,
  isRecording,
  tunerInstrument,
  tunerTransposition,
  onTunerTranspositionChange,
  onTunerInstrumentChange,
  droneWaveform,
  hapticFeedback,
  micInputPreference,
  handsFreeEnabled,
  onRequestMicStream,
}: AudioTunerTabProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [diagnosticMode, setDiagnosticMode] = useState(getTunerDiagnosticMode)
  useEffect(() => {
    if (!TUNER_DIAGNOSTICS_ENABLED || !active) return
    document.documentElement.dataset.tunerDiagnostic = diagnosticMode
    console.info(`[TunerDiagnostic] mode=${diagnosticMode}`)
    return () => { delete document.documentElement.dataset.tunerDiagnostic }
  }, [active, diagnosticMode])

  const [micLiveEpoch, setMicLiveEpoch] = useState(0)
  const [micSessionReady, setMicSessionReady] = useState(false)
  const [sourceHealth, setSourceHealth] = useState<PitchSourceHealth>('connecting')
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false)
  const [appForeground, setAppForeground] = useState(isAppInForeground)
  const automaticRecoveryAttemptsRef = useRef(0)
  const recoveryRef = useRef(createAudioRecovery())
  const micAccessRef = useRef({ active, isRecording, permissionRequestInFlight, onRequestMicStream })
  micAccessRef.current = { active, isRecording, permissionRequestInFlight, onRequestMicStream }
  const previousRecordingRef = useRef(isRecording)

  const drone = useDrone({
    volume: 1,
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

  const liveMicReady =
    active &&
    appForeground &&
    (micSessionReady ||
      micStreamIsLive(streamRef.current, nativeLivePreviewActive, isRecording))

  useEffect(() => subscribeAppForeground(setAppForeground), [])

  const recoverNativeSource = useCallback(async (): Promise<boolean> => {
    if (!active || !isAppInForeground()) return false
    if (handsFreeEnabled) {
      // `isNativeCaptureSessionActive()` is only a mirror of what JS last TOLD
      // native — an alarm or call can leave it reporting a session that no
      // longer exists. Returning that mirror unchanged meant hands-free had no
      // recovery path at all (the WebKit fallbacks below are gated behind
      // `!handsFreeEnabled`), so the tuner sat on "connecting" until the app
      // was restarted. Make native re-verify and self-heal first.
      await ensureNativeCameraSessionHealthy()
      return isNativeCaptureSessionActive()
    }
    return recoverNativeTunerMonitor(micInputPreference)
  }, [active, handsFreeEnabled, micInputPreference])

  const runTunerRecovery = useCallback(() => recoveryRef.current.run(async (isCurrent) => {
    const access = micAccessRef.current
    if (!access.active || !isAppInForeground()) return false
    // Never reconfigure capture beneath an actual recording.
    if (access.isRecording) return isNativeCaptureSessionActive()
    const nativeActive = await recoverNativeSource()
    if (!isCurrent() || !micAccessRef.current.active || !isAppInForeground()) return false
    if (nativeActive) return true
    if (handsFreeEnabled || micAccessRef.current.isRecording || micAccessRef.current.permissionRequestInFlight) return false
    return Boolean(await micAccessRef.current.onRequestMicStream({ forceRecovery: true }))
  }), [handsFreeEnabled, recoverNativeSource])

  useEffect(() => {
    let cancelled = false
    if (!active || !appForeground) {
      setMicSessionReady(false)
      return
    }

    setMicSessionReady(false)
    setSourceHealth('connecting')
    setShowRecoveryPrompt(false)
    automaticRecoveryAttemptsRef.current = 0
    const recovery = recoveryRef.current
    void recovery.run(async (isCurrent) => {
      let sourceActive = false
      try {
        if (handsFreeEnabled) {
          await ensureNativeCameraSessionHealthy()
          sourceActive = isNativeCaptureSessionActive()
        } else {
          sourceActive = await acquireNativeTunerMonitor(micInputPreference)
          if (!cancelled && isCurrent() && micAccessRef.current.active && isAppInForeground() &&
              !sourceActive && !micAccessRef.current.isRecording && !micAccessRef.current.permissionRequestInFlight) {
            sourceActive = Boolean(await micAccessRef.current.onRequestMicStream({ forceRecovery: true }))
          }
        }
      } catch (error) {
        console.warn('[AudioTuner] microphone startup failed', error)
      }
      return sourceActive
    }).then((sourceActive) => {
      if (cancelled) return
      setMicSessionReady(sourceActive)
      if (sourceActive) {
        setMicLiveEpoch((epoch) => epoch + 1)
      } else {
        setSourceHealth('stalled')
        setShowRecoveryPrompt(true)
      }
    })

    return () => {
      cancelled = true
      recovery.cancel()
      setMicSessionReady(false)
      if (!handsFreeEnabled) void releaseNativeTunerMonitor()
    }
  }, [
    active,
    appForeground,
    handsFreeEnabled,
    micInputPreference,
  ])

  useEffect(() => {
    if (!active || !appForeground) return
    const observeCapture = () => {
      if (isNativeCaptureSessionActive() || micStreamIsLive(streamRef.current, nativeLivePreviewActive, isRecording)) {
        setMicSessionReady(true)
      }
    }
    observeCapture()
    return subscribeNativeCaptureSessionActive(observeCapture)
  }, [active, appForeground, isRecording, nativeLivePreviewActive, streamGeneration, streamRef])

  useEffect(() => {
    const wasRecording = previousRecordingRef.current
    previousRecordingRef.current = isRecording
    // The monitor-acquisition effect above owns initial startup. Recover only
    // after recording actually relinquishes the microphone; running both on
    // mount needlessly reconfigured the same AVCaptureSession twice.
    if (!active || isRecording || !wasRecording) return
    let cancelled = false
    void runTunerRecovery().then((active) => {
      if (!cancelled && active) {
        setMicSessionReady(true)
        setMicLiveEpoch((epoch) => epoch + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [active, isRecording, runTunerRecovery])

  const handleSourceHealthChange = useCallback((health: PitchSourceHealth) => {
    setSourceHealth(health)
    if (health === 'healthy') {
      automaticRecoveryAttemptsRef.current = 0
      setMicSessionReady(true)
      setShowRecoveryPrompt(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const recoverTunerMic = async (event: Event) => {
      if (!active || !isAppInForeground()) return
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason
      if (!reason?.startsWith('tuner-')) return
      if (reason !== 'tuner-auto-source-stalled') {
        automaticRecoveryAttemptsRef.current = 0
      }
      setShowRecoveryPrompt(false)
      setSourceHealth('connecting')
      const nativeActive = await runTunerRecovery()
      if (cancelled) return
      setMicSessionReady(nativeActive)
      if (nativeActive) setMicLiveEpoch((epoch) => epoch + 1)
      else setShowRecoveryPrompt(true)
    }
    window.addEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, recoverTunerMic)
    return () => {
      cancelled = true
      window.removeEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, recoverTunerMic)
    }
  }, [
    active,
    runTunerRecovery,
  ])

  useEffect(() => {
    if (
      !active ||
      !appForeground ||
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
  }, [active, appForeground, isRecording, permissionRequestInFlight, sourceHealth])

  // The pitch tracker's delivery watchdog owns stall detection. A second
  // timer here used to open WebKit capture while native startup was pending.
  // Foreground changes are handled by the acquisition effect above.

  const reactivateTuner = useCallback(() => {
    triggerLightHaptic(hapticFeedback)
    automaticRecoveryAttemptsRef.current = 0
    setShowRecoveryPrompt(false)
    setSourceHealth('connecting')
    void runTunerRecovery().then((sourceActive) => {
      if (!micAccessRef.current.active || !isAppInForeground()) return
      setMicSessionReady(sourceActive)
      if (sourceActive) {
        setMicLiveEpoch((epoch) => epoch + 1)
      } else {
        setSourceHealth('stalled')
        setShowRecoveryPrompt(true)
      }
    })
  }, [hapticFeedback, runTunerRecovery])

  return (
    <section
      className="audio-practice-tuner-shell relative flex min-h-0 flex-1 flex-col"
      aria-label="Tuner"
    >
      {TUNER_DIAGNOSTICS_ENABLED && (
        <label style={{ position: 'absolute', right: 8, top: 4, zIndex: 20, padding: '4px 8px', borderRadius: 8, background: '#172b38', color: '#fff', fontSize: 11 }}>
          Crash test{' '}
          <select
            aria-label="Tuner crash isolation mode"
            disabled={isRecording}
            value={diagnosticMode}
            style={{ color: '#fff', background: '#172b38', fontSize: 11 }}
            onChange={event => {
              const mode = event.target.value as TunerDiagnosticMode
              setTunerDiagnosticMode(mode)
              setDiagnosticMode(mode)
            }}
          >
            <option value="normal">Normal</option>
            <option value="static-background">Static background</option>
            <option value="no-graph">Graph off</option>
            <option value="no-insights">Insights off</option>
            <option value="view-off">Visuals off</option>
          </select>
        </label>
      )}
      <LivePitchTuner
        key={diagnosticMode}
        variant="audio"
        nativePitchProcessing
        mediaRef={mediaRef}
        enabled={active}
        isPlaying={isRecording}
        mediaKey={`tuner-tab-${streamGeneration}-${micLiveEpoch}-${isRecording ? 'recording' : 'idle'}-${nativeLivePreviewActive || isRecording ? 'native' : 'webkit'}`}
        label="Pitch Analysis"
        liveMicEnabled={liveMicReady}
        micStreamRef={streamRef}
        liveMicOnly
        tunerInstrument={tunerInstrument}
        tunerTransposition={tunerTransposition}
        onTunerTranspositionChange={onTunerTranspositionChange}
        onTunerInstrumentChange={onTunerInstrumentChange}
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
