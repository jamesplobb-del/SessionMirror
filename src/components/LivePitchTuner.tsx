import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRightLeft, BarChart3, Music2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  useLivePitchTracker,
  type AcceptedPitchFrame,
  type PitchSourceHealth,
} from '../hooks/useLivePitchTracker'
import DroneSoundWheel from './audioPractice/DroneSoundWheel'
import PitchInsightsScreen from './audioPractice/PitchInsightsScreen'
import TunerTranspositionMenu from './audioPractice/TunerTranspositionMenu'
import TuningGauge from './audioPractice/TuningGauge'
import { triggerLightHaptic } from '../utils/haptics'
import {
  formatDisplayCents,
  formatFrequencyHz,
  getIntonationColor,
  getIntonationZone,
  isInTune,
  midiToNoteName,
  type PitchReadout,
} from '../utils/pitchUtils'
import type { TunerInstrument } from '../utils/pitchConfig'
import {
  DEFAULT_TUNER_TRANSPOSITION,
  getTunerTransposition,
  getWrittenPitchLabel,
  transposePitchReadout,
  type TunerTranspositionId,
} from '../utils/tunerTransposition'
import { savePitchObservation } from '../db/pitchInsightsRepository'
import { StableNoteTracker } from '../utils/stableNoteTracker'
import { useTutorialAction } from '../context/TutorialContext'
import { safeRandomUUID } from '../utils/uuid'
interface LivePitchTunerProps {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  label?: string
  variant?: 'panel' | 'dock' | 'stage' | 'widget' | 'audio'
  enabled?: boolean
  liveMicEnabled?: boolean
  micStreamRef?: RefObject<MediaStream | null>
  persistWhenPaused?: boolean
  tunerInstrument?: TunerInstrument
  /** Display detected concert pitch as the selected instrument's written note. */
  tunerTransposition?: TunerTranspositionId
  /** Audio tuner: opens the written-pitch picker and persists a selection upstream. */
  onTunerTranspositionChange?: (value: TunerTranspositionId) => void
  hapticsEnabled?: boolean
  /** Widget-only: analyze live mic instead of media element. */
  pitchSource?: 'media' | 'microphone'
  /** Audio mode: analyze live mic stream (recording or idle tuner). */
  liveMicOnly?: boolean
  /** Audio tuner only: reports whether live PCM is actually arriving. */
  onLiveSourceHealthChange?: (health: PitchSourceHealth) => void
  /** Audio tuner: show Drone, Transpose, and Pitch Insights controls. */
  audioToolsEnabled?: boolean
  /** Multi-select drone keyboard (audio tuner tab). */
  drone?: {
    activeNotes: number[]
    octave: number
    onToggleNote: (pitchClass: number) => void
    onGlissNote: (pitchClass: number, octave: number) => void
    onSetNotes: (pitchClasses: number[]) => void
    onIncrementOctave: () => void
    onDecrementOctave: () => void
    hapticsEnabled?: boolean
  }
}

const DRONE_ANALYSIS_SUPPRESS_MS = 420

function PitchChartCanvas({
  canvasRef,
  glass = false,
  fill = false,
  living = false,
  toolFree = false,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  glass?: boolean
  fill?: boolean
  living?: boolean
  toolFree?: boolean
}) {
  return (
    <div
      className={`pitch-chart-shell relative w-full flex-1 ${
        living ? 'pitch-chart-shell--living' : ''
      }`}
      style={fill ? { minHeight: '100%', height: '100%' } : { minHeight: 140, height: '100%' }}
    >
      <canvas
        ref={canvasRef}
        className={`pitch-spectrogram absolute inset-0 h-full w-full ${
          glass ? 'pitch-spectrogram--glass' : ''
        } ${living ? 'pitch-spectrogram--living' : ''} ${
          toolFree ? 'pitch-spectrogram--tool-free' : ''
        }`}
        style={fill ? { minHeight: '100%' } : { minHeight: 140 }}
      />
    </div>
  )
}

function CentsNeedle({
  cents,
  active,
  compact = false,
  large = false,
}: {
  cents: number
  active: boolean
  compact?: boolean
  large?: boolean
}) {
  const clamped = active ? Math.max(-50, Math.min(50, cents)) : 0
  const position = 50 + clamped
  const dotColor = active ? getIntonationColor(cents) : 'rgba(255,255,255,0.35)'

  return (
    <div
      className={`pitch-needle-rail relative w-full overflow-hidden ${
        large ? 'pitch-needle-rail--large' : compact ? 'pitch-needle-rail--compact' : ''
      }`}
    >
      <div className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-emerald-400/14" />
      <div className="absolute inset-y-0 left-[22%] w-[56%] rounded-full bg-amber-400/8" />
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_8px_rgba(255,255,255,0.25)] ${
          large ? 'h-4 w-4' : compact ? 'h-2.5 w-2.5' : 'h-3 w-3'
        }`}
        style={{
          left: `${position}%`,
          backgroundColor: dotColor,
          opacity: active ? 1 : 0.45,
        }}
      />
    </div>
  )
}

function StatusLabel({
  active,
  inTune,
  zone,
  isPlaying,
}: {
  active: boolean
  inTune: boolean
  zone: ReturnType<typeof getIntonationZone> | null
  isPlaying: boolean
}) {
  const text = active
    ? zone === 'green'
      ? 'In tune'
      : zone === 'yellow'
        ? 'Close'
        : 'Adjust'
    : isPlaying
      ? 'Listening'
      : 'Paused'

  return (
    <p
      className={`pitch-status-label ${inTune ? 'pitch-status-label--in-tune' : zone === 'yellow' ? 'pitch-status-label--close' : zone === 'red' ? 'pitch-status-label--adjust' : ''}`}
    >
      {text}
    </p>
  )
}

function LiveAudioTunerPane({
  readout,
  canvasRef,
  drone,
  onDroneInteraction,
  tunerInstrument,
  tunerTransposition,
  onTunerTranspositionChange,
  hapticsEnabled,
  insightsEnabled = false,
  audioToolsEnabled = true,
}: {
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  drone?: LivePitchTunerProps['drone']
  onDroneInteraction?: () => void
  tunerInstrument?: TunerInstrument
  tunerTransposition: TunerTranspositionId
  onTunerTranspositionChange?: (value: TunerTranspositionId) => void
  hapticsEnabled?: boolean
  insightsEnabled?: boolean
  audioToolsEnabled?: boolean
}) {
  const notifyTutorial = useTutorialAction()
  const [droneOpen, setDroneOpen] = useState(false)
  const [transpositionOpen, setTranspositionOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const pitchActive = readout.noteName !== '—'
  const pitchZone = pitchActive ? getIntonationZone(readout.cents) : 'idle'
  const droneActive = Boolean(drone?.activeNotes.length)
  const transposition = getTunerTransposition(tunerTransposition)
  const activeDronePitchNames = (drone?.activeNotes ?? []).map((pitchClass) =>
    getWrittenPitchLabel(pitchClass, drone?.octave ?? 4, tunerTransposition).noteName,
  )
  const droneStatus =
    activeDronePitchNames.length === 0
      ? 'Off'
      : activeDronePitchNames.length <= 3
        ? activeDronePitchNames.join(' · ')
        : `${activeDronePitchNames.slice(0, 2).join(' · ')} +${activeDronePitchNames.length - 2}`
  const droneAccessibleStatus = droneActive
    ? `Drone active. Written pitches ${activeDronePitchNames.join(', ')} for ${transposition.label}`
    : `Drone off. Pitches will be shown as written for ${transposition.label}`
  const tunerHapticsEnabled = drone?.hapticsEnabled ?? hapticsEnabled

  const toggleDrone = () => {
    triggerLightHaptic(tunerHapticsEnabled)
    notifyTutorial?.(droneOpen ? 'tuner-drone-closed' : 'tuner-drone-opened')
    setTranspositionOpen(false)
    setDroneOpen((open) => !open)
  }

  const toggleTransposition = () => {
    triggerLightHaptic(tunerHapticsEnabled)
    setDroneOpen(false)
    setTranspositionOpen((open) => !open)
  }

  const selectTransposition = (value: TunerTranspositionId) => {
    triggerLightHaptic(tunerHapticsEnabled)
    onTunerTranspositionChange?.(value)
    setTranspositionOpen(false)
  }

  const openInsights = () => {
    triggerLightHaptic(tunerHapticsEnabled)
    setDroneOpen(false)
    setTranspositionOpen(false)
    setInsightsOpen(true)
  }

  return (
    <div
      className={`pitch-audio-stage pitch-audio-stage--besttake pitch-audio-stage--${pitchZone} flex min-h-0 flex-1 flex-col overflow-hidden`}
    >
      <div className="pitch-living-canvas">
        <PitchChartCanvas canvasRef={canvasRef} fill living toolFree={!audioToolsEnabled} />
        <TuningGauge readout={readout} />

        <div className="pitch-living-canvas__direction" aria-hidden>
          <span>Sharp</span>
          <span>Flat</span>
        </div>

        {audioToolsEnabled && (drone || onTunerTranspositionChange || insightsEnabled) ? (
          <>
            <div
              className={`pitch-living-tool-rail ${
                drone ? 'pitch-living-tool-rail--with-drone' : ''
              }`}
              aria-label="Tuner tools"
            >
              {drone ? (
                <button
                  type="button"
                  data-tutorial="tuner-drone-button"
                  className={`pitch-living-drone-trigger ${
                    droneActive ? 'pitch-living-drone-trigger--active' : ''
                  }`}
                  onClick={toggleDrone}
                  aria-expanded={droneOpen}
                  aria-controls="pitch-living-drone-panel"
                  aria-label={`${droneOpen ? 'Hide' : 'Open'} drone. ${droneAccessibleStatus}`}
                  title={droneOpen ? 'Hide drone' : `Open drone · ${droneStatus}`}
                >
                  <Music2 aria-hidden />
                  <span>Drone</span>
                  <small>{droneStatus}</small>
                </button>
              ) : null}

              {onTunerTranspositionChange ? (
                <button
                  type="button"
                  className={`pitch-living-drone-trigger pitch-living-transposition-trigger ${
                    tunerTransposition !== DEFAULT_TUNER_TRANSPOSITION
                      ? 'pitch-living-transposition-trigger--active'
                      : ''
                  }`}
                  onClick={toggleTransposition}
                  aria-expanded={transpositionOpen}
                  aria-controls="pitch-living-transposition-panel"
                  title={transpositionOpen ? 'Hide transposition' : 'Choose transposition'}
                >
                  <ArrowRightLeft aria-hidden />
                  <span>Transpose</span>
                  <small>{transposition.shortLabel}</small>
                </button>
              ) : null}

              {insightsEnabled ? (
                <button
                  type="button"
                  className="pitch-living-drone-trigger pitch-living-insights-trigger"
                  onClick={openInsights}
                  aria-haspopup="dialog"
                  aria-label="Open Pitch Insights"
                  title="Open Pitch Insights"
                >
                  <BarChart3 aria-hidden />
                  <span>Pitch Insights</span>
                  <small>History</small>
                </button>
              ) : null}
            </div>

            <AnimatePresence>
              {droneOpen && drone ? (
                <motion.section
                  id="pitch-living-drone-panel"
                  className="pitch-living-drone-panel"
                  initial={{ y: '105%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '105%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 390, damping: 36 }}
                  aria-label="Drone widget"
                >
                  <DroneSoundWheel
                    activeNotes={drone.activeNotes}
                    octave={drone.octave}
                    onToggleNote={drone.onToggleNote}
                    onGlissNote={drone.onGlissNote}
                    onSetNotes={drone.onSetNotes}
                    onIncrementOctave={drone.onIncrementOctave}
                    onDecrementOctave={drone.onDecrementOctave}
                    onDroneInteraction={onDroneInteraction}
                    onClose={toggleDrone}
                    hapticsEnabled={drone.hapticsEnabled}
                    tunerTransposition={tunerTransposition}
                  />
                </motion.section>
              ) : null}

              {transpositionOpen && onTunerTranspositionChange ? (
                <motion.section
                  id="pitch-living-transposition-panel"
                  className="pitch-living-transposition-panel"
                  initial={{ y: '105%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '105%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 390, damping: 36 }}
                >
                  <TunerTranspositionMenu
                    value={tunerTransposition}
                    onChange={selectTransposition}
                    onClose={toggleTransposition}
                  />
                </motion.section>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </div>

      {audioToolsEnabled && insightsEnabled ? (
        <PitchInsightsScreen
          isOpen={insightsOpen}
          onClose={() => {
            setInsightsOpen(false)
          }}
          transpositionId={tunerTransposition}
          tunerInstrument={tunerInstrument}
          formatNoteName={(midiNote) =>
            midiToNoteName(
              midiNote + getTunerTransposition(tunerTransposition).writtenOffsetSemitones,
            )
          }
          hapticFeedback={tunerHapticsEnabled}
        />
      ) : null}
    </div>
  )
}

function CompactPitchWidgetPane({
  readout,
  canvasRef,
  isPlaying,
}: {
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  isPlaying: boolean
}) {
  const active = readout.noteName !== '—'
  const cents = active ? readout.cents : 0
  const accent = active ? getIntonationColor(cents) : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(cents)
  const zone = active ? getIntonationZone(cents) : null

  return (
    <div className="pitch-widget-besttake">
      <header>
        <div>
          <strong style={{ color: accent }}>{readout.noteName}</strong>
          <span>{formatFrequencyHz(readout.frequencyHz)}</span>
        </div>
        <div className="pitch-widget-besttake__deviation">
          <strong style={{ color: accent }}>{active ? formatDisplayCents(cents) : '—'}</strong>
          <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
        </div>
      </header>
      <CentsNeedle cents={cents} active={active} compact />
      <div className="pitch-widget-besttake__chart">
        <PitchChartCanvas canvasRef={canvasRef} glass fill />
      </div>
    </div>
  )
}

function LivePitchTunerAudio({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName: _takeName,
  enabled,
  liveMicEnabled,
  micStreamRef,
  tunerInstrument = 'voice',
  tunerTransposition = DEFAULT_TUNER_TRANSPOSITION,
  onTunerTranspositionChange,
  hapticsEnabled,
  liveMicOnly = false,
  drone,
  onLiveSourceHealthChange,
  audioToolsEnabled = true,
}: {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  enabled: boolean
  liveMicEnabled: boolean
  micStreamRef?: RefObject<MediaStream | null>
  tunerInstrument?: TunerInstrument
  tunerTransposition?: TunerTranspositionId
  onTunerTranspositionChange?: (value: TunerTranspositionId) => void
  hapticsEnabled?: boolean
  liveMicOnly?: boolean
  drone?: LivePitchTunerProps['drone']
  onLiveSourceHealthChange?: (health: PitchSourceHealth) => void
  audioToolsEnabled?: boolean
}) {
  const liveCanvasRef = useRef<HTMLCanvasElement>(null)
  const playbackCanvasRef = useRef<HTMLCanvasElement>(null)
  const droneAnalysisSuppressUntilRef = useRef(0)
  const insightsSessionIdRef = useRef<string | null>(null)
  if (!insightsSessionIdRef.current) {
    insightsSessionIdRef.current = safeRandomUUID()
  }
  const insightsContextRef = useRef({
    tunerInstrument,
    transpositionId: tunerTransposition,
    sessionId: insightsSessionIdRef.current,
  })
  insightsContextRef.current = {
    ...insightsContextRef.current,
    tunerInstrument,
    transpositionId: tunerTransposition,
  }
  const stableNoteTrackerRef = useRef<StableNoteTracker | null>(null)
  if (!stableNoteTrackerRef.current) {
    stableNoteTrackerRef.current = new StableNoteTracker((observation) => {
      void savePitchObservation(observation).catch((error: unknown) => {
        console.warn('[PitchInsights] Failed to save stable observation', error)
      })
    })
  }
  // A sustained in-app drone is valid tuner context, but it is not reliable
  // evidence of the musician's own pitch. With music capture processing the
  // speaker can bleed into the microphone, so keep the live readout running
  // while excluding those frames from long-term Insights.
  const insightsSuppressedRef = useRef(Boolean(drone?.activeNotes.length))
  const insightsSuppressed = Boolean(drone?.activeNotes.length)
  insightsSuppressedRef.current = insightsSuppressed

  const handleAcceptedPitchFrame = useCallback((frame: AcceptedPitchFrame | null) => {
    const tracker = stableNoteTrackerRef.current
    if (!tracker) return
    if (!frame || insightsSuppressedRef.current) {
      tracker.finish()
      return
    }
    tracker.ingest(
      {
        midiNote: frame.readout.midi,
        noteName: frame.readout.noteName,
        centsOffset: frame.readout.cents,
        frequencyHz: frame.readout.frequencyHz,
        confidence: frame.confidence,
        timestamp: frame.timestamp,
      },
      insightsContextRef.current,
    )
  }, [])

  useEffect(() => {
    return () => stableNoteTrackerRef.current?.finish()
  }, [])

  useEffect(() => {
    if (insightsSuppressed) stableNoteTrackerRef.current?.finish()
  }, [insightsSuppressed])

  const suppressDroneAnalysis = useCallback(() => {
    droneAnalysisSuppressUntilRef.current = performance.now() + DRONE_ANALYSIS_SUPPRESS_MS
  }, [])

  const showPlayback = isPlaying && !liveMicOnly
  const showLive = liveMicOnly ? enabled : isPlaying || liveMicEnabled || enabled
  const liveTrackerEnabled =
    enabled && showLive && (!liveMicOnly || liveMicEnabled)
  const playbackTrackerEnabled = enabled && showPlayback

  const liveTrackerOptions = useMemo(
    () => ({
      source: 'microphone' as const,
      micStreamRef,
      continuousScroll: true,
      persistWhenPaused: true,
      tunerInstrument,
      realtimeMode: true,
      suppressUntilRef: droneAnalysisSuppressUntilRef,
      allowStandaloneMicFallback: liveMicOnly,
      preferNativeAudioTap: true,
      retryNativeTapOnInteractiveRecovery: liveMicOnly,
      onSourceHealthChange: onLiveSourceHealthChange,
      onAcceptedPitchFrame: liveMicOnly ? handleAcceptedPitchFrame : undefined,
    }),
    [
      handleAcceptedPitchFrame,
      liveMicOnly,
      micStreamRef,
      onLiveSourceHealthChange,
      tunerInstrument,
    ],
  )

  const playbackTrackerOptions = useMemo(
    () => ({
      source: 'media' as const,
      persistWhenPaused: true,
      tunerInstrument,
      realtimeMode: true,
    }),
    [tunerInstrument],
  )

  const liveTracker = useLivePitchTracker(
    mediaRef,
    liveTrackerEnabled,
    liveTrackerEnabled,
    `live-mic-${mediaKey}`,
    liveCanvasRef,
    'living-audio',
    liveTrackerOptions,
  )

  const playbackTracker = useLivePitchTracker(
    mediaRef,
    playbackTrackerEnabled,
    playbackTrackerEnabled,
    `${mediaKey}-playback`,
    playbackCanvasRef,
    'living-audio',
    playbackTrackerOptions,
  )

  const liveReadout = useMemo(
    () => transposePitchReadout(liveTracker.readout, tunerTransposition),
    [liveTracker.readout, tunerTransposition],
  )
  const playbackReadout = useMemo(
    () => transposePitchReadout(playbackTracker.readout, tunerTransposition),
    [playbackTracker.readout, tunerTransposition],
  )

  const paneKey = showPlayback ? 'playback' : showLive ? 'live' : 'idle'

  return (
    <div className="pitch-tuner pitch-tuner--audio flex h-full min-h-0 w-full flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={paneKey}
          className={`flex min-h-0 flex-1 flex-col ${showLive || showPlayback ? 'pitch-tuner__live-body' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          {showPlayback ? (
            <LiveAudioTunerPane
              readout={playbackReadout}
              canvasRef={playbackCanvasRef}
              drone={drone}
              onDroneInteraction={suppressDroneAnalysis}
              tunerInstrument={tunerInstrument}
              tunerTransposition={tunerTransposition}
              onTunerTranspositionChange={onTunerTranspositionChange}
              hapticsEnabled={hapticsEnabled}
              insightsEnabled={audioToolsEnabled && liveMicOnly}
              audioToolsEnabled={audioToolsEnabled}
            />
          ) : showLive ? (
            <LiveAudioTunerPane
              readout={liveReadout}
              canvasRef={liveCanvasRef}
              drone={drone}
              onDroneInteraction={suppressDroneAnalysis}
              tunerInstrument={tunerInstrument}
              tunerTransposition={tunerTransposition}
              onTunerTranspositionChange={onTunerTranspositionChange}
              hapticsEnabled={hapticsEnabled}
              insightsEnabled={audioToolsEnabled && liveMicOnly}
              audioToolsEnabled={audioToolsEnabled}
            />
          ) : (
            <div className="pitch-audio-idle-pane pitch-audio-idle-pane--polished flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="pitch-audio-idle-pane__title">Pitch Analysis</p>
              <p className="pitch-audio-idle-pane__copy">
                Enable Live Mic Tuner in Settings to practice with a live tuner, or press play to
                analyze this take.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default function LivePitchTuner({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName,
  label = 'Pitch Analysis',
  variant = 'panel',
  enabled = true,
  liveMicEnabled = true,
  micStreamRef,
  persistWhenPaused = false,
  tunerInstrument = 'voice',
  tunerTransposition = DEFAULT_TUNER_TRANSPOSITION,
  onTunerTranspositionChange,
  hapticsEnabled,
  pitchSource = 'media',
  liveMicOnly = false,
  drone,
  onLiveSourceHealthChange,
  audioToolsEnabled = true,
}: LivePitchTunerProps) {
  const isPanel = variant === 'panel'
  const isWidget = variant === 'widget'
  const isAudio = variant === 'audio'
  const isStage = variant === 'stage'
  const canvasTheme = isWidget ? 'glass-audio' : isPanel ? 'glass-legacy' : 'solid'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widgetContinuousScroll = isWidget && persistWhenPaused
  const liveMicWidget = isWidget && pitchSource === 'microphone'
  const trackerActive = enabled && !isAudio
  const trackerPlaying = liveMicWidget ? trackerActive : isPlaying
  const tracker = useLivePitchTracker(
    mediaRef,
    trackerActive,
    trackerPlaying,
    mediaKey,
    canvasRef,
    canvasTheme,
    {
      source: liveMicWidget ? 'microphone' : 'media',
      micStreamRef: liveMicWidget ? micStreamRef : undefined,
      persistWhenPaused: widgetContinuousScroll,
      continuousScroll: liveMicWidget || widgetContinuousScroll,
      tunerInstrument,
      realtimeMode: isWidget,
      preferNativeAudioTap: liveMicWidget,
    },
  )
  if (isAudio) {
    return (
      <LivePitchTunerAudio
        mediaRef={mediaRef}
        isPlaying={isPlaying}
        mediaKey={mediaKey}
        takeName={takeName}
        enabled={enabled}
        liveMicEnabled={liveMicEnabled}
        micStreamRef={micStreamRef}
        tunerInstrument={tunerInstrument}
        tunerTransposition={tunerTransposition}
        onTunerTranspositionChange={onTunerTranspositionChange}
        hapticsEnabled={hapticsEnabled}
        liveMicOnly={liveMicOnly}
        drone={drone}
        onLiveSourceHealthChange={onLiveSourceHealthChange}
        audioToolsEnabled={audioToolsEnabled}
      />
    )
  }

  const displayReadout = transposePitchReadout(tracker.readout, tunerTransposition)

  const active = displayReadout.noteName !== '—'
  const displayCents = active ? displayReadout.cents : 0
  const accent = active ? getIntonationColor(displayCents) : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(displayReadout.cents)
  const zone = active ? getIntonationZone(displayReadout.cents) : null
  const spectrogramHeight = isStage
    ? 'min-h-0 flex-1'
    : 'h-[6.5rem]'

  if (isWidget) {
    return (
      <div className="pitch-tuner pitch-tuner--widget flex h-full min-h-0 w-full flex-col">
        <div className="pitch-glass-panel pitch-glass-panel--compact pitch-glass-panel--widget pitch-glass-panel--elevated relative flex h-full min-h-0 w-full flex-col overflow-hidden">
          <CompactPitchWidgetPane
            readout={displayReadout}
            canvasRef={canvasRef}
            isPlaying={trackerPlaying}
          />
          {!widgetContinuousScroll && !isPlaying && !liveMicWidget && (
            <p className="pitch-widget-hint pointer-events-none shrink-0 px-3 pb-2 text-center">
              Pitch trace during playback
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isPanel) {
    return (
      <div className="pitch-tuner pitch-tuner--panel h-full w-full">
        <div className="pitch-glass-panel flex h-full min-h-[9.5rem] w-full flex-col overflow-hidden">
          <div className="pitch-widget-chrome flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-2">
            <div className="min-w-0">
              <p
                className="pitch-readout-display text-2xl font-bold leading-none tracking-tight"
                style={{ color: accent }}
              >
                {displayReadout.noteName}
                {active && (
                  <span className="ml-2 text-lg font-semibold">
                    {formatDisplayCents(displayReadout.cents)}
                  </span>
                )}
              </p>
            </div>
            <p
              className="pitch-readout-display shrink-0 text-sm font-bold"
              style={{ color: accent }}
            >
              {formatFrequencyHz(displayReadout.frequencyHz)}
            </p>
          </div>

          <div className="relative min-h-[5rem] flex-1 overflow-hidden px-5 pb-5">
            <PitchChartCanvas canvasRef={canvasRef} glass />
          </div>
        </div>
      </div>
    )
  }

  if (isStage) {
    return (
      <div className="pitch-tuner flex h-full w-full flex-col overflow-hidden bg-black">
        <div className="shrink-0 border-b border-white/8 px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                {label}
              </p>
              {takeName && (
                <p className="mt-0.5 truncate text-sm text-white/50">{takeName}</p>
              )}
              <p
                className="mt-2 font-mono text-6xl font-bold leading-none tabular-nums sm:text-7xl"
                style={{ color: accent }}
              >
                {displayReadout.noteName}
              </p>
              <p className="mt-1.5 font-mono text-xs text-white/35">
                {formatFrequencyHz(displayReadout.frequencyHz)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className="font-mono text-3xl font-semibold tabular-nums"
                style={{ color: accent }}
              >
                {active ? formatDisplayCents(displayReadout.cents) : '—'}
              </p>
              <div className="mt-1.5">
                <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <CentsNeedle cents={displayReadout.cents} active={active} />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-white/25">
              <span>-50</span>
              <span className="text-emerald-400/60">0</span>
              <span>+50</span>
            </div>
          </div>
        </div>

        <div className={`relative overflow-hidden ${spectrogramHeight}`}>
          <canvas ref={canvasRef} className="pitch-spectrogram absolute inset-0 h-full w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="pitch-tuner flex h-full w-full flex-col overflow-hidden bg-black/95">
      <div className="shrink-0 border-b border-white/8 px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              {label}
            </p>
            {takeName && (
              <p className="mt-0.5 truncate text-xs text-white/45">{takeName}</p>
            )}
            <p
              className="mt-1 font-mono text-5xl font-bold leading-none tabular-nums"
              style={{ color: accent }}
            >
              {displayReadout.noteName}
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/35">
              {formatFrequencyHz(displayReadout.frequencyHz)}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p
              className="font-mono text-2xl font-semibold tabular-nums"
              style={{ color: accent }}
            >
              {active ? formatDisplayCents(displayReadout.cents) : '—'}
            </p>
            <div className="mt-1">
              <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <CentsNeedle cents={displayReadout.cents} active={active} />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-white/25">
            <span>-50</span>
            <span className="text-emerald-400/60">0</span>
            <span>+50</span>
          </div>
        </div>
      </div>

      <div className={`relative shrink-0 overflow-hidden ${spectrogramHeight}`}>
        <canvas ref={canvasRef} className="pitch-spectrogram absolute inset-0 h-full w-full" />
      </div>

      {!active && !isPlaying && (
        <p className="shrink-0 py-2 text-center text-[11px] text-white/30">
          Tap play to analyze pitch
        </p>
      )}
    </div>
  )
}
